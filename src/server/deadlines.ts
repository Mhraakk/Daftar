import type { DeadlineStatus, DeadlineType, Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/auth/guard";
import { db, type Tx } from "@/lib/db";
import { AppError, ForbiddenError } from "@/lib/errors";
import { formatJalali, fromJalali, jParts, parseJalali, parseJalaliDateOnly, TEHRAN_OFFSET_MIN } from "@/lib/jalali";
import { DEADLINE_TYPE } from "@/lib/labels";
import { notify } from "@/lib/notify";
import { assertCaseAccess, assertClientAccess, assertDeadlineAccess, deadlineScope } from "./access";
import { computeLegalDeadline } from "./deadline-calc";

export const REMINDER_PRESETS = [
  { value: "10080", label: "یک هفته قبل" }, { value: "4320", label: "سه روز قبل" }, { value: "1440", label: "یک روز قبل" },
  { value: "120", label: "دو ساعت قبل" }, { value: "30", label: "نیم ساعت قبل" },
];

export const deadlineSchema = z.object({
  title: z.string().trim().min(3, "عنوان مهلت باید دست‌کم ۳ نویسه باشد.").max(200),
  type: z.string().refine((v) => v in DEADLINE_TYPE, "نوع مهلت نامعتبر است."),
  dueDate: z.string().trim().min(1, "تاریخ سررسید الزامی است."),
  dueTime: z.string().trim().optional().transform((v) => v || null),
  description: z.string().trim().max(3000).optional().transform((v) => v || null),
  caseId: z.string().optional().transform((v) => v || null),
  clientId: z.string().optional().transform((v) => v || null),
  assigneeId: z.string().optional().transform((v) => v || null),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  isLegal: z.boolean().default(false),
  legalBasis: z.string().trim().max(500).optional().transform((v) => v || null),
  reminderOffsets: z.array(z.string()).default(["4320", "1440", "120"]),
  source: z.enum(["MANUAL", "RULE", "EXTRACTED", "AI_SUGGESTED"]).default("MANUAL"),
  ruleKey: z.string().optional().transform((v) => v || null),
  triggerDate: z.string().optional().transform((v) => v || null),
});
export type DeadlineInput = z.infer<typeof deadlineSchema>;

/** بازسازی یادآورهای آینده یک مهلت (پایدار در دیتابیس؛ worker آن‌ها را اجرا می‌کند) */
export async function rebuildReminders(tx: Tx, d: { id: string; title: string; dueAt: Date; assigneeId: string; reminderOffsets: number[]; status: DeadlineStatus }) {
  await tx.reminder.updateMany({ where: { deadlineId: d.id, firedAt: null, cancelledAt: null }, data: { cancelledAt: new Date() } });
  if (d.status !== "OPEN") return;
  const now = Date.now();
  const rows = [...new Set(d.reminderOffsets)]
    .map((m) => ({ fireAt: new Date(d.dueAt.getTime() - m * 60_000), m }))
    .filter((r) => r.fireAt.getTime() > now)
    .map((r) => ({ userId: d.assigneeId, deadlineId: d.id, kind: "DEADLINE", title: d.title, fireAt: r.fireAt }));
  // اگر همه نوبت‌ها گذشته ولی سررسید در آینده است، یک یادآور فوری ثبت می‌شود
  if (!rows.length && d.dueAt.getTime() > now) rows.push({ userId: d.assigneeId, deadlineId: d.id, kind: "DEADLINE", title: d.title, fireAt: new Date(now) });
  if (rows.length) await tx.reminder.createMany({ data: rows });
}

function parseDue(date: string, time: string | null) {
  const d = parseJalali(date, time || "23:59");
  if (!d) throw new AppError("تاریخ یا ساعت سررسید معتبر نیست.", "VALIDATION", 400, { dueDate: "نامعتبر است." });
  return d;
}

export async function createDeadline(input: DeadlineInput, user: SessionUser) {
  let { caseId, clientId } = input;
  let caseLabel = "";
  if (caseId) { const c = await assertCaseAccess(user, caseId); clientId = c.clientId; caseLabel = ` — ${c.title}`; }
  else if (clientId) await assertClientAccess(user, clientId);
  const assigneeId = input.assigneeId ?? user.id;
  const a = await db.user.findFirst({ where: { id: assigneeId, isActive: true } });
  if (!a) throw new AppError("مسئول انتخاب‌شده فعال نیست.", "VALIDATION", 400, { assigneeId: "نامعتبر است." });
  const dueAt = parseDue(input.dueDate, input.dueTime);
  // مهلت قانونی تا تأیید کارمند مجاز «تأییدنشده» می‌ماند؛ هیچ منبعی (قاعده/استخراج/AI) خودکار تأیید نمی‌شود.
  const autoVerify = input.isLegal && input.source === "MANUAL" && can(user, "deadline.verify_legal");
  const d = await db.$transaction(async (tx) => {
    const row = await tx.deadline.create({
      data: {
        title: input.title, type: input.type as DeadlineType, dueAt, description: input.description, caseId, clientId, assigneeId, priority: input.priority,
        isLegal: input.isLegal, legalBasis: input.legalBasis, source: input.source, ruleKey: input.ruleKey,
        triggerDate: input.triggerDate ? parseJalaliDateOnly(input.triggerDate) : null,
        reminderOffsets: input.reminderOffsets.map(Number).filter((n) => n > 0), createdById: user.id,
        verifiedById: autoVerify ? user.id : null, verifiedAt: autoVerify ? new Date() : null,
      },
    });
    await rebuildReminders(tx, row);
    await audit({ actorId: user.id, action: "deadline.created", entityType: "Deadline", entityId: row.id, entityLabel: row.title, caseId, clientId, meta: { dueAt: dueAt.toISOString(), isLegal: row.isLegal, source: row.source, legalBasis: row.legalBasis } }, tx);
    if (assigneeId !== user.id) {
      await notify({ userId: assigneeId, type: "deadline.assigned", title: "مهلت جدید برای شما ثبت شد", body: `${row.title}${caseLabel} — ${formatJalali(dueAt, "datetime")}`, link: `/deadlines?focus=${row.id}`, entityType: "Deadline", entityId: row.id, important: row.priority === "URGENT" || row.isLegal }, tx);
    }
    return row;
  });
  return { id: d.id, needsVerification: d.isLegal && !d.verifiedAt };
}

export async function updateDeadline(id: string, input: DeadlineInput, user: SessionUser) {
  const before = await assertDeadlineAccess(user, id);
  if (!can(user, "deadline.manage")) throw new ForbiddenError();
  if (before.status !== "OPEN") throw new AppError("فقط مهلت باز قابل ویرایش است.");
  const dueAt = parseDue(input.dueDate, input.dueTime);
  const dueChanged = dueAt.getTime() !== before.dueAt.getTime();
  await db.$transaction(async (tx) => {
    const row = await tx.deadline.update({
      where: { id },
      data: {
        title: input.title, type: input.type as DeadlineType, dueAt, description: input.description, priority: input.priority,
        assigneeId: input.assigneeId ?? before.assigneeId, isLegal: input.isLegal, legalBasis: input.legalBasis,
        reminderOffsets: input.reminderOffsets.map(Number).filter((n) => n > 0), escalatedAt: dueChanged ? null : before.escalatedAt,
        // تغییر تاریخ یک مهلت قانونیِ تأییدشده، تأیید را باطل می‌کند
        ...(dueChanged && before.isLegal ? { verifiedById: null, verifiedAt: null } : {}),
      },
    });
    await rebuildReminders(tx, row);
    await audit({ actorId: user.id, action: "deadline.updated", entityType: "Deadline", entityId: id, entityLabel: row.title, caseId: row.caseId, clientId: row.clientId, meta: { dueAt: { from: before.dueAt.toISOString(), to: dueAt.toISOString() } } }, tx);
  });
}

export async function setDeadlineStatus(id: string, status: "DONE" | "CANCELLED" | "MISSED" | "OPEN", note: string | null, user: SessionUser) {
  const d = await assertDeadlineAccess(user, id);
  if (d.assigneeId !== user.id && !can(user, "deadline.view_all") && d.createdById !== user.id) throw new ForbiddenError();
  if (d.status === status) throw new AppError("وضعیت مهلت تغییری نکرده است.");
  const action = { DONE: "deadline.completed", CANCELLED: "deadline.cancelled", MISSED: "deadline.missed", OPEN: "deadline.updated" }[status];
  await db.$transaction(async (tx) => {
    const row = await tx.deadline.update({ where: { id }, data: { status, completedAt: status === "DONE" ? new Date() : null, completedById: status === "DONE" ? user.id : null } });
    await rebuildReminders(tx, row);
    await audit({ actorId: user.id, action, entityType: "Deadline", entityId: id, entityLabel: d.title, caseId: d.caseId, clientId: d.clientId, meta: { from: d.status, to: status, note } }, tx);
  });
}

export async function verifyDeadline(id: string, user: SessionUser) {
  if (!can(user, "deadline.verify_legal")) throw new ForbiddenError("تأیید مهلت قانونی نیازمند مجوز است.");
  const d = await assertDeadlineAccess(user, id);
  if (!d.isLegal) throw new AppError("این مهلت از نوع قانونی نیست.");
  if (d.verifiedAt) throw new AppError("این مهلت قبلاً تأیید شده است.");
  await db.$transaction(async (tx) => {
    await tx.deadline.update({ where: { id }, data: { verifiedById: user.id, verifiedAt: new Date() } });
    await audit({ actorId: user.id, action: "deadline.verified", entityType: "Deadline", entityId: id, entityLabel: d.title, caseId: d.caseId, clientId: d.clientId, meta: { dueAt: d.dueAt.toISOString(), legalBasis: d.legalBasis } }, tx);
  });
}

/** پیشنهاد موعد از روی قاعده و تاریخ ابلاغ (فقط محاسبه؛ چیزی ذخیره نمی‌شود) */
export async function suggestFromRule(ruleKey: string, triggerDateStr: string, abroad: boolean) {
  const rule = await db.deadlineRule.findFirst({ where: { key: ruleKey, isActive: true } });
  if (!rule) throw new AppError("قاعده مهلت یافت نشد.");
  const trigger = parseJalaliDateOnly(triggerDateStr);
  if (!trigger) throw new AppError("تاریخ ابلاغ معتبر نیست.", "VALIDATION", 400, { triggerDate: "نامعتبر است." });
  const period = abroad && rule.monthsAbroad ? { months: rule.monthsAbroad } : { days: rule.days };
  const hs = await db.holiday.findMany({ where: { date: { gte: trigger } } });
  const holidays = new Map(hs.map((h) => [h.date.toISOString().slice(0, 10), h.title]));
  const r = computeLegalDeadline(trigger, period, holidays);
  // lastDay نیمه‌شب UTC روز میلادی است → همان روز در تقویم تهران
  const p = jParts(new Date(r.lastDay.getTime() + 12 * 3600_000 - TEHRAN_OFFSET_MIN * 60_000));
  const dueAt = fromJalali(p.jy, p.jm, p.jd, 23, 59);
  return {
    rule: { key: rule.key, title: rule.title, basis: rule.basis, verified: rule.verified, period: "months" in period ? `${period.months} ماه` : `${period.days} روز` },
    dueDate: formatJalali(dueAt, "input"), dueDateLabel: formatJalali(dueAt, "long"), explanation: r.explanation,
    holidaysKnown: hs.length,
  };
}

export async function listDeadlines(user: SessionUser, p: { view?: string; type?: string; caseId?: string; q?: string; page: number; pageSize: number }) {
  const and: Prisma.DeadlineWhereInput[] = [deadlineScope(user)];
  const now = new Date();
  switch (p.view) {
    case "overdue": and.push({ status: "OPEN", dueAt: { lt: now } }); break;
    case "week": and.push({ status: "OPEN", dueAt: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) } }); break;
    case "unverified": and.push({ status: "OPEN", isLegal: true, verifiedAt: null }); break;
    case "done": and.push({ status: { in: ["DONE", "MISSED", "CANCELLED"] } }); break;
    case "mine": and.push({ status: "OPEN", assigneeId: user.id }); break;
    default: and.push({ status: "OPEN" });
  }
  if (p.type && p.type in DEADLINE_TYPE) and.push({ type: p.type as DeadlineType });
  if (p.caseId) and.push({ caseId: p.caseId });
  if (p.q) and.push({ title: { contains: p.q.trim(), mode: "insensitive" } });
  const where = { AND: and };
  const [total, rows] = await Promise.all([
    db.deadline.count({ where }),
    db.deadline.findMany({ where, orderBy: { dueAt: p.view === "done" ? "desc" : "asc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize, include: { case: { select: { id: true, number: true, title: true } } } }),
  ]);
  return { total, rows };
}
