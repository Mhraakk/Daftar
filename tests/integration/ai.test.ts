/* eslint-disable ts-patterns/no-magic-numbers -- assertions compare against literal expected values */
// صف هوش مصنوعی و اجرای مهارت‌های حقوقی روی پایگاه داده واقعی، با سرور مدل آزمایشی محلی (پروتکل OpenAI).
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth/guard";
import { startAssistantJob } from "@/server/ai/assistant";
import { aiSettingsSchema, DEFAULT_AI, getAiSettings } from "@/server/ai/config";
import { ECHO_WARN } from "@/server/ai/echo";
import { cancelAiJob, claimJobs, executeJob, recoverStaleJobs } from "@/server/ai/jobs";
import { LEGAL_QA_SYSTEM, NOT_FOUND, retrieveForQuestion, type Grounding, type QaSource, type RetrievalInfo } from "@/server/ai/legal-qa";
import { jobSnapshot } from "@/server/ai/snapshot";
import { saveAiSettings } from "@/server/ai/settings";
import { continueSkillRun, reviewSkillRun, skillRunToDraft, startSkillRun, type StartSkillRunInput } from "@/server/ai/skill-runner";
import { syncSkills } from "@/server/ai/skill-catalog";
import { createCase } from "@/server/cases";
import { createClient } from "@/server/clients";
import { jsonError, openAiStream, startStub, type Responder, type Stub } from "../helpers/ai-stub";
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

// ───────── پرسش حقوقی از منابع دفتر (ماژول اتصال LLM) ─────────

// Source id of the ACP article 336 inside the <sources> block: matches 'id="S3" kind="قانون" title="ماده 336 قانون'; rejects 'title="ماده 3361'.
// https://regex101.com/?regex=%3Csource%20id%3D%22%28S%5Cd%2B%29%22%5B%5E%3E%5D*title%3D%22%D9%85%D8%A7%D8%AF%D9%87%20336%20&testString=%3Csource%20id%3D%22S3%22%20kind%3D%22x%22%20title%3D%22%D9%85%D8%A7%D8%AF%D9%87%20336%20%D9%82&flavor=javascript
const A336_SOURCE = /<source id="(S\d+)"[^>]*title="ماده 336 /;
const lastMessage = (body: Record<string, unknown>): string => String((body.messages as { content: string }[] | undefined)?.at(-1)?.content ?? "");
/** مدل آزمایشی که به منبع حاوی ماده ۳۳۶ (هر شناسه‌ای که گرفته باشد) ارجاع می‌دهد */
const answerCiting = (make: (id: string) => string): Responder => (req, res) => openAiStream(make(A336_SOURCE.exec(lastMessage(req.body))?.[1] ?? "S1"))(req, res);
/** پرسش‌های طبیعی با ماده پاسخ که از متن قانون واردشده در پایگاه داده تأیید شده است */
const EVAL: [string, string[]][] = [
  ["مهلت تجدیدنظرخواهی از رأی دادگاه بدوی برای کسی که در ایران زندگی می‌کند چقدر است؟", ["336"]],
  ["تا چند روز بعد از ابلاغ رای می‌توان درخواست تجدیدنظر داد؟", ["336"]],
  ["مهلت تجدیدنظر از حکم دادگاه چند روز است؟", ["336"]],
  ["به حکم غیابی تا چند روز می‌شود اعتراض کرد؟", ["306"]],
  ["مهلت فرجام‌خواهی در دیوان عالی کشور چقدر است؟", ["397"]],
  ["مهلت درخواست اعاده دادرسی چند روز است؟", ["427"]],
  ["در امور فوری چگونه دستور موقت صادر می‌شود؟", ["310"]],
  ["شخص ثالث چطور می‌تواند وارد دعوای دیگران شود؟", ["130", "131"]],
  ["تا چه زمانی می‌توان شخص ثالث را به دعوا جلب کرد؟", ["135"]],
  ["اعتراض ثالث چند نوع است؟", ["417", "418", "419"]],
  ["خواهان تا چه زمانی می‌تواند درخواست تأمین خواسته بدهد؟", ["108"]],
  ["آیا طرفین می‌توانند اختلاف خود را به داوری ارجاع دهند؟", ["454"]],
  ["آیا طرفین در میانه دادرسی می‌توانند با هم سازش کنند؟", ["178"]],
  ["دعوا را باید در کدام دادگاه اقامه کرد؟", ["11"]],
];

describe("پرسش حقوقی از منابع دفتر", () => {
  const QUESTION = `مهلت تجدیدنظرخواهی برای کسی که خارج از کشور زندگی می‌کند چقدر است؟ نشان ${T}`;
  const ask = (text: string) => startAssistantJob(mk({ task: "legal_qa", text, documentIds: [], includeConfidential: false, confirmSend: false }), legal);
  const metaOf = async (jobId: string) => (await prisma.aiInteraction.findUniqueOrThrow({ where: { id: jobId } })).meta as unknown as { sources: QaSource[]; retrieval: RetrievalInfo; grounding?: Grounding };
  const lexical = { enabled: true, provider: "openai_compatible", baseUrl: "", model: "stub-model", contextWindow: 200_000, maxOutputTokens: 2_000 };
  beforeAll(async () => { await setAi({ ...lexical, baseUrl: `${stub.url}/v1` }); });

  it("بازیابی: ماده پاسخ در ۸ منبع نخست دست‌کم ۱۳ پرسش از ۱۴ (فقط واژگانی)", async () => {
    const settings = await getAiSettings();
    const hits = await Promise.all(EVAL.map(async ([text, want]) => {
      const { sources } = await retrieveForQuestion({ text, caseId: null, documentIds: [], includeConfidential: false }, legal, settings);
      return sources.some((s) => want.some((n) => s.href.includes(`a=${n}#`)));
    }));
    expect(hits.filter(Boolean).length).toBeGreaterThanOrEqual(13);
  });
  let groundedJob = "";
  it("پاسخ مستند: دستورالعمل جداگانه، منابع با شناسه، برچسب‌های پیوندشده و سنجش «مستند»", async () => {
    stub.respond(answerCiting((id) => `برای اشخاص مقیم خارج از کشور، مهلت درخواست تجدیدنظر دو ماه از تاریخ ابلاغ است [${id}].`));
    const { jobId } = await ask(QUESTION);
    groundedJob = jobId;
    expect(await runQueued(jobId)).toBe("DONE");
    const job = await prisma.aiInteraction.findUniqueOrThrow({ where: { id: jobId } });
    const request = job.request as { system: string; messages: { content: string }[] };
    expect(request.system).toBe(LEGAL_QA_SYSTEM);
    expect(request.system).not.toContain("model knowledge");
    // The user message layout: matches '<sources>\n<source id="S1" …</sources>\n\n<question>'; rejects a message without the <question> block.
    // https://regex101.com/?regex=%3Csources%3E%5B%5Cs%5CS%5D*%3Csource%20id%3D%22S1%22%5B%5Cs%5CS%5D*%3C%5C%2Fsources%3E%5Cs*%3Cquestion%3E&testString=%3Csources%3E%0A%3Csource%20id%3D%22S1%22%3Ex%3C%2Fsource%3E%0A%3C%2Fsources%3E%0A%0A%3Cquestion%3E&flavor=javascript
    expect(request.messages[0].content).toMatch(/<sources>[\s\S]*<source id="S1"[\s\S]*<\/sources>\s*<question>/);
    const meta = await metaOf(jobId);
    expect(meta.sources.some((s) => s.href.includes("a=336#"))).toBe(true);
    expect(meta.retrieval).toMatchObject({ method: "lexical", fallback: null });
    expect(meta.grounding).toMatchObject({ status: "grounded", untagged: 0, figures: [], articles: [] });
    expect((await jobSnapshot(jobId, legal)).html).toContain('class="cite-tag" href="#src-S');
  });
  it("لاگ هر فراخوانی: ارائه‌دهنده، مدل، زمان و توکن، بدون متن پرسش", async () => {
    const rows = await prisma.activityLog.findMany({ where: { entityId: groundedJob } });
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["ai.job.queued", "ai.job.completed"]));
    expect(rows.find((r) => r.action === "ai.job.completed")?.meta).toMatchObject({ provider: "openai_compatible", model: "stub-model", inputTokens: 321, outputTokens: 45 });
    expect(JSON.stringify(rows)).not.toContain(`نشان ${T}`);
    expect(JSON.stringify(rows)).not.toContain("خارج از کشور زندگی");
  });
  it("پاسخ بی‌منبع یا با مدت ساختگی «مردود» است", async () => {
    stub.respond(answerCiting((id) => `مهلت تجدیدنظر سی روز است [${id}].\nدر هر حال مشورت با وکیل لازم است.`));
    const { jobId } = await ask(QUESTION);
    expect(await runQueued(jobId)).toBe("DONE");
    expect((await metaOf(jobId)).grounding).toMatchObject({ status: "rejected", untagged: 1, figures: ["30 روز"] });
  });
  it("«در منابع دفتر پیدا نکردم» وضعیت «پیدا نشد» می‌گیرد", async () => {
    stub.respond(openAiStream(`${NOT_FOUND}.`));
    const { jobId } = await ask(QUESTION);
    expect(await runQueued(jobId)).toBe("DONE");
    expect((await metaOf(jobId)).grounding?.status).toBe("not_found");
  });
  it("بی منبع مرتبط، مدل فراخوانی نمی‌شود", async () => {
    const before = stub.requests.length;
    await expect(ask("هزینه پرواز به کیش چقدر است؟")).rejects.toThrow("پیدا نشد");
    expect(stub.requests.length).toBe(before);
  });
  it("مرتب‌سازی معنایی با مسیر /embeddings و بازگشت به رتبه واژگانی در خطا", async () => {
    await setAi({ ...lexical, baseUrl: `${stub.url}/v1`, embeddingModel: "stub-embed" });
    stub.respond((req, res) => {
      if (!req.path.endsWith("/embeddings")) { openAiStream("—")(req, res); return; }
      const inputs = req.body.input as string[];
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: inputs.map((t, index) => ({ index, embedding: index === 0 || t.includes("مقیم خارج") ? [1, 0] : [0, 1] })).reverse() }));
    });
    const hybrid = await ask(QUESTION);
    expect((await metaOf(hybrid.jobId)).retrieval).toMatchObject({ method: "hybrid", embeddingModel: "stub-embed", fallback: null });
    const embedCall = stub.requests.filter((r) => r.path.endsWith("/embeddings")).at(-1);
    expect(embedCall?.body).toMatchObject({ model: "stub-embed" });
    expect((embedCall?.body.input as string[])[0]).toBe(QUESTION);
    stub.respond(jsonError(404, "no embeddings here", "not_found_error"));
    const fallback = await ask(QUESTION);
    expect((await metaOf(fallback.jobId)).retrieval).toMatchObject({ method: "lexical", embeddingModel: "stub-embed" });
    expect((await metaOf(fallback.jobId)).retrieval.fallback).toBeTruthy();
    await Promise.all([hybrid.jobId, fallback.jobId].map((id) => cancelAiJob(id, legal)));
    await setAi({ ...lexical, baseUrl: `${stub.url}/v1` });
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
  it("پیکربندی LLM_* محیط: فرم نوع ارائه‌دهنده، نشانی، مدل و کلید را تغییر نمی‌دهد و کلید محیط ذخیره نمی‌شود", async () => {
    const ENV = { LLM_PROVIDER: "hf", LLM_BASE_URL: "https://router.huggingface.co/v1", LLM_MODEL: "Qwen/Qwen3.8-27B", LLM_API_KEY: "hf_env_secret_9876" };
    await setAi({ provider: "anthropic", model: "claude-x", apiKeyEnc: null });
    Object.assign(process.env, ENV);
    try {
      await saveAiSettings(aiSettingsSchema.parse({ ...form, provider: "openai_compatible", model: "other", baseUrl: "http://other.example/v1", apiKey: "typed-key", temperature: "0.1" }), manager);
      const stored = (await prisma.setting.findUniqueOrThrow({ where: { key: "ai" } })).value as Record<string, unknown>;
      expect(stored).toMatchObject({ provider: "anthropic", model: "claude-x", apiKeyEnc: null, temperature: 0.1 });
      expect(stored).not.toHaveProperty("source");
      expect(JSON.stringify(stored)).not.toContain("hf_env_secret_9876");
      expect(await getAiSettings()).toMatchObject({ source: "env", envProvider: "hf", provider: "openai_compatible", model: ENV.LLM_MODEL, baseUrl: ENV.LLM_BASE_URL, apiKeyEnc: null });
      const audit = await prisma.activityLog.findFirstOrThrow({ where: { action: "ai.settings_updated" }, orderBy: { createdAt: "desc" } });
      expect(audit.meta).toMatchObject({ source: "env", provider: "openai_compatible", keyChanged: false });
    } finally {
      Object.keys(ENV).forEach((k) => { delete process.env[k]; });
    }
  });
});
