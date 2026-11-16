import type { CorrDirection, CorrStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError, ForbiddenError } from "@/lib/errors";
import { parseJalali, parseJalaliDateOnly } from "@/lib/jalali";
import { CORR_STATUS } from "@/lib/labels";
import { notify } from "@/lib/notify";
import { nextNumber } from "@/lib/numbering";
import { toEnDigits } from "@/lib/text";
import { assertCaseAccess, assertClientAccess, assertCorrAccess, corrScope } from "./access";
import { runAutomation } from "./automation";
import { indexEntity } from "./search-index";

export const corrSchema = z.object({
  direction: z.enum(["INCOMING", "OUTGOING", "INTERNAL"]),
  subject: z.string().trim().min(3, "موضوع باید دست‌کم ۳ نویسه باشد.").max(250),
  body: z.string().trim().max(10000).optional().transform((v) => v || null),
  externalParty: z.string().trim().max(200).optional().transform((v) => v || null),
  externalRef: z.string().trim().max(80).optional().transform((v) => (v ? toEnDigits(v) : null)),
  letterDate: z.string().trim().optional().transform((v) => v || null),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  deadlineDate: z.string().trim().optional().transform((v) => v || null),
  clientId: z.string().optional().transform((v) => v || null),
  caseId: z.string().optional().transform((v) => v || null),
  referToId: z.string().optional().transform((v) => v || null),
  instruction: z.string().trim().max(1000).optional().transform((v) => v || null),
}).superRefine((v, ctx) => {
  if (v.direction !== "INTERNAL" && !v.externalParty) ctx.addIssue({ code: "custom", path: ["externalParty"], message: v.direction === "INCOMING" ? "فرستنده الزامی است." : "گیرنده الزامی است." });
  if (v.letterDate && !parseJalaliDateOnly(v.letterDate)) ctx.addIssue({ code: "custom", path: ["letterDate"], message: "تاریخ نامه معتبر نیست." });
  if (v.deadlineDate && !parseJalali(v.deadlineDate, "23:59")) ctx.addIssue({ code: "custom", path: ["deadlineDate"], message: "مهلت اقدام معتبر نیست." });
});

async function reindex(id: string) {
  const c = await db.correspondence.findUnique({ where: { id } });
  if (!c) return;
  await indexEntity({
    entityType: "correspondence", entityId: c.id, title: c.subject, subtitle: [c.refNumber, c.externalParty, c.externalRef].filter(Boolean).join(" · "),
    body: c.body, caseId: c.caseId, clientId: c.clientId, ownerId: c.createdById, link: `/cartable/${c.id}`,
  });
}

const label = (c: { subject: string; refNumber: string }) => `${c.subject} (${c.refNumber})`;

export async function createCorrespondence(input: z.infer<typeof corrSchema>, user: SessionUser) {
  let { caseId, clientId } = input;
  if (caseId) { const c = await assertCaseAccess(user, caseId); clientId = c.clientId; }
  else if (clientId) await assertClientAccess(user, clientId);
  if (input.referToId) {
    if (!can(user, "correspondence.refer")) throw new ForbiddenError();
    const t = await db.user.findFirst({ where: { id: input.referToId, isActive: true } });
    if (!t) throw new AppError("گیرنده ارجاع فعال نیست.", "VALIDATION", 400, { referToId: "نامعتبر است." });
  }
  const seq = input.direction === "INCOMING" ? "CORR_IN" : input.direction === "OUTGOING" ? "CORR_OUT" : "CORR_INT";
  const corr = await db.$transaction(async (tx) => {
    const refNumber = await nextNumber(seq, tx);
    const holder = input.referToId ?? user.id;
    const c = await tx.correspondence.create({
      data: {
        refNumber, direction: input.direction, subject: input.subject, body: input.body, externalParty: input.externalParty, externalRef: input.externalRef,
        letterDate: input.letterDate ? parseJalaliDateOnly(input.letterDate) : null, priority: input.priority,
        deadline: input.deadlineDate ? parseJalali(input.deadlineDate, "23:59") : null,
        clientId, caseId, createdById: user.id, currentHolderId: holder, status: input.referToId ? "IN_PROGRESS" : "REGISTERED",
      },
    });
    await audit({ actorId: user.id, action: "correspondence.created", entityType: "Correspondence", entityId: c.id, entityLabel: label(c), caseId, clientId, meta: { direction: c.direction } }, tx);
    if (input.referToId && input.referToId !== user.id) {
      await tx.referral.create({ data: { correspondenceId: c.id, fromUserId: user.id, toUserId: input.referToId, action: "REFER", instruction: input.instruction, dueAt: c.deadline } });
      await audit({ actorId: user.id, action: "correspondence.referred", entityType: "Correspondence", entityId: c.id, entityLabel: label(c), caseId, clientId, meta: { to: input.referToId } }, tx);
      await notify({ userId: input.referToId, type: "correspondence.referred", title: "مکاتبه‌ای به کارتابل شما ارجاع شد", body: `${c.subject}${input.instruction ? ` — ${input.instruction}` : ""}`, link: `/cartable/${c.id}`, entityType: "Correspondence", entityId: c.id, important: c.priority === "URGENT" }, tx);
    }
    return c;
  });
  await reindex(corr.id);
  await runAutomation("CORRESPONDENCE_REGISTERED", { correspondenceId: corr.id, caseId: corr.caseId ?? undefined, direction: corr.direction, priority: corr.priority, actorId: user.id });
  return { id: corr.id, refNumber: corr.refNumber };
}

function assertHolder(c: { currentHolderId: string | null; status: CorrStatus }, user: SessionUser) {
  if (c.status === "ARCHIVED") throw new AppError("مکاتبه بایگانی‌شده قابل اقدام نیست.");
  if (c.currentHolderId !== user.id && !can(user, "correspondence.view_all")) {
    throw new ForbiddenError("این مکاتبه در کارتابل شما نیست؛ فقط دارنده فعلی می‌تواند اقدام کند.");
  }
}

/** ثبت «مشاهده» ارجاع توسط گیرنده */
export async function markReferralSeen(corrId: string, user: SessionUser) {
  await db.referral.updateMany({ where: { correspondenceId: corrId, toUserId: user.id, status: "PENDING" }, data: { status: "SEEN", seenAt: new Date() } });
}

export const referSchema = z.object({
  id: z.string(),
  toUserId: z.string().min(1, "گیرنده را انتخاب کنید."),
  instruction: z.string().trim().max(1000).optional().transform((v) => v || null),
  dueDate: z.string().trim().optional().transform((v) => v || null),
  action: z.enum(["REFER", "FORWARD", "FOLLOW_UP"]).default("REFER"),
});

export async function referCorrespondence(input: z.infer<typeof referSchema>, user: SessionUser) {
  if (!can(user, "correspondence.refer")) throw new ForbiddenError();
  const c = await assertCorrAccess(user, input.id);
  assertHolder(c, user);
  if (["COMPLETED", "REJECTED"].includes(c.status)) throw new AppError(`مکاتبه در وضعیت «${CORR_STATUS[c.status].label}» قابل ارجاع نیست.`);
  if (input.toUserId === user.id) throw new AppError("ارجاع به خود ممکن نیست.", "VALIDATION", 400, { toUserId: "گیرنده دیگری انتخاب کنید." });
  const target = await db.user.findFirst({ where: { id: input.toUserId, isActive: true } });
  if (!target) throw new AppError("گیرنده ارجاع فعال نیست.");
  const dueAt = input.dueDate ? parseJalali(input.dueDate, "23:59") : null;
  if (input.dueDate && !dueAt) throw new AppError("مهلت اقدام معتبر نیست.", "VALIDATION", 400, { dueDate: "نامعتبر است." });
  await db.$transaction(async (tx) => {
    await tx.referral.updateMany({ where: { correspondenceId: c.id, toUserId: user.id, status: { in: ["PENDING", "SEEN"] } }, data: { status: "DONE", actedAt: new Date(), response: `ارجاع به ${target.fullName}` } });
    await tx.referral.create({ data: { correspondenceId: c.id, fromUserId: user.id, toUserId: input.toUserId, action: input.action, instruction: input.instruction, dueAt } });
    await tx.correspondence.update({ where: { id: c.id }, data: { currentHolderId: input.toUserId, status: "IN_PROGRESS", version: { increment: 1 } } });
    await audit({ actorId: user.id, action: "correspondence.referred", entityType: "Correspondence", entityId: c.id, entityLabel: label(c), caseId: c.caseId, clientId: c.clientId, meta: { to: input.toUserId, toName: target.fullName, instruction: input.instruction } }, tx);
    await notify({ userId: input.toUserId, type: "correspondence.referred", title: "مکاتبه‌ای به کارتابل شما ارجاع شد", body: `${c.subject}${input.instruction ? ` — ${input.instruction}` : ""}`, link: `/cartable/${c.id}`, entityType: "Correspondence", entityId: c.id, important: c.priority === "URGENT" }, tx);
  });
}

type Decision = "RETURN" | "APPROVE" | "REJECT" | "COMPLETE";

export async function decideCorrespondence(id: string, decision: Decision, note: string | null, user: SessionUser) {
  const c = await assertCorrAccess(user, id);
  assertHolder(c, user);
  if (decision === "APPROVE" || decision === "REJECT") {
    if (!can(user, "correspondence.approve")) throw new ForbiddenError("تأیید یا رد مکاتبه نیازمند مجوز است.");
  } else if (!can(user, "correspondence.refer")) throw new ForbiddenError();
  if (["COMPLETED", "APPROVED", "REJECTED"].includes(c.status) && decision !== "RETURN") throw new AppError(`مکاتبه قبلاً «${CORR_STATUS[c.status].label}» شده است.`);
  if ((decision === "RETURN" || decision === "REJECT") && !note?.trim()) throw new AppError("ثبت توضیح برای بازگشت یا رد الزامی است.");

  const incoming = await db.referral.findFirst({ where: { correspondenceId: id, toUserId: user.id }, orderBy: { createdAt: "desc" } });
  const backTo = incoming?.fromUserId ?? c.createdById;
  if (decision === "RETURN" && backTo === user.id) throw new AppError("ارجاع‌دهنده‌ای برای بازگشت وجود ندارد.");

  const map = {
    RETURN: { status: "IN_PROGRESS" as CorrStatus, holder: backTo, action: "correspondence.returned", refStatus: "RETURNED" as const, title: "مکاتبه به شما بازگشت داده شد" },
    APPROVE: { status: "APPROVED" as CorrStatus, holder: user.id, action: "correspondence.approved", refStatus: "DONE" as const, title: "مکاتبه تأیید شد" },
    REJECT: { status: "REJECTED" as CorrStatus, holder: user.id, action: "correspondence.rejected", refStatus: "DONE" as const, title: "مکاتبه رد شد" },
    COMPLETE: { status: "COMPLETED" as CorrStatus, holder: user.id, action: "correspondence.completed", refStatus: "DONE" as const, title: "اقدام مکاتبه انجام شد" },
  }[decision];

  await db.$transaction(async (tx) => {
    await tx.referral.updateMany({ where: { correspondenceId: id, toUserId: user.id, status: { in: ["PENDING", "SEEN"] } }, data: { status: map.refStatus, actedAt: new Date(), response: note } });
    if (decision === "RETURN") await tx.referral.create({ data: { correspondenceId: id, fromUserId: user.id, toUserId: backTo, action: "RETURN", note } });
    await tx.correspondence.update({ where: { id }, data: { status: map.status, currentHolderId: map.holder, version: { increment: 1 } } });
    await audit({ actorId: user.id, action: map.action, entityType: "Correspondence", entityId: id, entityLabel: label(c), caseId: c.caseId, clientId: c.clientId, meta: { note } }, tx);
    const notifyIds = new Set([backTo, c.createdById]); notifyIds.delete(user.id);
    await notify([...notifyIds].map((userId) => ({ userId, type: map.action, title: map.title, body: `${c.subject}${note ? ` — ${note}` : ""}`, link: `/cartable/${id}`, entityType: "Correspondence", entityId: id })), tx);
  });
}

export async function archiveCorrespondence(id: string, user: SessionUser) {
  if (!can(user, "correspondence.archive")) throw new ForbiddenError();
  const c = await assertCorrAccess(user, id);
  if (c.status === "ARCHIVED") throw new AppError("این مکاتبه قبلاً بایگانی شده است.");
  if (!["COMPLETED", "APPROVED", "REJECTED"].includes(c.status)) throw new AppError("فقط مکاتبات خاتمه‌یافته (اقدام‌شده، تأیید یا ردشده) قابل بایگانی هستند.");
  await db.$transaction(async (tx) => {
    await tx.correspondence.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date(), version: { increment: 1 } } });
    await audit({ actorId: user.id, action: "correspondence.archived", entityType: "Correspondence", entityId: id, entityLabel: label(c), caseId: c.caseId, clientId: c.clientId }, tx);
  });
}

export type CartableBox = "inbox" | "incoming" | "outgoing" | "internal" | "referred" | "returned" | "done" | "archive" | "followup" | "all";

export async function cartableCounts(user: SessionUser) {
  const [inbox, unseen, returned, followup] = await Promise.all([
    db.correspondence.count({ where: { currentHolderId: user.id, status: { in: ["REGISTERED", "IN_PROGRESS"] } } }),
    db.referral.count({ where: { toUserId: user.id, status: "PENDING" } }),
    db.referral.count({ where: { toUserId: user.id, action: "RETURN", status: { in: ["PENDING", "SEEN"] } } }),
    db.correspondence.count({ where: { referrals: { some: { fromUserId: user.id } }, currentHolderId: { not: user.id }, status: { in: ["REGISTERED", "IN_PROGRESS"] } } }),
  ]);
  return { inbox, unseen, returned, followup };
}

export async function listCartable(user: SessionUser, p: { box: CartableBox; q?: string; priority?: string; page: number; pageSize: number }) {
  const and: Prisma.CorrespondenceWhereInput[] = [];
  const active: CorrStatus[] = ["REGISTERED", "IN_PROGRESS"];
  switch (p.box) {
    case "inbox": and.push({ currentHolderId: user.id, status: { in: active } }); break;
    case "incoming": and.push(corrScope(user), { direction: "INCOMING" as CorrDirection, status: { not: "ARCHIVED" } }); break;
    case "outgoing": and.push(corrScope(user), { direction: "OUTGOING" as CorrDirection, status: { not: "ARCHIVED" } }); break;
    case "internal": and.push(corrScope(user), { direction: "INTERNAL" as CorrDirection, status: { not: "ARCHIVED" } }); break;
    case "referred": and.push({ referrals: { some: { fromUserId: user.id } }, status: { not: "ARCHIVED" } }); break;
    case "followup": and.push({ referrals: { some: { fromUserId: user.id } }, currentHolderId: { not: user.id }, status: { in: active } }); break;
    case "returned": and.push({ referrals: { some: { toUserId: user.id, action: "RETURN", status: { in: ["PENDING", "SEEN"] } } } }); break;
    case "done": and.push(corrScope(user), { status: { in: ["COMPLETED", "APPROVED", "REJECTED"] } }); break;
    case "archive": and.push(corrScope(user), { status: "ARCHIVED" }); break;
    case "all": and.push(corrScope(user)); break;
  }
  if (p.priority && ["LOW", "NORMAL", "HIGH", "URGENT"].includes(p.priority)) and.push({ priority: p.priority as never });
  if (p.q) {
    const q = p.q.trim();
    and.push({ OR: [{ subject: { contains: q, mode: "insensitive" } }, { refNumber: { contains: toEnDigits(q), mode: "insensitive" } }, { externalParty: { contains: q, mode: "insensitive" } }, { externalRef: { contains: toEnDigits(q) } }] });
  }
  const where = { AND: and };
  const [total, rows] = await Promise.all([
    db.correspondence.count({ where }),
    db.correspondence.findMany({
      where, orderBy: [{ registeredAt: "desc" }], skip: (p.page - 1) * p.pageSize, take: p.pageSize,
      include: {
        case: { select: { id: true, number: true } }, client: { select: { id: true, displayName: true } },
        referrals: { where: { toUserId: user.id }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true, fromUserId: true, instruction: true } },
        _count: { select: { documents: true } },
      },
    }),
  ]);
  return { total, rows };
}
