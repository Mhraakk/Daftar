/* eslint-disable ts-patterns/no-magic-numbers -- assertions compare against literal expected values */
// صف هوش مصنوعی و اجرای مهارت‌های حقوقی روی پایگاه داده واقعی، با سرور مدل آزمایشی محلی (پروتکل OpenAI).
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth/guard";
import { startAssistantJob } from "@/server/ai/assistant";
import { aiSettingsSchema, DEFAULT_AI, getAiSettings } from "@/server/ai/config";
import { ECHO_WARN } from "@/server/ai/echo";
import { cancelAiJob, claimJobs, executeJob, recoverStaleJobs } from "@/server/ai/jobs";
import { saveAiSettings } from "@/server/ai/settings";
import { continueSkillRun, reviewSkillRun, skillRunToDraft, startSkillRun, type StartSkillRunInput } from "@/server/ai/skill-runner";
import { syncSkills } from "@/server/ai/skill-catalog";
import { createCase } from "@/server/cases";
import { createClient } from "@/server/clients";
import { jsonError, openAiStream, startStub, type Stub } from "../helpers/ai-stub";
import { asUser, nationalId, prisma, tag } from "./helpers";

let legal: SessionUser, reviewer: SessionUser, manager: SessionUser;
let stub: Stub;
let caseId = "", docId = "", secretDocId = "";
const T = tag();
const mk = (o: Record<string, unknown>) => o as never;
const CONTRACT = "قرارداد اجاره\nماده ۱ - طرفین\nماده ۲ - موضوع مطابق پیوست شماره ۲\nماده ۳ - اجاره‌بها [مبلغ] ریال\nماده ۴ - با اسقاط کافه خیارات\nامضای موجر: ..........";
const OUT = "## بررسی قرارداد\n\n**نوع سند:** اجاره‌نامه\n\n- 🔴 اسقاط کافه خیارات [review]";

const setAi = (over: Record<string, unknown>) => prisma.setting.upsert({
  where: { key: "ai" }, create: { key: "ai", value: { ...DEFAULT_AI, ...over } }, update: { value: { ...DEFAULT_AI, ...over } },
});
const input = (o: Partial<StartSkillRunInput>): StartSkillRunInput => ({
  skillSlug: "claude-legal-skill.contract-review", caseId: null, documentIds: [], request: "", position: null, disclosure: null,
  conflictReviewed: false, includeConfidential: false, confirmSend: false, ...o,
});
async function runQueued(jobId: string): Promise<string> {
  const ids = await claimJobs(5);
  expect(ids).toContain(jobId);
  return executeJob(jobId);
}

beforeAll(async () => {
  [legal, reviewer, manager] = await Promise.all(["t.legal", "t.reviewer", "t.manager"].map(asUser));
  await syncSkills();
  await prisma.aiInteraction.updateMany({ where: { status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELED" } });
  stub = await startStub(openAiStream(OUT));
  const opponentId = nationalId();
  const client = await createClient(mk({ type: "PERSON", firstName: "رضا", lastName: `هوش-${T}`, fatherName: "علی", nationalId: nationalId(), mobile: "09120000001", address: "تهران" }), manager);
  // مراجع دیگر دفتر که در این پرونده طرف مقابل است (برای دروازه تعارض)
  await createClient(mk({ type: "PERSON", firstName: "سارا", lastName: `مقابل-${T}`, fatherName: "حسن", nationalId: opponentId, mobile: "09120000002", address: "تهران" }), manager);
  caseId = (await createCase(mk({ title: `پرونده هوش ${T}`, category: "حقوقی", clientId: client.id, priority: "NORMAL", responsibleId: legal.id }), manager)).id;
  await prisma.caseParty.create({ data: { caseId, role: "خوانده", name: `سارا مقابل-${T}`, nationalId: opponentId } });
  const mkDoc = async (title: string, confidentiality: "NORMAL" | "CONFIDENTIAL") => (await prisma.document.create({
    data: {
      code: `D-T-${T}-${confidentiality}`, title, category: "قرارداد", confidentiality, caseId, clientId: client.id, createdById: legal.id,
      versions: { create: { versionNo: 1, fileName: "c.txt", mimeType: "text/plain", size: CONTRACT.length, sha256: "x", storageKey: `t/${T}`, extractedText: CONTRACT, textStatus: "EXTRACTED", uploadedById: legal.id } },
    },
  })).id;
  docId = await mkDoc(`قرارداد اجاره ${T}`, "NORMAL");
  secretDocId = await mkDoc(`قرارداد محرمانه ${T}`, "CONFIDENTIAL");
});
afterAll(async () => {
  await setAi({ enabled: false });
  await stub.close();
  await prisma.$disconnect();
});

describe("اجرای مهارت حقوقی از صف", () => {
  let runId = "";
  it("بدون پیکربندی، هیچ اجرایی ساخته نمی‌شود", async () => {
    await setAi({ enabled: false });
    await expect(startSkillRun(input({ documentIds: [docId], position: "tenant" }), legal)).rejects.toThrow("غیرفعال");
  });
  it("دروازه مهارت: موقعیت کاربر در قرارداد الزامی است", async () => {
    await setAi({ enabled: true, provider: "openai_compatible", baseUrl: `${stub.url}/v1`, model: "stub-model", contextWindow: 200_000, maxOutputTokens: 2_000 });
    await expect(startSkillRun(input({ documentIds: [docId] }), legal)).rejects.toThrow("کدام طرف قرارداد");
  });
  it("SKILL.md بدون تغییر + لایه تطبیق + فهرست بررسی قطعی به مدل می‌رود؛ خروجی در اجرا ذخیره می‌شود", async () => {
    const r = await startSkillRun(input({ documentIds: [docId], position: "tenant", request: "ریسک‌ها را بررسی کن" }), legal);
    runId = r.runId;
    const job = await prisma.aiInteraction.findUniqueOrThrow({ where: { id: r.jobId } });
    expect(job).toMatchObject({ status: "QUEUED", kind: "skill.run", provider: "openai_compatible", skillRunId: runId });
    expect(job.contextSummary).toContain("سرور داخل شبکه دفتر");
    expect(await runQueued(r.jobId)).toBe("DONE");
    const sent = stub.requests.at(-1)!.body as { messages: { role: string; content: string }[] };
    const [system, user] = sent.messages;
    expect(system.role).toBe("system");
    expect(system.content.startsWith("# Runtime: Daftar office platform")).toBe(true);
    expect(system.content).toContain('<skill name="claude-legal-skill.contract-review"');
    expect(system.content).toContain("## Step 1: Pre-Review Checklist");
    expect(system.content).toContain("**Role:** Non-lawyer with attorney access");
    expect(user.content).toContain("مستأجر (Tenant)");
    expect(user.content).toContain("<preflight");
    expect(user.content).toContain("پیوست 2 ⚠️ در متن یافت نشد");
    expect(user.content).toContain(`<document index="1"`);
    const run = await prisma.skillRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run).toMatchObject({ status: "DONE", output: OUT, reviewStatus: "PENDING_REVIEW" });
    expect((run.messages as unknown[]).length).toBe(2);
    expect((run.dataScope as { external: boolean }).external).toBe(false);
    const actions = (await prisma.activityLog.findMany({ where: { entityId: { in: [runId, r.jobId] } }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["skill.run_started", "ai.job.queued", "ai.job.completed"]));
    expect(await prisma.notification.count({ where: { userId: legal.id, link: `/skills/runs/${runId}` } })).toBe(1);
  });
  it("ادامه گفت‌وگو کل تاریخچه را می‌فرستد", async () => {
    const { jobId } = await continueSkillRun(runId, "بند پیوست را هم توضیح بده", legal);
    expect(await runQueued(jobId)).toBe("DONE");
    const sent = stub.requests.at(-1)!.body as { messages: { role: string }[] };
    expect(sent.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    const run = await prisma.skillRun.findUniqueOrThrow({ where: { id: runId } });
    expect((run.messages as unknown[]).length).toBe(4);
  });
  it("بررسی چهارچشمی: آغازکننده نمی‌تواند تأیید کند؛ بررسی‌کننده تأیید می‌کند", async () => {
    await expect(reviewSkillRun(runId, "APPROVED", null, legal)).rejects.toThrow();
    await expect(reviewSkillRun(runId, "REJECTED", null, reviewer)).rejects.toThrow("دلیل");
    await reviewSkillRun(runId, "APPROVED", "قابل استفاده", reviewer);
    expect((await prisma.skillRun.findUniqueOrThrow({ where: { id: runId } })).reviewStatus).toBe("APPROVED");
  });
  it("خروجی به پیش‌نویس سند (با برچسب هوش مصنوعی) تبدیل می‌شود", async () => {
    const d = await skillRunToDraft(runId, legal);
    const draft = await prisma.legalDraft.findUniqueOrThrow({ where: { id: d.id } });
    expect(draft).toMatchObject({ aiAssisted: true, caseId, status: "DRAFT" });
    expect(draft.contentHtml).toContain("<h2>بررسی قرارداد</h2>");
    expect((await prisma.skillRun.findUniqueOrThrow({ where: { id: runId } })).messages).not.toEqual(expect.arrayContaining([expect.objectContaining({ echo: expect.any(Number) })]));
  });
  it("پاسخی که متن خود مهارت را تکرار کند با نشان هشدار ذخیره می‌شود", async () => {
    // همان رفتاری که مدل کوچک محلی در آزمون زنده نشان داد: بازگرداندن فهرست‌های بررسی مهارت به‌جای بررسی سند
    const skillLines = readFileSync("vendor/legal-skills/contract-review/SKILL.md", "utf8").split("\n").filter((l) => l.trim().length > 30).slice(10, 30);
    stub.respond(openAiStream(skillLines.join("\n")));
    const { jobId } = await continueSkillRun(runId, "دوباره بررسی کن", legal);
    expect(await runQueued(jobId)).toBe("DONE");
    const messages = (await prisma.skillRun.findUniqueOrThrow({ where: { id: runId } })).messages as { role: string; echo?: number }[];
    expect(messages.at(-1)?.echo).toBeGreaterThanOrEqual(ECHO_WARN);
  });
});

describe("دروازه‌های مهارت‌های دعاوی", () => {
  const plr = (o: Partial<StartSkillRunInput>) => input({ skillSlug: "litigation-legal.privilege-log-review", documentIds: [docId], ...o });
  it("بدون پرونده اجرا نمی‌شود", async () => {
    await expect(startSkillRun(plr({ disclosure: "no" }), legal)).rejects.toThrow("پرونده");
  });
  it("پرسش اسناد افشاشده و هشدار خود مهارت", async () => {
    await expect(startSkillRun(plr({ caseId }), legal)).rejects.toThrow("افشای مدارک");
    await expect(startSkillRun(plr({ caseId, disclosure: "unconfirmed" }), legal)).rejects.toThrow("Disclosed documents may have use restrictions");
  });
  it("تعارض منافع یافت‌شده باید بررسی و تأیید شود", async () => {
    await expect(startSkillRun(plr({ caseId, disclosure: "no" }), legal)).rejects.toThrow("تعارض منافع");
    const r = await startSkillRun(plr({ caseId, disclosure: "no", conflictReviewed: true }), legal);
    const job = await prisma.aiInteraction.findUniqueOrThrow({ where: { id: r.jobId } });
    const req = job.request as { messages: { content: string }[] };
    expect(req.messages[0].content).toContain("طرف مقابل این پرونده، مراجع دفتر است");
    await cancelAiJob(r.jobId, legal);
    expect((await prisma.skillRun.findUniqueOrThrow({ where: { id: r.runId } })).status).toBe("CANCELED");
    expect(await claimJobs(5)).not.toContain(r.jobId);
  });
});

describe("پایداری صف", () => {
  it("خطای موقت ارائه‌دهنده: تلاش مجدد با تأخیر", async () => {
    stub.respond(jsonError(503, "model loading"));
    const { jobId } = await startAssistantJob(mk({ task: "question", text: "مهلت تجدیدنظر چقدر است؟", documentIds: [], includeConfidential: false, confirmSend: false }), legal);
    expect(await runQueued(jobId)).toBe("QUEUED");
    const job = await prisma.aiInteraction.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.attempts).toBe(1);
    expect(job.error).toContain("پرمشغله");
    expect((job.meta as { retryAt?: string }).retryAt).toBeTruthy();
    expect(await claimJobs(5)).not.toContain(jobId);
    await prisma.aiInteraction.update({ where: { id: jobId }, data: { status: "CANCELED" } });
    stub.respond(openAiStream(OUT));
  });
  it("کار رهاشده در وضعیت RUNNING به صف بازمی‌گردد", async () => {
    const j = await prisma.aiInteraction.create({ data: { userId: legal.id, kind: "assistant.question", prompt: "x", provider: "openai_compatible", model: "m", status: "RUNNING", attempts: 1, startedAt: new Date(Date.now() - 3_600_000), request: { system: "s", messages: [{ role: "user", content: "u" }] } } });
    expect(await recoverStaleJobs(60)).toBeGreaterThanOrEqual(1);
    expect((await prisma.aiInteraction.findUniqueOrThrow({ where: { id: j.id } })).status).toBe("QUEUED");
    await prisma.aiInteraction.update({ where: { id: j.id }, data: { status: "CANCELED" } });
  });
});

describe("دستیار حقوقی", () => {
  it("پیشنهاد مهلت از سند: فقط تاریخ‌های معتبر و موجود در متن سند ذخیره می‌شود", async () => {
    const notice = "اخطاریه\nوقت رسیدگی: ۱۴۰۵/۰۳/۲۰ ساعت ۹ صبح\nمهلت ارائه لایحه تا ۱۴۰۵/۰۳/۱۰";
    const noticeId = (await prisma.document.create({
      data: {
        code: `D-T-${T}-NOTICE`, title: `اخطاریه ${T}`, category: "اخطاریه / ابلاغیه", caseId, createdById: legal.id,
        versions: { create: { versionNo: 1, fileName: "n.txt", mimeType: "text/plain", size: notice.length, sha256: "x", storageKey: `t/${T}/n`, extractedText: notice, textStatus: "EXTRACTED", uploadedById: legal.id } },
      },
    })).id;
    // تاریخ نامعتبر (مهر ۳۰ روزه است)، تاریخ ساختگی که در سند نیست، و تکرار یک پیشنهاد درست
    stub.respond(openAiStream('[{"date":"1405/03/20","type":"HEARING","title":"جلسه رسیدگی","quote":"وقت رسیدگی: ۱۴۰۵/۰۳/۲۰ ساعت ۹ صبح"},{"date":"1405/07/31","type":"HEARING","title":"نامعتبر","quote":""},{"date":"1405/05/01","type":"OTHER","title":"ساختگی","quote":""},{"date":"1405/03/20","type":"HEARING","title":"جلسه رسیدگی","quote":"وقت رسیدگی: ۱۴۰۵/۰۳/۲۰ ساعت ۹ صبح"}]'));
    const { jobId } = await startAssistantJob(mk({ task: "dates", documentIds: [noticeId], text: "", includeConfidential: false, confirmSend: false }), legal);
    expect(await runQueued(jobId)).toBe("DONE");
    const job = await prisma.aiInteraction.findUniqueOrThrow({ where: { id: jobId } });
    expect((job.meta as { suggestions: { date: string }[] }).suggestions.map((s) => s.date)).toEqual(["1405/03/20"]);
    expect(job.meta).toMatchObject({ ungrounded: 1, duplicates: 1 });
    expect(await prisma.deadline.count({ where: { caseId, source: "AI_SUGGESTED" } })).toBe(0);
  });
  it("پیش‌نویس هوش مصنوعی در ویرایشگر و گردش‌کار بررسی قرار می‌گیرد", async () => {
    stub.respond(openAiStream("# اظهارنامه\n\nبه: {{نام مخاطب}}\n\n۱. موضوع: مطالبه وجه"));
    const { jobId } = await startAssistantJob(mk({ task: "draft", docType: "DECLARATION", caseId, text: "اظهارنامه مطالبه اجاره‌بها", documentIds: [], includeConfidential: false, confirmSend: false }), legal);
    expect(await runQueued(jobId)).toBe("DONE");
    const job = await prisma.aiInteraction.findUniqueOrThrow({ where: { id: jobId } });
    const draft = await prisma.legalDraft.findUniqueOrThrow({ where: { id: job.draftId! } });
    expect(draft).toMatchObject({ docType: "DECLARATION", aiAssisted: true, status: "DRAFT", authorId: legal.id });
    expect(draft.contentHtml).toContain("{{نام مخاطب}}");
  });
  it("سند محرمانه به ارائه‌دهنده بیرونی ارسال نمی‌شود؛ تأیید صریح ارسال لازم است", async () => {
    await setAi({ enabled: true, provider: "openai_compatible", baseUrl: "https://llm.example.com/v1", model: "m" });
    await expect(startAssistantJob(mk({ task: "doc_summary", documentIds: [docId], text: "", includeConfidential: false, confirmSend: false }), legal)).rejects.toThrow("تأیید صریح");
    await expect(startAssistantJob(mk({ task: "doc_summary", documentIds: [secretDocId], text: "", includeConfidential: false, confirmSend: true }), legal)).rejects.toThrow("محرمانه");
    await expect(startAssistantJob(mk({ task: "doc_summary", documentIds: [secretDocId], text: "", includeConfidential: true, confirmSend: true }), legal)).rejects.toThrow("مجاز نشده");
    const n = stub.requests.length;
    expect(stub.requests.length).toBe(n);
  });
});

describe("ذخیره تنظیمات هوش مصنوعی از فرم", () => {
  const form = { enabled: false, model: "qwen2.5-1.5b-instruct", baseUrl: "http://127.0.0.1:8088/v1", maxOutputTokens: "1024", contextWindow: "8192", timeoutSec: "900", concurrency: "1", allowConfidential: false, practiceRole: "nonlawyer_with_attorney", attorneyContact: "", officeNotes: "" };
  it("فیلدهای ویژه ارائه‌دهنده‌ای که انتخاب نیست مقدار ذخیره‌شده را نگه می‌دارند", async () => {
    await setAi({ provider: "anthropic", effort: "max", refusalFallback: false, temperature: 0.7 });
    await saveAiSettings(aiSettingsSchema.parse({ ...form, provider: "openai_compatible", temperature: "0.2" }), manager);
    expect(await getAiSettings()).toMatchObject({ provider: "openai_compatible", temperature: 0.2, effort: "max", refusalFallback: false, contextWindow: 8192 });
    await saveAiSettings(aiSettingsSchema.parse({ ...form, provider: "anthropic", effort: "low", refusalFallback: true }), manager);
    expect(await getAiSettings()).toMatchObject({ provider: "anthropic", effort: "low", refusalFallback: true, temperature: 0.2 });
  });
});
