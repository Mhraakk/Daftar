// اتصال‌های بیرونی دفتر. هر اتصال جداگانه پیکربندی می‌شود، پیش‌فرض خاموش است و خطای آن بقیه سامانه را متوقف نمی‌کند:
// - legal_web: ورود متن از نشانی‌های رسمی مجاز (فهرست سفید دامنه‌ها) به کتابخانه حقوقی، با تاریخ بازیابی و وضعیت «تأییدنشده»
// - messenger_bot: ارسال اعلان‌های مهم به پیام‌رسان با Bot API سازگار با تلگرام (مانند «بله» یا تلگرام)
import { parse as parseHtml } from "node-html-parser";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth/guard";
import { isPrivateHost } from "@/server/ai/config";
import { decryptSecret, encryptSecret } from "@/server/ai/secret";

const MS_PER_SEC = 1_000;
const FETCH_TIMEOUT_SEC = 20;
const MAX_PAGE_BYTES = 3_000_000;
const MAX_TEXT_CHARS = 400_000;
const MAX_TITLE = 300;
const PUSH_BATCH = 30;
const PUSH_WINDOW_HOURS = 24;
const MS_PER_HOUR = 3_600_000;
const MAX_ERROR = 500;
const MAX_MESSAGE = 3_500;
const MAX_DOMAINS_TEXT = 2_000;
const MAX_TOKEN = 300;
const HTTP_REDIRECT_MIN = 300;
const HTTP_REDIRECT_MAX = 400;
const MIN_TEXT_CHARS = 20;
const SEPARATORS = [",", "،", "\n", "\t", ";"];

/** فهرست دامنه‌ها با جداکننده ویرگول، ویرگول فارسی، فاصله یا خط تازه */
const splitList = (v: string): string[] =>
  SEPARATORS.reduce((acc, sep) => acc.split(sep).join(" "), v).split(" ").map((d) => d.trim().toLowerCase()).filter(Boolean);

export const CONNECTOR_DEFS = {
  legal_web: { name: "منابع حقوقی رسمی (ورود متن از وب)", kind: "LEGAL_WEB" },
  messenger_bot: { name: "اعلان در پیام‌رسان (Bot API بله / تلگرام)", kind: "MESSENGER" },
} as const;
export type ConnectorKey = keyof typeof CONNECTOR_DEFS;

export interface LegalWebConfig { domains: string[] }
export interface MessengerConfig { baseUrl: string; minimal: boolean; types: string[] }

const DEFAULT_PUSH_TYPES = ["deadline.reminder", "deadline.overdue", "task.overdue", "event.reminder"];
export const PUSHABLE_TYPES: Record<string, string> = {
  "deadline.reminder": "یادآوری مهلت", "deadline.overdue": "مهلت معوق", "task.overdue": "وظیفه معوق", "event.reminder": "یادآوری رویداد",
  "task.assigned": "ارجاع وظیفه", "draft.review_requested": "درخواست بررسی سند", "ai.done": "آماده‌شدن نتیجه هوش مصنوعی",
};

export const legalWebSchema = z.object({
  enabled: z.boolean(),
  domains: z.string().trim().max(MAX_DOMAINS_TEXT).transform(splitList),
});
export const messengerSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().trim().url("نشانی معتبر نیست."),
  token: z.string().trim().max(MAX_TOKEN).optional().nullable(),
  minimal: z.boolean(),
  types: z.array(z.string()).default(DEFAULT_PUSH_TYPES),
});

export async function getConnector(key: ConnectorKey) {
  const c = await db.connector.findUnique({ where: { key } });
  if (c) return c;
  return db.connector.create({ data: { key, name: CONNECTOR_DEFS[key].name, kind: CONNECTOR_DEFS[key].kind } });
}

const configOf = <T>(v: Prisma.JsonValue, fallback: T): T => ({ ...fallback, ...((v && typeof v === "object" && !Array.isArray(v) ? v : {}) as object) } as T);
export const legalWebConfig = (v: Prisma.JsonValue): LegalWebConfig => configOf(v, { domains: [] as string[] });
export const messengerConfig = (v: Prisma.JsonValue): MessengerConfig => configOf(v, { baseUrl: "", minimal: true, types: DEFAULT_PUSH_TYPES });

export async function saveLegalWeb(input: z.infer<typeof legalWebSchema>, actor: SessionUser): Promise<void> {
  const bad = input.domains.filter((d) => d.includes("/") || d.includes(":") || isPrivateHost(d));
  if (bad.length) throw new AppError(`دامنه نامعتبر یا داخلی: ${bad.join("، ")}`);
  await getConnector("legal_web");
  await db.connector.update({ where: { key: "legal_web" }, data: { enabled: input.enabled, config: { domains: input.domains }, status: input.enabled ? "CONFIGURED" : "NOT_CONFIGURED", updatedById: actor.id } });
  await audit({ actorId: actor.id, action: "connector.updated", entityType: "Connector", entityId: "legal_web", entityLabel: CONNECTOR_DEFS.legal_web.name, meta: { enabled: input.enabled, domains: input.domains } });
}

export async function saveMessenger(input: z.infer<typeof messengerSchema>, actor: SessionUser): Promise<void> {
  const prev = await getConnector("messenger_bot");
  const token = input.token?.trim();
  const secretEnc = token ? encryptSecret(token) : prev.secretEnc;
  if (input.enabled && !secretEnc) throw new AppError("برای فعال‌سازی، توکن ربات را وارد کنید.");
  await db.connector.update({
    where: { key: "messenger_bot" },
    data: { enabled: input.enabled, secretEnc, config: { baseUrl: input.baseUrl, minimal: input.minimal, types: input.types }, status: input.enabled ? "CONFIGURED" : "NOT_CONFIGURED", lastError: null, updatedById: actor.id },
  });
  await audit({ actorId: actor.id, action: "connector.updated", entityType: "Connector", entityId: "messenger_bot", entityLabel: CONNECTOR_DEFS.messenger_bot.name, meta: { enabled: input.enabled, baseUrl: input.baseUrl, minimal: input.minimal, tokenChanged: !!token, types: input.types } });
}

// ───────── ورود متن از منبع رسمی ─────────

function htmlToText(html: string): { title: string; text: string } {
  const root = parseHtml(html, { blockTextElements: { script: false, style: false, noscript: false } });
  root.querySelectorAll("script,style,noscript,nav,header,footer,iframe,form").forEach((n) => n.remove());
  const title = (root.querySelector("title")?.text ?? root.querySelector("h1")?.text ?? "").trim();
  const body = root.querySelector("main") ?? root.querySelector("article") ?? root.querySelector("body") ?? root;
  const text = body.structuredText.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  return { title, text };
}

export async function importFromUrl(rawUrl: string, user: SessionUser, fetchImpl: typeof fetch = fetch): Promise<{ id: string }> {
  const conn = await getConnector("legal_web");
  if (!conn.enabled) throw new AppError("اتصال «منابع حقوقی رسمی» در تنظیمات اتصال‌ها فعال نیست.");
  let url: URL;
  try { url = new URL(rawUrl.trim()); } catch { throw new AppError("نشانی معتبر نیست."); }
  const { domains } = legalWebConfig(conn.config);
  const host = url.hostname.toLowerCase();
  const allowed = domains.some((d) => host === d || host.endsWith(`.${d}`));
  if (!allowed) throw new AppError(`دامنه ${host} در فهرست منابع مجاز دفتر نیست.`);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new AppError("فقط نشانی وب پذیرفته می‌شود.");
  if (isPrivateHost(host)) throw new AppError("نشانی داخلی مجاز نیست.");
  let res: Response;
  try {
    res = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_SEC * MS_PER_SEC), headers: { accept: "text/html,text/plain" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.connector.update({ where: { key: "legal_web" }, data: { status: "ERROR", lastError: msg.slice(0, MAX_ERROR) } });
    throw new AppError(`دریافت نشانی ناموفق بود: ${msg}`);
  }
  if (!res.ok) throw new AppError(`پاسخ منبع: HTTP ${res.status}${res.status >= HTTP_REDIRECT_MIN && res.status < HTTP_REDIRECT_MAX ? " (تغییر مسیر پذیرفته نمی‌شود؛ نشانی نهایی را وارد کنید)" : ""}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_PAGE_BYTES) throw new AppError("حجم صفحه بیش از حد مجاز است.");
  const type = res.headers.get("content-type") ?? "";
  const raw = buf.toString("utf8");
  const { title, text } = type.includes("html") || raw.trimStart().startsWith("<") ? htmlToText(raw) : { title: "", text: raw.trim() };
  if (text.length < MIN_TEXT_CHARS) throw new AppError("متنی در این صفحه یافت نشد.");
  const s = await db.legalSource.create({
    data: {
      kind: "OTHER", title: (title || url.pathname).slice(0, MAX_TITLE), text: text.slice(0, MAX_TEXT_CHARS), sourceName: host, sourceUrl: url.toString(),
      retrievedAt: new Date(), verified: false, createdById: user.id, tags: ["ورود از وب"],
    },
  });
  await db.connector.update({ where: { key: "legal_web" }, data: { status: "OK", lastError: null, lastSyncAt: new Date() } });
  await audit({ actorId: user.id, action: "legal_source.imported", entityType: "LegalSource", entityId: s.id, entityLabel: s.title, meta: { url: url.toString(), bytes: buf.length } });
  return { id: s.id };
}

// ───────── پیام‌رسان ─────────

const trimSlash = (u: string): string => (u.endsWith("/") ? trimSlash(u.slice(0, -1)) : u);

async function sendBotMessage(cfg: MessengerConfig, token: string, chatId: string, text: string, fetchImpl: typeof fetch): Promise<void> {
  const res = await fetchImpl(`${trimSlash(cfg.baseUrl)}/bot${token}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, MAX_MESSAGE) }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_SEC * MS_PER_SEC),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!res.ok || body.ok === false) throw new Error(body.description ?? `HTTP ${res.status}`);
}

export async function testMessenger(user: SessionUser, fetchImpl: typeof fetch = fetch): Promise<void> {
  const conn = await getConnector("messenger_bot");
  if (!conn.secretEnc) throw new AppError("توکن ربات ثبت نشده است.");
  const me = await db.user.findUnique({ where: { id: user.id }, select: { messengerChatId: true } });
  if (!me?.messengerChatId) throw new AppError("ابتدا در «حساب کاربری» شناسه گفت‌وگوی خود در پیام‌رسان را ثبت کنید.");
  try {
    await sendBotMessage(messengerConfig(conn.config), decryptSecret(conn.secretEnc), me.messengerChatId, "پیام آزمایشی سامانه «دفتر»: اتصال پیام‌رسان برقرار است.", fetchImpl);
    await db.connector.update({ where: { key: "messenger_bot" }, data: { status: "OK", lastError: null, lastSyncAt: new Date() } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.connector.update({ where: { key: "messenger_bot" }, data: { status: "ERROR", lastError: msg.slice(0, MAX_ERROR) } });
    throw new AppError(`ارسال ناموفق بود: ${msg}`);
  }
}

/** ارسال اعلان‌های مهم به پیام‌رسان (اجرا در worker). خطا فقط در وضعیت اتصال ثبت می‌شود و اعلان درون‌برنامه بی‌تأثیر می‌ماند. */
export async function pushNotifications(fetchImpl: typeof fetch = fetch, now = new Date()): Promise<number> {
  const conn = await db.connector.findUnique({ where: { key: "messenger_bot" } });
  if (!conn?.enabled || !conn.secretEnc) return 0;
  const cfg = messengerConfig(conn.config);
  const token = decryptSecret(conn.secretEnc);
  const pending = await db.notification.findMany({
    where: { pushedAt: null, type: { in: cfg.types }, createdAt: { gte: new Date(now.getTime() - PUSH_WINDOW_HOURS * MS_PER_HOUR) }, user: { messengerChatId: { not: null }, isActive: true } },
    orderBy: { createdAt: "asc" }, take: PUSH_BATCH, include: { user: { select: { messengerChatId: true } } },
  });
  const sent = await pending.reduce<Promise<number>>(async (prev, n) => {
    const acc = await prev;
    const claim = await db.notification.updateMany({ where: { id: n.id, pushedAt: null }, data: { pushedAt: now } });
    if (!claim.count) return acc;
    const label = PUSHABLE_TYPES[n.type] ?? "اعلان";
    const text = cfg.minimal ? `«دفتر» — ${label}: یک مورد تازه در کارتابل شما. جزئیات را در سامانه ببینید.` : `«دفتر» — ${n.title}${n.body ? `\n${n.body}` : ""}`;
    try {
      await sendBotMessage(cfg, token, n.user.messengerChatId ?? "", text, fetchImpl);
      return acc + 1;
    } catch (e) {
      await db.notification.update({ where: { id: n.id }, data: { pushedAt: null } });
      await db.connector.update({ where: { key: "messenger_bot" }, data: { status: "ERROR", lastError: (e instanceof Error ? e.message : String(e)).slice(0, MAX_ERROR) } });
      throw e;
    }
  }, Promise.resolve(0)).catch(() => -1);
  if (sent > 0) await db.connector.update({ where: { key: "messenger_bot" }, data: { status: "OK", lastError: null, lastSyncAt: now } });
  return Math.max(sent, 0);
}
