// آزمون‌های یکپارچگی روی پایگاه داده واقعی (PostgreSQL) — بدون mock.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth/guard";
import { nextNumber } from "@/lib/numbering";
import { fromJalali } from "@/lib/jalali";
import { caseScope } from "@/server/access";
import { changeCaseStatus, createCase } from "@/server/cases";
import { createClient, updateClient } from "@/server/clients";
import { createDeadline, setDeadlineStatus, updateDeadline, verifyDeadline } from "@/server/deadlines";
import { createDocument, readDocumentFile, setDocumentDeleted } from "@/server/documents";
import { searchInternal } from "@/server/search";
import { changeTaskStatus, createTask, reviewTask } from "@/server/tasks";
import { escalateDeadlines, fireReminders } from "@/worker/index";
import { asUser, nationalId, prisma, tag } from "./helpers";

let manager: SessionUser, legal: SessionUser, legal2: SessionUser, employee: SessionUser, intake: SessionUser, reviewer: SessionUser;
const T = tag();
const mk = (o: Record<string, unknown>) => o as never;

beforeAll(async () => {
  [manager, legal, legal2, employee, intake, reviewer] = await Promise.all(["t.manager", "t.legal", "t.legal2", "t.employee", "t.intake", "t.reviewer"].map(asUser));
});
afterAll(() => prisma.$disconnect());

async function newCase(owner: SessionUser, responsibleId?: string) {
  const c = await createClient(mk({ type: "PERSON", firstName: "آزمون", lastName: `یکپارچگی-${T}-${tag()}`, nationalId: nationalId() }), owner);
  const k = await createCase(mk({ title: `پرونده آزمون ${T}-${tag()}`, category: "حقوقی", clientId: c.id, priority: "NORMAL", responsibleId }), owner);
  return { clientId: c.id, caseId: k.id, number: k.number };
}

describe("شماره‌گذاری و هم‌زمانی", () => {
  it("شماره‌های یکتا زیر بار هم‌زمان", async () => {
    const nums = await Promise.all(Array.from({ length: 40 }, () => nextNumber("TASK")));
    expect(new Set(nums).size).toBe(40);
  });
  it("جلوگیری از بازنویسی ناخواسته (قفل خوش‌بینانه)", async () => {
    const c = await createClient(mk({ type: "PERSON", firstName: "هم‌زمان", lastName: `آزمون-${T}`, nationalId: nationalId() }), manager);
    const row = await prisma.client.findUniqueOrThrow({ where: { id: c.id } });
    const input = mk({ type: "PERSON", firstName: "ویرایش", lastName: "اول", nationalId: row.nationalId });
    await updateClient(c.id, row.version, input, manager);
    await expect(updateClient(c.id, row.version, mk({ type: "PERSON", firstName: "ویرایش", lastName: "دوم", nationalId: row.nationalId }), legal)).rejects.toThrow(/یافت نشد|هم‌زمان/);
    await expect(updateClient(c.id, row.version, mk({ type: "PERSON", firstName: "ویرایش", lastName: "دوم", nationalId: row.nationalId }), manager)).rejects.toThrow("هم‌زمان");
    expect((await prisma.client.findUniqueOrThrow({ where: { id: c.id } })).lastName).toBe("اول");
  });
  it("کد ملی تکراری رد می‌شود (قید یکتا)", async () => {
    const nid = nationalId();
    await createClient(mk({ type: "PERSON", firstName: "الف", lastName: `ب-${T}`, nationalId: nid }), manager);
    await expect(createClient(mk({ type: "PERSON", firstName: "ج", lastName: "د", nationalId: nid }), manager)).rejects.toThrow("قبلاً ثبت شده");
  });
});

describe("کنترل دسترسی سمت سرور", () => {
  it("کارمند بی‌ارتباط پرونده را نمی‌بیند و تلاش او ثبت می‌شود", async () => {
    const { caseId } = await newCase(manager, legal.id);
    expect(await prisma.case.count({ where: { id: caseId, AND: [caseScope(employee)] } })).toBe(0);
    expect(await prisma.case.count({ where: { id: caseId, AND: [caseScope(legal)] } })).toBe(1);
    await expect(changeCaseStatus(caseId, "IN_PROGRESS", employee)).rejects.toThrow("یافت نشد");
    expect(await prisma.activityLog.count({ where: { action: "security.forbidden", entityId: caseId, actorId: employee.id } })).toBe(1);
  });
  it("سند خیلی‌محرمانه فقط برای افراد مجاز قابل دریافت است و حذف، فایل را از بین نمی‌برد", async () => {
    const { caseId } = await newCase(manager, legal.id);
    const marker = `محتوای-محرمانه-${T}`;
    const d = await createDocument(mk({ title: `سند محرمانه ${T}`, category: "قرارداد", confidentiality: "RESTRICTED", caseId, tags: [] }), { name: "secret.txt", data: Buffer.from(marker) }, manager);
    await expect(readDocumentFile(d.id, null, legal, "download")).rejects.toThrow("یافت نشد"); // عضو پرونده ولی بدون مجوز
    expect((await searchInternal(legal, marker)).some((h) => h.id === d.id)).toBe(false); // در جست‌وجو هم افشا نمی‌شود
    expect((await searchInternal(manager, marker)).some((h) => h.id === d.id)).toBe(true);
    await prisma.documentAccess.create({ data: { documentId: d.id, userId: legal.id } });
    expect((await readDocumentFile(d.id, null, legal, "download")).data.toString()).toBe(marker);
    await setDocumentDeleted(d.id, true, manager);
    await expect(readDocumentFile(d.id, null, manager, "download")).rejects.toThrow("یافت نشد");
    expect(await prisma.documentVersion.count({ where: { documentId: d.id } })).toBe(1); // نسخه حفظ شده
    await setDocumentDeleted(d.id, false, manager);
    expect((await readDocumentFile(d.id, null, manager, "view")).version.versionNo).toBe(1);
  });
  it("پذیرش نمی‌تواند پرونده را ببندد", async () => {
    const { caseId } = await newCase(intake);
    await expect(changeCaseStatus(caseId, "CLOSED", intake, { reason: "x", acknowledgeOpenItems: true })).rejects.toThrow("مجوز");
  });
});

describe("گردش کار وظیفه", () => {
  it("گذار نامعتبر، تأیید دومرحله‌ای و منع تأیید توسط مجری", async () => {
    const { caseId } = await newCase(manager, legal.id);
    const t = await createTask(mk({ title: `وظیفه تأییدی ${T}`, priority: "NORMAL", caseId, assigneeId: legal.id, requiresApproval: true, approverId: reviewer.id, secondApproverId: manager.id }), manager);
    await expect(changeTaskStatus(t.id, "DONE", legal, { result: "x" })).rejects.toThrow("مجاز نیست"); // TODO → DONE
    await expect(changeTaskStatus(t.id, "IN_PROGRESS", legal2)).rejects.toThrow(); // غیرمجری
    await changeTaskStatus(t.id, "IN_PROGRESS", legal);
    await changeTaskStatus(t.id, "DONE", legal, { result: "انجام شد" });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("WAITING_REVIEW");
    await expect(reviewTask(t.id, true, null, legal)).rejects.toThrow(); // مجری نمی‌تواند تأیید کند
    await expect(reviewTask(t.id, false, null, reviewer)).rejects.toThrow("دلیل");
    await reviewTask(t.id, true, "مرحله اول", reviewer);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("WAITING_REVIEW");
    await reviewTask(t.id, true, "نهایی", manager);
    const done = await prisma.task.findUniqueOrThrow({ where: { id: t.id }, include: { steps: true } });
    expect(done.status).toBe("DONE");
    expect(done.steps.every((s) => s.status === "APPROVED")).toBe(true);
  });
});

describe("موتور مهلت و یادآور پایدار", () => {
  it("یادآورها در پایگاه داده زمان‌بندی، یک‌بار اجرا و پس از «راه‌اندازی مجدد» جبران می‌شوند", async () => {
    const { caseId } = await newCase(manager, legal.id);
    const due = new Date(Date.now() + 3 * 86_400_000);
    const p = (n: number) => String(n).padStart(2, "0");
    const { jParts } = await import("@/lib/jalali");
    const j = jParts(due);
    const d = await createDeadline(mk({ title: `مهلت آزمون ${T}`, type: "FILING", dueDate: `${j.jy}/${p(j.jm)}/${p(j.jd)}`, dueTime: `${p(j.hour)}:${p(j.minute)}`, caseId, assigneeId: legal.id, priority: "HIGH", reminderOffsets: ["4320", "1440", "120"] }), manager);
    const rem = await prisma.reminder.findMany({ where: { deadlineId: d.id }, orderBy: { fireAt: "asc" } });
    expect(rem.length).toBe(2); // نوبت سه‌روزه گذشته است
    expect(await fireReminders(new Date())).toBeGreaterThanOrEqual(0);
    expect(await prisma.notification.count({ where: { entityId: d.id, type: "deadline.reminder" } })).toBe(0);

    // شبیه‌سازی خاموشی سرور: زمان از هر دو نوبت گذشته؛ پس از راه‌اندازی هر دو جبران می‌شوند
    const later = new Date(due.getTime() - 60 * 60_000);
    await fireReminders(later);
    expect(await prisma.notification.count({ where: { entityId: d.id, type: "deadline.reminder", userId: legal.id } })).toBe(2);
    await fireReminders(later); // اجرای دوباره، اعلان تکراری نمی‌سازد
    await Promise.all([fireReminders(later), fireReminders(later)]);
    expect(await prisma.notification.count({ where: { entityId: d.id, type: "deadline.reminder" } })).toBe(2);
  });
  it("هشدار مدیریتی مهلت معوق فقط یک‌بار و انجام مهلت یادآورها را لغو می‌کند", async () => {
    const { caseId } = await newCase(manager, legal.id);
    const d = await createDeadline(mk({ title: `مهلت معوق ${T}`, type: "RESPONSE", dueDate: "1410/01/15", caseId, assigneeId: legal.id, priority: "NORMAL", reminderOffsets: ["1440"] }), manager);
    const future = new Date(fromJalali(1410, 1, 16).getTime() + 3600_000);
    await escalateDeadlines(future); await escalateDeadlines(future);
    expect(await prisma.notification.count({ where: { entityId: d.id, type: "deadline.overdue", userId: legal.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { entityId: d.id, type: "deadline.overdue", userId: manager.id } })).toBe(1);
    await prisma.reminder.updateMany({ where: { deadlineId: d.id }, data: { firedAt: null } });
    await setDeadlineStatus(d.id, "DONE", null, legal);
    expect(await prisma.reminder.count({ where: { deadlineId: d.id, firedAt: null, cancelledAt: null } })).toBe(0);
  });
  it("مهلت قانونی خودکار تأیید نمی‌شود و تغییر تاریخ، تأیید را باطل می‌کند", async () => {
    const { caseId } = await newCase(manager, legal.id);
    const base = { title: `تجدیدنظر ${T}`, type: "APPEAL", dueDate: "1410/03/10", caseId, assigneeId: legal.id, priority: "HIGH", isLegal: true, legalBasis: "ماده ۳۳۶ ق.آ.د.م", reminderOffsets: ["1440"] };
    const d = await createDeadline(mk({ ...base, source: "RULE" }), manager);
    expect(d.needsVerification).toBe(true);
    await expect(verifyDeadline(d.id, legal)).rejects.toThrow("مجوز"); // کارمند حقوقی مجوز تأیید ندارد
    await verifyDeadline(d.id, reviewer);
    expect((await prisma.deadline.findUniqueOrThrow({ where: { id: d.id } })).verifiedById).toBe(reviewer.id);
    await updateDeadline(d.id, mk({ ...base, dueDate: "1410/03/12" }), manager);
    expect((await prisma.deadline.findUniqueOrThrow({ where: { id: d.id } })).verifiedAt).toBeNull();
  });
});

describe("تاریخچه ممیزی فقط-افزودنی", () => {
  it("ویرایش و حذف رویدادها در سطح پایگاه داده رد می‌شود", async () => {
    const row = await prisma.activityLog.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    await expect(prisma.activityLog.update({ where: { id: row.id }, data: { action: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(prisma.activityLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`DELETE FROM "ActivityLog" WHERE id = ${row.id}`).rejects.toThrow(/append-only/);
    expect((await prisma.activityLog.findUniqueOrThrow({ where: { id: row.id } })).action).toBe(row.action);
  });
  it("حذف پرونده دارای سند در سطح پایگاه داده ممکن نیست (بدون رکورد یتیم)", async () => {
    const { caseId, clientId } = await newCase(manager, legal.id);
    await createDocument(mk({ title: `سند ${T}`, category: "سایر", confidentiality: "NORMAL", caseId, tags: [] }), { name: "a.txt", data: Buffer.from(`x-${tag()}`) }, manager);
    await expect(prisma.case.delete({ where: { id: caseId } })).rejects.toThrow();
    await expect(prisma.client.delete({ where: { id: clientId } })).rejects.toThrow();
  });
});
