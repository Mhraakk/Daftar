// گردش کار اسناد حقوقی روی پایگاه داده واقعی
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth/guard";
import { sha256, storage } from "@/lib/storage";
import { createCase } from "@/server/cases";
import { createClient } from "@/server/clients";
import { exportDraft, finalizeDraft } from "@/server/draft-export";
import { createDraft, prepareTemplate, reopenDraft, restoreDraftVersion, reviewDraft, saveDraft, submitDraft } from "@/server/drafts";
import { asUser, nationalId, prisma, tag } from "./helpers";

let legal: SessionUser, legal2: SessionUser, reviewer: SessionUser, employee: SessionUser, manager: SessionUser;
let caseId = "", tplId = "";
const T = tag();
const mk = (o: Record<string, unknown>) => o as never;
const FREE = { "شماره نامه": "۱۴۰۵/۹۹", "پیوست": "ندارد", "عنوان و نام گیرنده": "ریاست محترم شعبه", "موضوع نامه": `آزمون ${T}`, "متن نامه": "متن اصلی نامه" };
const version = async (id: string) => (await prisma.legalDraft.findUniqueOrThrow({ where: { id } })).version;

beforeAll(async () => {
  [legal, legal2, reviewer, employee, manager] = await Promise.all(["t.legal", "t.legal2", "t.reviewer", "t.employee", "t.manager"].map(asUser));
  const c = await createClient(mk({ type: "PERSON", firstName: "مریم", lastName: `سند-${T}`, fatherName: "حسن", nationalId: nationalId(), mobile: "09120000000", address: "تهران" }), manager);
  caseId = (await createCase(mk({ title: `پرونده سند ${T}`, category: "حقوقی", clientId: c.id, priority: "NORMAL", responsibleId: legal.id, courtName: "دادگاه عمومی حقوقی تهران", courtBranch: "شعبه ۱۲" }), manager)).id;
  tplId = (await prisma.legalTemplate.findFirstOrThrow({ where: { name: "نامه اداری", isSystem: true } })).id;
});
afterAll(() => prisma.$disconnect());

describe("ساخت سند از قالب", () => {
  it("فیلدهای خودکار از پرونده، دفتر و کاربر پر می‌شوند", async () => {
    const p = await prepareTemplate(tplId, caseId, legal);
    const byName = Object.fromEntries(p.fields.map((f) => [f.name, f]));
    expect(byName["user.fullName"].value).toBe("علی رضایی");
    expect(byName["office.name"].value.length).toBeGreaterThan(3);
    expect(byName["today"].value).toMatch(/^۱۴\d\d\/\d\d|^[۰-۹]{4}\//);
    expect(byName["موضوع نامه"].known).toBe(false);
    await expect(prepareTemplate(tplId, caseId, employee)).rejects.toThrow("یافت نشد"); // کارمند بی‌ارتباط
  });
  it("دادخواست: مشخصات خواهان از مراجعه‌کننده پرونده", async () => {
    const pet = await prisma.legalTemplate.findFirstOrThrow({ where: { name: "دادخواست نخستین (حقوقی)" } });
    const d = await createDraft(mk({ title: "دادخواست آزمون", docType: "PETITION", caseId, templateId: pet.id, values: {} }), legal);
    const row = await prisma.legalDraft.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.contentHtml).toContain(`مریم سند-${T}`);
    expect(row.contentHtml).toContain("دادگاه عمومی حقوقی تهران");
    expect(row.contentHtml).toContain("{{opponent.name}}"); // طرف مقابل ثبت نشده → فیلد باقی می‌ماند
  });
});

describe("گردش کار بررسی و نهایی‌سازی", () => {
  let id = "";
  it("ذخیره خودکار، قفل خوش‌بینانه و نسخه‌بندی", async () => {
    id = (await createDraft(mk({ title: `نامه ${T}`, docType: "LETTER", caseId, templateId: tplId, values: FREE }), legal)).id;
    let d = await prisma.legalDraft.findUniqueOrThrow({ where: { id } });
    expect(d.currentVersion).toBe(1);
    expect(d.contentHtml).toContain("ریاست محترم شعبه");
    const v0 = d.version;
    const r = await saveDraft(id, v0, d.contentHtml + "<p>بند افزوده<script>x()</script></p>", "AUTOSAVE", null, legal);
    expect(r.version).toBe(v0 + 1);
    await expect(saveDraft(id, v0, "<p>نسخه قدیمی</p>", "AUTOSAVE", null, legal)).rejects.toThrow("هم‌زمان"); // زبانه/رایانه دوم با نسخه کهنه
    await expect(saveDraft(id, r.version, "<p>نفوذ</p>", "AUTOSAVE", null, legal2)).rejects.toThrow("یافت نشد"); // همکارِ خارج از پرونده
    d = await prisma.legalDraft.findUniqueOrThrow({ where: { id } });
    expect(d.contentHtml).not.toContain("<script");
    expect(await prisma.legalDraftVersion.count({ where: { draftId: id } })).toBe(1); // autosave نسخه نمی‌سازد
    const m = await saveDraft(id, d.version, d.contentHtml, "MANUAL", "نسخه دوم", legal);
    expect(m.versionNo).toBe(2);
    const again = await saveDraft(id, m.version, d.contentHtml, "MANUAL", null, legal);
    expect(again.versionNo).toBe(2); // متن تغییری نکرده → نسخه جدید ساخته نمی‌شود
  });
  it("قواعد ارسال برای بررسی", async () => {
    await expect(submitDraft(id, legal.id, legal)).rejects.toThrow("بررسی‌کننده");
    await expect(submitDraft(id, employee.id, legal)).rejects.toThrow("مجوز");
    await submitDraft(id, reviewer.id, legal);
    expect((await prisma.legalDraft.findUniqueOrThrow({ where: { id } })).status).toBe("IN_REVIEW");
    await expect(saveDraft(id, await version(id), "<p>x</p>", "AUTOSAVE", null, legal)).rejects.toThrow("قابل ویرایش نیست");
    expect(await prisma.notification.count({ where: { userId: reviewer.id, entityId: id, type: "draft.review" } })).toBe(1);
  });
  it("قواعد بررسی", async () => {
    await expect(reviewDraft(id, "APPROVE", null, legal)).rejects.toThrow(); // تنظیم‌کننده
    await expect(reviewDraft(id, "APPROVE", null, legal2)).rejects.toThrow("مجوز"); // بدون draft.review
    await expect(reviewDraft(id, "CHANGES", null, reviewer)).rejects.toThrow("اصلاحی");
    await reviewDraft(id, "CHANGES", "بند دوم اصلاح شود", reviewer);
    expect((await prisma.legalDraft.findUniqueOrThrow({ where: { id } })).status).toBe("CHANGES_REQUESTED");
  });
  it("بازگردانی نسخه، نسخه تازه می‌سازد", async () => {
    await restoreDraftVersion(id, 1, legal);
    const d = await prisma.legalDraft.findUniqueOrThrow({ where: { id }, include: { versions: { orderBy: { versionNo: "desc" } } } });
    expect(d.versions[0].source).toBe("RESTORE");
    expect(d.versions[0].contentHtml).toBe(d.versions.at(-1)!.contentHtml);
    expect(d.contentHtml).not.toContain("بند افزوده");
  });
  it("نهایی‌سازی فقط پس از تأیید؛ نسخه نهایی در بایگانی پرونده", async () => {
    await expect(finalizeDraft(id, reviewer)).rejects.toThrow("تأیید");
    await submitDraft(id, reviewer.id, legal);
    await reviewDraft(id, "APPROVE", "صحیح است", reviewer);
    await expect(finalizeDraft(id, legal)).rejects.toThrow("مجوز"); // کارمند حقوقی مجوز نهایی‌سازی ندارد
    const docx = await exportDraft(id, "docx", legal), pdf = await exportDraft(id, "pdf", legal);
    expect(docx.data.subarray(0, 2).toString()).toBe("PK");
    expect(pdf.data.subarray(0, 5).toString()).toBe("%PDF-");
    const { documentId } = await finalizeDraft(id, reviewer);
    const d = await prisma.legalDraft.findUniqueOrThrow({ where: { id } });
    expect(d.status).toBe("FINAL");
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId }, include: { versions: { orderBy: { versionNo: "asc" } } } });
    expect(doc.caseId).toBe(caseId);
    expect(doc.versions.map((v) => v.mimeType)).toEqual(["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/pdf"]);
    for (const v of doc.versions) expect(sha256(await storage.get(v.storageKey))).toBe(v.sha256);
    expect(await prisma.activityLog.count({ where: { entityId: id, action: "draft.finalized" } })).toBe(1);
    await expect(saveDraft(id, d.version, "<p>x</p>", "AUTOSAVE", null, legal)).rejects.toThrow("قابل ویرایش نیست");
    await expect(reopenDraft(id, legal)).rejects.toThrow();
    await expect(finalizeDraft(id, reviewer)).rejects.toThrow(); // دوباره ممکن نیست
  });
  it("فیلد تکمیل‌نشده مانع نهایی‌سازی است", async () => {
    const id2 = (await createDraft(mk({ title: `ناقص ${T}`, docType: "LETTER", caseId, templateId: tplId, values: {} }), legal)).id;
    await submitDraft(id2, reviewer.id, legal);
    await reviewDraft(id2, "APPROVE", null, reviewer);
    await expect(finalizeDraft(id2, reviewer)).rejects.toThrow("فیلد تکمیل‌نشده");
    expect((await prisma.legalDraft.findUniqueOrThrow({ where: { id: id2 } })).status).toBe("APPROVED");
  });
});
