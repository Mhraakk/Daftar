// صف کارهای هوش مصنوعی مبتنی بر پایگاه داده. درخواست‌ها در جدول AiInteraction با وضعیت QUEUED ثبت می‌شوند و
// سرویس پس‌زمینه (worker) آن‌ها را با سقف هم‌زمانی تنظیمات اجرا می‌کند؛ بنابراین بسته‌شدن مرورگر یا قطع
// موقت سرور، اجرا را از بین نمی‌برد و یک مدل محلی کند با صف منظم (نه درخواست‌های هم‌زمان) کار می‌کند.
import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { db, type Tx } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { notify } from "@/lib/notify";
import { can, type SessionUser } from "@/lib/auth/guard";
import { getAiSettings, isExternalProvider, type AiSettings } from "./config";
import { providerFromSettings } from "./provider";
import { AiProviderError, type AiMessage, type AiResult } from "./types";

export const JOB_STATUS = ["QUEUED", "RUNNING", "DONE", "FAILED", "CANCELED"] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

const FLUSH_MS = 1_200;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 30_000;
const STALE_GRACE_MS = 120_000;
const MS_PER_SEC = 1_000;
const CLAIM_SCAN = 20;
const HEARTBEAT_KEY = "worker.heartbeat";
const HEARTBEAT_FRESH_MS = 90_000;
const MAX_ERROR = 1_000;
const BACKOFF_FACTOR = 2;

export interface AiJobRequest {
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
}

export interface EnqueueInput {
  userId: string;
  kind: string;
  title: string;
  prompt: string;
  request: AiJobRequest;
  contextSummary?: string;
  caseId?: string | null;
  draftId?: string | null;
  skillRunId?: string | null;
  meta?: Prisma.InputJsonObject;
}

export interface JobMeta {
  retryAt?: string;
  truncated?: boolean;
  external?: boolean;
  postError?: string;
  [k: string]: unknown;
}

/** پس‌پردازش اختصاصی هر نوع کار (ساخت پیش‌نویس، به‌روزرسانی اجرای مهارت، پیشنهاد مهلت و ...) */
export type PostProcessor = (job: { id: string; userId: string; kind: string; title: string | null; caseId: string | null; draftId: string | null; skillRunId: string | null; meta: JobMeta }, result: AiResult) => Promise<{ link?: string } | void>;
export type FailureHandler = (job: { id: string; skillRunId: string | null; kind: string }, status: "FAILED" | "CANCELED", error: string) => Promise<void>;

export async function enqueueAiJob(input: EnqueueInput, tx?: Tx): Promise<{ id: string }> {
  const settings = await getAiSettings();
  const external = isExternalProvider(settings);
  const job = await (tx ?? db).aiInteraction.create({
    data: {
      userId: input.userId, kind: input.kind, title: input.title, prompt: input.prompt,
      request: input.request as unknown as Prisma.InputJsonObject,
      contextSummary: input.contextSummary ?? null,
      provider: settings.provider, model: settings.model, status: "QUEUED",
      caseId: input.caseId ?? null, draftId: input.draftId ?? null, skillRunId: input.skillRunId ?? null,
      meta: { ...(input.meta ?? {}), external },
    },
    select: { id: true },
  });
  await audit({
    actorId: input.userId, action: "ai.job.queued", entityType: "AiInteraction", entityId: job.id, entityLabel: input.title, caseId: input.caseId ?? null,
    meta: { kind: input.kind, provider: settings.provider, model: settings.model, external, sent: input.contextSummary ?? null },
  }, tx);
  return job;
}

export async function cancelAiJob(id: string, user: SessionUser): Promise<void> {
  const job = await db.aiInteraction.findUnique({ where: { id }, select: { userId: true, status: true, title: true, caseId: true } });
  if (!job) throw new NotFoundError();
  if (job.userId !== user.id && !can(user, "ai.configure")) throw new ForbiddenError();
  const r = await db.aiInteraction.updateMany({ where: { id, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELED", finishedAt: new Date(), error: "لغو به درخواست کاربر" } });
  if (r.count) {
    await audit({ actorId: user.id, action: "ai.job.canceled", entityType: "AiInteraction", entityId: id, entityLabel: job.title, caseId: job.caseId });
    await runFailureHandler(id, "CANCELED", "لغو به درخواست کاربر");
  }
}

const metaOf = (v: Prisma.JsonValue | null): JobMeta => (v && typeof v === "object" && !Array.isArray(v) ? (v as JobMeta) : {});

/** برداشتن کارهای آماده در صف (رعایت زمان تلاش مجدد)؛ هر کار با updateMany اتمیک برداشته می‌شود */
export async function claimJobs(limit: number, now = new Date()): Promise<string[]> {
  if (limit <= 0) return [];
  const candidates = await db.aiInteraction.findMany({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" }, take: CLAIM_SCAN, select: { id: true, meta: true, skillRunId: true } });
  const ready = candidates.filter((c) => {
    const at = metaOf(c.meta).retryAt;
    return !at || new Date(at) <= now;
  }).slice(0, limit);
  const settings = await getAiSettings();
  const claimed = await Promise.all(ready.map(async (c) => {
    const r = await db.aiInteraction.updateMany({
      where: { id: c.id, status: "QUEUED" },
      data: { status: "RUNNING", startedAt: now, attempts: { increment: 1 }, provider: settings.provider, model: settings.model },
    });
    if (r.count && c.skillRunId) await db.skillRun.updateMany({ where: { id: c.skillRunId, status: "QUEUED" }, data: { status: "RUNNING" } });
    return r.count ? c.id : null;
  }));
  return claimed.filter((x): x is string => !!x);
}

const POST: Record<string, PostProcessor> = {};
const FAIL: Record<string, FailureHandler> = {};
/** ثبت پس‌پردازش برای یک پیشوند نوع کار (مثلاً «skill.» یا «assistant.draft») */
export function registerJobHandlers(prefix: string, post: PostProcessor, onFail?: FailureHandler): void {
  POST[prefix] = post;
  if (onFail) FAIL[prefix] = onFail;
}
const handlerFor = <T>(table: Record<string, T>, kind: string): T | undefined =>
  Object.entries(table).filter(([p]) => kind.startsWith(p)).sort((a, b) => b[0].length - a[0].length)[0]?.[1];

async function runFailureHandler(id: string, status: "FAILED" | "CANCELED", error: string): Promise<void> {
  const job = await db.aiInteraction.findUnique({ where: { id }, select: { id: true, skillRunId: true, kind: true } });
  const h = job ? handlerFor(FAIL, job.kind) : undefined;
  if (job && h) await h(job, status, error);
}

const RESULT_LINK = (id: string): string => `/assistant/${id}`;

/** اجرای یک کار برداشته‌شده؛ متن جزئی هر چند لحظه ذخیره و لغو کاربر اعمال می‌شود */
export async function executeJob(id: string, settingsOverride?: AiSettings): Promise<JobStatus> {
  const job = await db.aiInteraction.findUnique({ where: { id } });
  if (!job || job.status !== "RUNNING") return (job?.status as JobStatus) ?? "FAILED";
  const settings = settingsOverride ?? (await getAiSettings());
  const req = job.request as unknown as AiJobRequest | null;
  const controller = new AbortController();
  const started = Date.now();
  let partial = "";
  let flushed = "";
  let flushing = false;
  const flush = async (): Promise<void> => {
    if (flushing) return;
    flushing = true;
    try {
      const snapshot = partial;
      const cur = await db.aiInteraction.findUnique({ where: { id }, select: { status: true } });
      if (cur?.status === "CANCELED") controller.abort();
      else if (snapshot !== flushed) {
        await db.aiInteraction.updateMany({ where: { id, status: "RUNNING" }, data: { response: snapshot } });
        flushed = snapshot;
      }
    } catch (e) {
      console.error("[ai] flush failed", id, e instanceof Error ? e.message : e);
    } finally {
      flushing = false;
    }
  };
  const timer = setInterval(() => void flush(), FLUSH_MS);
  try {
    if (!settings.enabled) throw new AiProviderError("config", false, "هوش مصنوعی غیرفعال است");
    if (!req?.system || !req.messages?.length) throw new AiProviderError("config", false, "درخواست ناقص است");
    const provider = providerFromSettings(settings);
    const result = await provider.stream(
      { system: req.system, messages: req.messages, maxTokens: req.maxTokens },
      { signal: controller.signal, onText: (d) => { partial += d; } },
    );
    clearInterval(timer);
    return await complete(job.id, result, Date.now() - started);
  } catch (e) {
    clearInterval(timer);
    const err = e instanceof AiProviderError ? e : new AiProviderError("server", false, e instanceof Error ? e.message : String(e));
    return fail(job.id, err, partial, job.attempts, Date.now() - started);
  }
}

async function complete(id: string, result: AiResult, durationMs: number): Promise<JobStatus> {
  const refused = result.stopReason === "refusal";
  const truncated = result.stopReason === "max_tokens" || result.stopReason === "length";
  const current = await db.aiInteraction.findUnique({ where: { id } });
  if (!current || current.status !== "RUNNING") return (current?.status as JobStatus) ?? "FAILED";
  const meta = { ...metaOf(current.meta), truncated, servedBy: result.model };
  const status: JobStatus = refused || !result.text.trim() ? "FAILED" : "DONE";
  const emptyError = result.text.trim() ? null : "پاسخ خالی از مدل دریافت شد.";
  const error = refused ? new AiProviderError("refusal", false).message : emptyError;
  const updated = await db.aiInteraction.update({
    where: { id },
    data: {
      status, response: result.text, stopReason: result.stopReason, error, model: result.model || current.model,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens, durationMs, finishedAt: new Date(),
      meta: meta as Prisma.InputJsonObject,
    },
  });
  await audit({
    actorId: updated.userId, action: status === "DONE" ? "ai.job.completed" : "ai.job.failed", entityType: "AiInteraction", entityId: id, entityLabel: updated.title, caseId: updated.caseId,
    meta: { kind: updated.kind, provider: updated.provider, model: updated.model, inputTokens: updated.inputTokens, outputTokens: updated.outputTokens, durationMs, stopReason: updated.stopReason },
  });
  if (status === "FAILED") {
    await runFailureHandler(id, "FAILED", error ?? "");
    await notify({ userId: updated.userId, type: "ai.failed", title: `اجرای هوش مصنوعی ناموفق بود: ${updated.title ?? updated.kind}`, body: error ?? undefined, link: RESULT_LINK(id), entityType: "AiInteraction", entityId: id });
    return status;
  }
  const handler = handlerFor(POST, updated.kind);
  let link = RESULT_LINK(id);
  if (handler) {
    try {
      const r = await handler({ id, userId: updated.userId, kind: updated.kind, title: updated.title, caseId: updated.caseId, draftId: updated.draftId, skillRunId: updated.skillRunId, meta }, result);
      if (r && r.link) link = r.link;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, MAX_ERROR);
      console.error("[ai] post-process failed", id, msg);
      await db.aiInteraction.update({ where: { id }, data: { meta: { ...meta, postError: msg } as Prisma.InputJsonObject } });
    }
  }
  await notify({ userId: updated.userId, type: "ai.done", title: `نتیجه آماده است: ${updated.title ?? updated.kind}`, body: truncated ? "خروجی به سقف توکن رسید و ممکن است ناقص باشد." : "برای استفاده، بررسی انسانی لازم است.", link, entityType: "AiInteraction", entityId: id });
  return status;
}

async function fail(id: string, err: AiProviderError, partial: string, attempts: number, durationMs: number): Promise<JobStatus> {
  const current = await db.aiInteraction.findUnique({ where: { id }, select: { status: true, meta: true, userId: true, title: true, kind: true, caseId: true } });
  if (!current) return "FAILED";
  if (current.status === "CANCELED" || err.kind === "canceled") {
    await db.aiInteraction.updateMany({ where: { id }, data: { status: "CANCELED", response: partial || null, durationMs, finishedAt: new Date() } });
    await runFailureHandler(id, "CANCELED", "لغو شد");
    return "CANCELED";
  }
  const retry = err.retryable && attempts < MAX_ATTEMPTS;
  const meta = metaOf(current.meta);
  if (retry) {
    const retryAt = new Date(Date.now() + RETRY_BASE_MS * BACKOFF_FACTOR ** (attempts - 1)).toISOString();
    await db.aiInteraction.update({ where: { id }, data: { status: "QUEUED", error: err.message.slice(0, MAX_ERROR), response: null, meta: { ...meta, retryAt } as Prisma.InputJsonObject } });
    return "QUEUED";
  }
  await db.aiInteraction.update({ where: { id }, data: { status: "FAILED", error: err.message.slice(0, MAX_ERROR), response: partial || null, durationMs, finishedAt: new Date() } });
  await audit({ actorId: current.userId, action: "ai.job.failed", entityType: "AiInteraction", entityId: id, entityLabel: current.title, caseId: current.caseId, meta: { kind: current.kind, error: err.kind, status: err.status ?? null } });
  await runFailureHandler(id, "FAILED", err.message);
  await notify({ userId: current.userId, type: "ai.failed", title: `اجرای هوش مصنوعی ناموفق بود: ${current.title ?? current.kind}`, body: err.message.slice(0, MAX_ERROR), link: RESULT_LINK(id), entityType: "AiInteraction", entityId: id, important: false });
  return "FAILED";
}

/** کارهایی که به‌علت توقف ناگهانی worker در وضعیت RUNNING مانده‌اند به صف بازمی‌گردند (یا پس از سقف تلاش، ناموفق می‌شوند) */
export async function recoverStaleJobs(timeoutSec: number, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - timeoutSec * MS_PER_SEC - STALE_GRACE_MS);
  const stale = await db.aiInteraction.findMany({ where: { status: "RUNNING", startedAt: { lt: cutoff } }, select: { id: true, attempts: true } });
  await Promise.all(stale.map((j) => (j.attempts < MAX_ATTEMPTS
    ? db.aiInteraction.updateMany({ where: { id: j.id, status: "RUNNING" }, data: { status: "QUEUED", error: "اجرای قبلی ناتمام ماند؛ دوباره در صف قرار گرفت." } })
    : db.aiInteraction.updateMany({ where: { id: j.id, status: "RUNNING" }, data: { status: "FAILED", error: "اجرا پس از چند تلاش کامل نشد.", finishedAt: now } }))));
  return stale.length;
}

/** هنگام خاموش‌شدن منظم worker: کارهای در حال اجرا به صف برمی‌گردند تا پس از راه‌اندازی ادامه یابند */
export async function requeueJobs(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.aiInteraction.updateMany({ where: { id: { in: ids }, status: "RUNNING" }, data: { status: "QUEUED", response: null, attempts: { decrement: 1 } } });
}

export async function writeHeartbeat(info: { startedAt: string; running: number; pid: number }): Promise<void> {
  const value = { ...info, at: new Date().toISOString() };
  await db.setting.upsert({ where: { key: HEARTBEAT_KEY }, create: { key: HEARTBEAT_KEY, value }, update: { value } });
}

export interface QueueState {
  queued: number;
  running: number;
  workerAlive: boolean;
  heartbeatAt: string | null;
}

export async function getQueueState(): Promise<QueueState> {
  const [queued, running, hb] = await Promise.all([
    db.aiInteraction.count({ where: { status: "QUEUED" } }),
    db.aiInteraction.count({ where: { status: "RUNNING" } }),
    db.setting.findUnique({ where: { key: HEARTBEAT_KEY } }),
  ]);
  const at = (hb?.value as { at?: string } | undefined)?.at ?? null;
  return { queued, running, heartbeatAt: at, workerAlive: !!at && Date.now() - new Date(at).getTime() < HEARTBEAT_FRESH_MS };
}

/** دسترسی به یک کار: مالک کار، یا دارنده مجوز پیکربندی هوش مصنوعی */
export async function getJobForUser(id: string, user: SessionUser) {
  const job = await db.aiInteraction.findUnique({ where: { id }, include: { case: { select: { id: true, number: true, title: true } }, draft: { select: { id: true, title: true } } } });
  if (!job) throw new NotFoundError();
  if (job.userId !== user.id && !can(user, "ai.configure")) {
    await audit({ actorId: user.id, action: "security.forbidden", entityType: "AiInteraction", entityId: id });
    throw new NotFoundError();
  }
  return job;
}
