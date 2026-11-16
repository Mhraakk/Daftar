import type { CaseStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { audit, diff } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError, ConflictError, ForbiddenError } from "@/lib/errors";
import { CASE_CATEGORIES, CASE_STATUS, PARTY_ROLES } from "@/lib/labels";
import { notify } from "@/lib/notify";
import { nextNumber } from "@/lib/numbering";
import { toEnDigits } from "@/lib/text";
import { assertCaseAccess, assertClientAccess, caseScope } from "./access";
import { runAutomation } from "./automation";
import { indexEntity } from "./search-index";

const opt = (max = 300) => z.string().trim().max(max).optional().transform((v) => v || null);

export const caseSchema = z.object({
  title: z.string().trim().min(3, "عنوان پرونده باید دست‌کم ۳ نویسه باشد.").max(200),
  category: z.string().refine((v) => CASE_CATEGORIES.includes(v), "دسته‌بندی نامعتبر است."),
  clientId: z.string().min(1, "انتخاب مراجعه‌کننده الزامی است."),
  description: opt(5000),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  responsibleId: z.string().optional().transform((v) => v || null),
  courtName: opt(), courtBranch: opt(),
  courtCaseNumber: z.string().trim().max(60).optional().transform((v) => (v ? toEnDigits(v) : null)),
  archiveNumber: z.string().trim().max(60).optional().transform((v) => (v ? toEnDigits(v) : null)),
});
export type CaseInput = z.infer<typeof caseSchema>;

/** گذارهای مجاز وضعیت پرونده (اعتبارسنجی سمت سرور) */
export const CASE_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  INTAKE: ["OPEN", "IN_PROGRESS", "CLOSED"],
  OPEN: ["IN_PROGRESS", "WAITING", "CLOSED"],
  IN_PROGRESS: ["WAITING", "OPEN", "CLOSED"],
  WAITING: ["IN_PROGRESS", "OPEN", "CLOSED"],
  CLOSED: ["ARCHIVED", "OPEN"],
  ARCHIVED: ["OPEN"],
};

async function reindex(id: string) {
  const c = await db.case.findUnique({ where: { id }, include: { client: true, parties: true } });
  if (!c) return;
  await indexEntity({
    entityType: "case", entityId: c.id, title: c.title,
    subtitle: [c.number, c.client.displayName, c.category].join(" · "),
    body: [c.description, c.courtName, c.courtBranch, c.courtCaseNumber, c.archiveNumber, ...c.parties.map((p) => `${p.role} ${p.name}`)].filter(Boolean).join(" "),
    caseId: c.id, clientId: c.clientId, link: `/cases/${c.id}`,
  });
}

export async function createCase(input: CaseInput, user: SessionUser) {
  const client = await assertClientAccess(user, input.clientId);
  const full = await db.client.findUniqueOrThrow({ where: { id: client.id } });
  if (full.archivedAt) throw new AppError("برای مراجعه‌کننده بایگانی‌شده نمی‌توان پرونده ایجاد کرد.");
  if (input.responsibleId && input.responsibleId !== user.id && !can(user, "case.assign")) throw new ForbiddenError("تعیین مسئول دیگر نیازمند مجوز ارجاع پرونده است.");
  // پذیرش (بدون مجوز ویرایش پرونده) پرونده را بدون مسئول ثبت می‌کند تا مدیر ارجاع دهد؛ کارمند حقوقی مسئول پرونده خود می‌شود.
  const responsibleId = input.responsibleId ?? (can(user, "case.edit") && !can(user, "case.assign") ? user.id : null);
  const c = await db.$transaction(async (tx) => {
    const number = await nextNumber("CASE", tx);
    const row = await tx.case.create({
      data: {
        number, title: input.title, category: input.category, description: input.description, clientId: input.clientId,
        priority: input.priority, responsibleId, courtName: input.courtName, courtBranch: input.courtBranch,
        courtCaseNumber: input.courtCaseNumber, archiveNumber: input.archiveNumber, createdById: user.id,
        status: "INTAKE",
        parties: { create: { role: "خواهان", name: full.displayName, nationalId: full.nationalId, phone: full.mobile, address: full.address, clientId: full.id } },
      },
    });
    await audit({ actorId: user.id, action: "case.created", entityType: "Case", entityId: row.id, entityLabel: `${row.title} (${row.number})`, caseId: row.id, clientId: row.clientId }, tx);
    if (responsibleId && responsibleId !== user.id) {
      await tx.assignment.create({ data: { entityType: "Case", entityId: row.id, toUserId: responsibleId, byUserId: user.id } });
      await notify({ userId: responsibleId, type: "case.assigned", title: "پرونده جدید به شما ارجاع شد", body: `${row.title} (${row.number})`, link: `/cases/${row.id}`, entityType: "Case", entityId: row.id }, tx);
    }
    return row;
  });
  await reindex(c.id);
  await runAutomation("CASE_CREATED", { caseId: c.id, category: c.category, priority: c.priority, actorId: user.id });
  return { id: c.id, number: c.number };
}

export async function updateCase(id: string, version: number, input: CaseInput, user: SessionUser) {
  await assertCaseAccess(user, id);
  const before = await db.case.findUniqueOrThrow({ where: { id } });
  if (before.status === "ARCHIVED") throw new AppError("پرونده بایگانی‌شده قابل ویرایش نیست.");
  if (input.clientId !== before.clientId) throw new AppError("مراجعه‌کننده پرونده قابل تغییر نیست.");
  const data = {
    title: input.title, category: input.category, description: input.description, priority: input.priority,
    courtName: input.courtName, courtBranch: input.courtBranch, courtCaseNumber: input.courtCaseNumber, archiveNumber: input.archiveNumber,
  };
  await db.$transaction(async (tx) => {
    const r = await tx.case.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
    if (r.count === 0) throw new ConflictError();
    await audit({
      actorId: user.id, action: "case.updated", entityType: "Case", entityId: id, entityLabel: `${data.title} (${before.number})`, caseId: id, clientId: before.clientId,
      meta: { changes: diff(before as never, data as never, Object.keys(data) as never) },
    }, tx);
  });
  await reindex(id);
}

export async function closingSummary(caseId: string) {
  const [openTasks, openDeadlines, drafts] = await Promise.all([
    db.task.findMany({ where: { caseId, status: { in: ["TODO", "IN_PROGRESS", "WAITING_REVIEW", "REJECTED"] } }, select: { id: true, code: true, title: true, status: true, dueAt: true }, take: 50 }),
    db.deadline.findMany({ where: { caseId, status: "OPEN" }, select: { id: true, title: true, dueAt: true }, take: 50 }),
    db.legalDraft.count({ where: { caseId, status: { in: ["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED"] } } }),
  ]);
  return { openTasks, openDeadlines, openDrafts: drafts };
}

export async function changeCaseStatus(
  id: string, to: CaseStatus, user: SessionUser, opts: { reason?: string | null; acknowledgeOpenItems?: boolean } = {},
) {
  await assertCaseAccess(user, id);
  const c = await db.case.findUniqueOrThrow({ where: { id } });
  if (!CASE_TRANSITIONS[c.status].includes(to)) {
    throw new AppError(`تغییر وضعیت از «${CASE_STATUS[c.status].label}» به «${CASE_STATUS[to].label}» مجاز نیست.`);
  }
  const closing = to === "CLOSED" || to === "ARCHIVED";
  const reopening = (c.status === "CLOSED" || c.status === "ARCHIVED") && to === "OPEN";
  if ((closing || reopening) && !can(user, "case.close")) throw new ForbiddenError("بستن، بایگانی و بازگشایی پرونده نیازمند مجوز است.");
  if (!closing && !reopening && !can(user, "case.edit")) throw new ForbiddenError();
  if (to === "CLOSED") {
    const s = await closingSummary(id);
    if ((s.openTasks.length || s.openDeadlines.length) && !opts.acknowledgeOpenItems) {
      throw new AppError("این پرونده وظیفه یا مهلت باز دارد. برای بستن، وضعیت موارد باز را بررسی و تأیید کنید.", "OPEN_ITEMS");
    }
    if (!opts.reason?.trim()) throw new AppError("ثبت نتیجه/دلیل مختومه‌شدن الزامی است.", "VALIDATION", 400, { reason: "الزامی است." });
  }
  await db.$transaction(async (tx) => {
    await tx.case.update({
      where: { id },
      data: {
        status: to, version: { increment: 1 },
        ...(to === "CLOSED" ? { closedAt: new Date(), closeReason: opts.reason?.trim() } : {}),
        ...(to === "ARCHIVED" ? { archivedAt: new Date() } : {}),
        ...(reopening ? { closedAt: null, archivedAt: null } : {}),
      },
    });
    if (to === "CLOSED" && opts.acknowledgeOpenItems) {
      await tx.deadline.updateMany({ where: { caseId: id, status: "OPEN" }, data: { status: "CANCELLED" } });
      await tx.reminder.updateMany({ where: { deadline: { caseId: id }, firedAt: null, cancelledAt: null }, data: { cancelledAt: new Date() } });
      await tx.task.updateMany({ where: { caseId: id, status: { in: ["TODO", "IN_PROGRESS", "WAITING_REVIEW", "REJECTED"] } }, data: { status: "CANCELLED" } });
    }
    const action = to === "CLOSED" ? "case.closed" : to === "ARCHIVED" ? "case.archived" : reopening ? "case.reopened" : "case.status_changed";
    await audit({
      actorId: user.id, action, entityType: "Case", entityId: id, entityLabel: `${c.title} (${c.number})`, caseId: id, clientId: c.clientId,
      meta: { from: c.status, to, reason: opts.reason ?? null, cancelledOpenItems: !!(to === "CLOSED" && opts.acknowledgeOpenItems) },
    }, tx);
    if (c.responsibleId && c.responsibleId !== user.id) {
      await notify({ userId: c.responsibleId, type: "case.status", title: `وضعیت پرونده تغییر کرد: ${CASE_STATUS[to].label}`, body: `${c.title} (${c.number})`, link: `/cases/${id}`, entityType: "Case", entityId: id }, tx);
    }
  });
}

export async function assignCase(id: string, responsibleId: string, note: string | null, user: SessionUser) {
  if (!can(user, "case.assign")) throw new ForbiddenError();
  await assertCaseAccess(user, id);
  const c = await db.case.findUniqueOrThrow({ where: { id } });
  const target = await db.user.findFirst({ where: { id: responsibleId, isActive: true } });
  if (!target) throw new AppError("کارمند انتخاب‌شده فعال نیست.");
  if (c.responsibleId === responsibleId) throw new AppError("این کارمند هم‌اکنون مسئول پرونده است.");
  await db.$transaction(async (tx) => {
    await tx.case.update({ where: { id }, data: { responsibleId, version: { increment: 1 }, ...(c.status === "INTAKE" ? { status: "OPEN" } : {}) } });
    await tx.assignment.create({ data: { entityType: "Case", entityId: id, fromUserId: c.responsibleId, toUserId: responsibleId, byUserId: user.id, note } });
    await audit({ actorId: user.id, action: "case.assigned", entityType: "Case", entityId: id, entityLabel: `${c.title} (${c.number})`, caseId: id, clientId: c.clientId, meta: { from: c.responsibleId, to: responsibleId, toName: target.fullName, note } }, tx);
    await notify({ userId: responsibleId, type: "case.assigned", title: "پرونده به شما ارجاع شد", body: `${c.title} (${c.number})${note ? ` — ${note}` : ""}`, link: `/cases/${id}`, entityType: "Case", entityId: id, important: c.priority === "URGENT" }, tx);
  });
}

export async function setCaseMember(id: string, userId: string, add: boolean, user: SessionUser) {
  if (!can(user, "case.assign")) throw new ForbiddenError();
  await assertCaseAccess(user, id);
  const c = await db.case.findUniqueOrThrow({ where: { id } });
  const target = await db.user.findFirst({ where: { id: userId, isActive: true } });
  if (!target) throw new AppError("کارمند انتخاب‌شده فعال نیست.");
  await db.$transaction(async (tx) => {
    if (add) {
      await tx.caseMember.upsert({ where: { caseId_userId: { caseId: id, userId } }, create: { caseId: id, userId }, update: {} });
      await notify({ userId, type: "case.member", title: "به اعضای یک پرونده افزوده شدید", body: `${c.title} (${c.number})`, link: `/cases/${id}`, entityType: "Case", entityId: id }, tx);
    } else {
      await tx.caseMember.deleteMany({ where: { caseId: id, userId } });
    }
    await audit({ actorId: user.id, action: add ? "case.member_added" : "case.member_removed", entityType: "Case", entityId: id, entityLabel: `${c.title} (${c.number})`, caseId: id, clientId: c.clientId, meta: { userId, name: target.fullName } }, tx);
  });
}

export const partySchema = z.object({
  caseId: z.string(),
  role: z.string().refine((v) => PARTY_ROLES.includes(v), "نقش نامعتبر است."),
  name: z.string().trim().min(2, "نام الزامی است.").max(200),
  nationalId: z.string().trim().max(20).optional().transform((v) => (v ? toEnDigits(v) : null)),
  phone: z.string().trim().max(30).optional().transform((v) => (v ? toEnDigits(v) : null)),
  address: opt(500),
});

export async function addParty(input: z.infer<typeof partySchema>, user: SessionUser) {
  const c = await assertCaseAccess(user, input.caseId);
  await db.$transaction(async (tx) => {
    await tx.caseParty.create({ data: input });
    await audit({ actorId: user.id, action: "case.party_added", entityType: "Case", entityId: c.id, entityLabel: `${c.title} (${c.number})`, caseId: c.id, clientId: c.clientId, meta: { role: input.role, name: input.name } }, tx);
  });
  await reindex(c.id);
}

export async function removeParty(partyId: string, user: SessionUser) {
  const p = await db.caseParty.findUnique({ where: { id: partyId } });
  if (!p) throw new AppError("طرف پرونده یافت نشد.");
  const c = await assertCaseAccess(user, p.caseId);
  await db.$transaction(async (tx) => {
    await tx.caseParty.delete({ where: { id: partyId } });
    await audit({ actorId: user.id, action: "case.party_removed", entityType: "Case", entityId: c.id, entityLabel: `${c.title} (${c.number})`, caseId: c.id, clientId: c.clientId, meta: { role: p.role, name: p.name } }, tx);
  });
  await reindex(c.id);
}

export async function addNote(input: { caseId?: string | null; clientId?: string | null; body: string }, user: SessionUser) {
  let caseId: string | null = null, clientId: string | null = null, label = "";
  if (input.caseId) { const c = await assertCaseAccess(user, input.caseId); caseId = c.id; clientId = c.clientId; label = `${c.title} (${c.number})`; }
  else if (input.clientId) { const c = await assertClientAccess(user, input.clientId); clientId = c.id; label = c.displayName; }
  else throw new AppError("یادداشت باید به پرونده یا مراجعه‌کننده متصل باشد.");
  const n = await db.$transaction(async (tx) => {
    const note = await tx.note.create({ data: { body: input.body.trim(), caseId, clientId: caseId ? null : clientId, authorId: user.id } });
    await audit({ actorId: user.id, action: "note.created", entityType: caseId ? "Case" : "Client", entityId: caseId ?? clientId!, entityLabel: label, caseId, clientId }, tx);
    return note;
  });
  await indexEntity({ entityType: "note", entityId: n.id, title: `یادداشت — ${label}`, body: n.body, caseId, clientId, ownerId: user.id, link: caseId ? `/cases/${caseId}?tab=notes` : `/clients/${clientId}` });
}

export async function listCases(user: SessionUser, p: { q?: string; status?: string; category?: string; priority?: string; mine?: string; clientId?: string; page: number; pageSize: number }) {
  const and: Prisma.CaseWhereInput[] = [caseScope(user)];
  if (p.status && p.status in CASE_STATUS) and.push({ status: p.status as CaseStatus });
  else if (p.status !== "all") and.push({ status: { not: "ARCHIVED" } });
  if (p.category) and.push({ category: p.category });
  if (p.priority && ["LOW", "NORMAL", "HIGH", "URGENT"].includes(p.priority)) and.push({ priority: p.priority as never });
  if (p.mine === "1") and.push({ responsibleId: user.id });
  if (p.mine === "unassigned") and.push({ responsibleId: null });
  if (p.clientId) and.push({ clientId: p.clientId });
  if (p.q) {
    const q = p.q.trim(), en = toEnDigits(q);
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } }, { number: { contains: en, mode: "insensitive" } },
        { courtCaseNumber: { contains: en } }, { archiveNumber: { contains: en } },
        { client: { displayName: { contains: q, mode: "insensitive" } } },
        { parties: { some: { name: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  const where = { AND: and };
  const [total, rows] = await Promise.all([
    db.case.count({ where }),
    db.case.findMany({
      where, orderBy: [{ updatedAt: "desc" }], skip: (p.page - 1) * p.pageSize, take: p.pageSize,
      include: { client: { select: { id: true, displayName: true } }, _count: { select: { tasks: true, documents: true } } },
    }),
  ]);
  return { total, rows };
}
