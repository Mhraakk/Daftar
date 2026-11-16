import type { Prisma, TaskStatus } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError, ConflictError, ForbiddenError } from "@/lib/errors";
import { parseJalali } from "@/lib/jalali";
import { TASK_STATUS } from "@/lib/labels";
import { notify } from "@/lib/notify";
import { nextNumber } from "@/lib/numbering";
import { toEnDigits } from "@/lib/text";
import { assertCaseAccess, assertClientAccess, assertTaskAccess, taskScope } from "./access";
import { indexEntity } from "./search-index";

export const taskSchema = z.object({
  title: z.string().trim().min(3, "عنوان وظیفه باید دست‌کم ۳ نویسه باشد.").max(200),
  description: z.string().trim().max(5000).optional().transform((v) => v || null),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  dueDate: z.string().trim().optional().transform((v) => v || null),
  dueTime: z.string().trim().optional().transform((v) => v || null),
  assigneeId: z.string().optional().transform((v) => v || null),
  departmentId: z.string().optional().transform((v) => v || null),
  caseId: z.string().optional().transform((v) => v || null),
  clientId: z.string().optional().transform((v) => v || null),
  correspondenceId: z.string().optional().transform((v) => v || null),
  draftId: z.string().optional().transform((v) => v || null),
  requiresApproval: z.boolean().default(false),
  approverId: z.string().optional().transform((v) => v || null),
  secondApproverId: z.string().optional().transform((v) => v || null),
});
export type TaskInput = z.infer<typeof taskSchema>;

const label = (t: { title: string; code: string }) => `${t.title} (${t.code})`;
const OPEN: TaskStatus[] = ["TODO", "IN_PROGRESS", "WAITING_REVIEW", "REJECTED"];

function parseDue(date: string | null, time: string | null) {
  if (!date) return null;
  const d = parseJalali(date, time || "17:00");
  if (!d) throw new AppError("مهلت انجام معتبر نیست.", "VALIDATION", 400, { dueDate: "تاریخ یا ساعت نامعتبر است." });
  return d;
}

async function reindex(id: string) {
  const t = await db.task.findUnique({ where: { id } });
  if (!t) return;
  await indexEntity({ entityType: "task", entityId: t.id, title: t.title, subtitle: t.code, body: [t.description, t.result].filter(Boolean).join("\n"), caseId: t.caseId, clientId: t.clientId, ownerId: t.assigneeId ?? t.createdById, link: `/tasks/${t.id}` });
}

export async function createTask(input: TaskInput, user: SessionUser) {
  let { caseId, clientId } = input;
  if (caseId) { const c = await assertCaseAccess(user, caseId); clientId = c.clientId; }
  else if (clientId) await assertClientAccess(user, clientId);
  const assigneeId = input.assigneeId ?? (input.departmentId ? null : user.id);
  if (assigneeId && assigneeId !== user.id && !can(user, "task.assign")) throw new ForbiddenError("ارجاع وظیفه به دیگران نیازمند مجوز است.");
  if (assigneeId) {
    const a = await db.user.findFirst({ where: { id: assigneeId, isActive: true } });
    if (!a) throw new AppError("کارمند انتخاب‌شده فعال نیست.", "VALIDATION", 400, { assigneeId: "نامعتبر است." });
  }
  const approvers = input.requiresApproval ? [input.approverId, input.secondApproverId].filter((x): x is string => !!x) : [];
  if (input.requiresApproval && approvers.length === 0) throw new AppError("برای وظیفه نیازمند تأیید، تأییدکننده را مشخص کنید.", "VALIDATION", 400, { approverId: "الزامی است." });
  if (approvers.includes(assigneeId ?? "")) throw new AppError("مجری وظیفه نمی‌تواند تأییدکننده همان وظیفه باشد.", "VALIDATION", 400, { approverId: "شخص دیگری انتخاب کنید." });
  const dueAt = parseDue(input.dueDate, input.dueTime);

  const task = await db.$transaction(async (tx) => {
    const code = await nextNumber("TASK", tx);
    const t = await tx.task.create({
      data: {
        code, title: input.title, description: input.description, priority: input.priority, dueAt, assigneeId, departmentId: input.departmentId,
        createdById: user.id, caseId, clientId, correspondenceId: input.correspondenceId, draftId: input.draftId,
        requiresApproval: input.requiresApproval, approverId: approvers[0] ?? null,
        steps: { create: approvers.map((approverId, i) => ({ order: i + 1, title: i === 0 ? "تأیید اول" : "تأیید نهایی", approverId })) },
      },
    });
    await audit({ actorId: user.id, action: "task.created", entityType: "Task", entityId: t.id, entityLabel: label(t), caseId, clientId, meta: { assigneeId, dueAt: dueAt?.toISOString() ?? null } }, tx);
    if (assigneeId && assigneeId !== user.id) {
      await tx.assignment.create({ data: { entityType: "Task", entityId: t.id, toUserId: assigneeId, byUserId: user.id } });
      await notify({ userId: assigneeId, type: "task.assigned", title: "وظیفه جدید به شما ارجاع شد", body: t.title, link: `/tasks/${t.id}`, entityType: "Task", entityId: t.id, important: t.priority === "URGENT" }, tx);
    }
    return t;
  });
  await reindex(task.id);
  return { id: task.id, code: task.code };
}

const canManage = (t: { createdById: string }, u: SessionUser) => t.createdById === u.id || can(u, "task.view_all");

export async function updateTask(id: string, version: number, input: Pick<TaskInput, "title" | "description" | "priority" | "dueDate" | "dueTime">, user: SessionUser) {
  const t = await assertTaskAccess(user, id);
  if (!canManage(t, user) && t.assigneeId !== user.id) throw new ForbiddenError();
  if (["DONE", "CANCELLED"].includes(t.status)) throw new AppError("وظیفه خاتمه‌یافته قابل ویرایش نیست.");
  const dueAt = parseDue(input.dueDate, input.dueTime);
  await db.$transaction(async (tx) => {
    const r = await tx.task.updateMany({ where: { id, version }, data: { title: input.title, description: input.description, priority: input.priority, dueAt, escalatedAt: null, version: { increment: 1 } } });
    if (r.count === 0) throw new ConflictError();
    await audit({ actorId: user.id, action: "task.updated", entityType: "Task", entityId: id, entityLabel: label(t), caseId: t.caseId, clientId: t.clientId, meta: { dueAt: { from: t.dueAt?.toISOString() ?? null, to: dueAt?.toISOString() ?? null } } }, tx);
  });
  await reindex(id);
}

/** گذارهای مجاز وضعیت وظیفه برای مجری */
const ASSIGNEE_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO: ["IN_PROGRESS"], IN_PROGRESS: ["TODO", "DONE"], REJECTED: ["IN_PROGRESS"], WAITING_REVIEW: [], DONE: [], CANCELLED: [],
};

export async function changeTaskStatus(id: string, to: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED", user: SessionUser, opts: { result?: string | null; progress?: number } = {}) {
  const t = await assertTaskAccess(user, id);
  if (to === "CANCELLED") {
    if (!canManage(t, user)) throw new ForbiddenError("فقط ایجادکننده یا مدیر می‌تواند وظیفه را لغو کند.");
    if (["DONE", "CANCELLED"].includes(t.status)) throw new AppError("این وظیفه قبلاً خاتمه یافته است.");
  } else {
    if (t.assigneeId !== user.id) {
      if (!t.assigneeId && (t.departmentId === user.departmentId || canManage(t, user)) && to === "IN_PROGRESS") {
        // برداشتن وظیفه بدون مسئول از صف واحد
      } else throw new ForbiddenError("فقط مجری وظیفه می‌تواند وضعیت آن را تغییر دهد.");
    }
    if (!ASSIGNEE_TRANSITIONS[t.status].includes(to)) throw new AppError(`تغییر وضعیت از «${TASK_STATUS[t.status].label}» به «${TASK_STATUS[to].label}» مجاز نیست.`);
    if (to === "DONE" && !opts.result?.trim()) throw new AppError("ثبت نتیجه اقدام برای تکمیل وظیفه الزامی است.", "VALIDATION", 400, { result: "الزامی است." });
  }
  const finalStatus: TaskStatus = to === "DONE" && t.requiresApproval ? "WAITING_REVIEW" : to;
  await db.$transaction(async (tx) => {
    const r = await tx.task.updateMany({
      where: { id, version: t.version },
      data: {
        status: finalStatus, version: { increment: 1 },
        ...(to === "IN_PROGRESS" ? { startedAt: t.startedAt ?? new Date(), assigneeId: t.assigneeId ?? user.id, rejectionReason: null } : {}),
        ...(to === "DONE" ? { result: opts.result!.trim(), progress: 100, ...(finalStatus === "DONE" ? { completedAt: new Date() } : {}) } : {}),
        ...(opts.progress !== undefined && to !== "DONE" ? { progress: Math.max(0, Math.min(100, opts.progress)) } : {}),
      },
    });
    if (r.count === 0) throw new ConflictError();
    if (finalStatus === "WAITING_REVIEW") await tx.taskStep.updateMany({ where: { taskId: id }, data: { status: "PENDING", comment: null, decidedAt: null } });
    await audit({ actorId: user.id, action: finalStatus === "DONE" ? "task.completed" : "task.status_changed", entityType: "Task", entityId: id, entityLabel: label(t), caseId: t.caseId, clientId: t.clientId, meta: { from: t.status, to: finalStatus, result: opts.result ?? null } }, tx);
    if (finalStatus === "WAITING_REVIEW") {
      const first = t.steps[0]?.approverId ?? t.approverId;
      if (first) await notify({ userId: first, type: "task.review", title: "وظیفه‌ای منتظر تأیید شماست", body: t.title, link: `/tasks/${id}`, entityType: "Task", entityId: id }, tx);
    } else if (t.createdById !== user.id && (finalStatus === "DONE" || finalStatus === "IN_PROGRESS")) {
      await notify({ userId: t.createdById, type: "task.status", title: finalStatus === "DONE" ? "وظیفه تکمیل شد" : "کار روی وظیفه آغاز شد", body: t.title, link: `/tasks/${id}`, entityType: "Task", entityId: id }, tx);
    } else if (finalStatus === "CANCELLED" && t.assigneeId && t.assigneeId !== user.id) {
      await notify({ userId: t.assigneeId, type: "task.status", title: "وظیفه لغو شد", body: t.title, link: `/tasks/${id}`, entityType: "Task", entityId: id }, tx);
    }
  });
  await reindex(id);
}

export async function setTaskProgress(id: string, progress: number, user: SessionUser) {
  const t = await assertTaskAccess(user, id);
  if (t.assigneeId !== user.id) throw new ForbiddenError("فقط مجری وظیفه می‌تواند پیشرفت را ثبت کند.");
  if (t.status !== "IN_PROGRESS") throw new AppError("ثبت پیشرفت فقط برای وظیفه «در حال انجام» ممکن است.");
  await db.task.update({ where: { id }, data: { progress: Math.max(0, Math.min(99, Math.round(progress))) } });
}

/** تأیید/رد در گردش کار چندمرحله‌ای: هر مرحله فقط توسط تأییدکننده همان مرحله و به ترتیب */
export async function reviewTask(id: string, approve: boolean, comment: string | null, user: SessionUser) {
  const t = await assertTaskAccess(user, id);
  if (t.status !== "WAITING_REVIEW") throw new AppError("این وظیفه در وضعیت «منتظر تأیید» نیست.");
  const step = t.steps.find((s) => s.status === "PENDING");
  const approverId = step?.approverId ?? t.approverId;
  if (approverId !== user.id && !(can(user, "task.approve") && can(user, "task.view_all"))) throw new ForbiddenError("شما تأییدکننده این مرحله نیستید.");
  if (t.assigneeId === user.id) throw new ForbiddenError("مجری وظیفه نمی‌تواند نتیجه کار خود را تأیید کند.");
  if (!approve && !comment?.trim()) throw new AppError("ثبت دلیل برای رد نتیجه الزامی است.");
  const remaining = t.steps.filter((s) => s.status === "PENDING" && s.id !== step?.id);
  await db.$transaction(async (tx) => {
    if (step) await tx.taskStep.update({ where: { id: step.id }, data: { status: approve ? "APPROVED" : "REJECTED", comment, decidedAt: new Date() } });
    if (!approve) {
      await tx.task.update({ where: { id }, data: { status: "REJECTED", rejectionReason: comment, progress: 80, version: { increment: 1 } } });
      await audit({ actorId: user.id, action: "task.rejected", entityType: "Task", entityId: id, entityLabel: label(t), caseId: t.caseId, clientId: t.clientId, meta: { comment, step: step?.order ?? 1 } }, tx);
      if (t.assigneeId) await notify({ userId: t.assigneeId, type: "task.rejected", title: "نتیجه وظیفه برگشت خورد", body: `${t.title} — ${comment}`, link: `/tasks/${id}`, entityType: "Task", entityId: id, important: true }, tx);
    } else if (remaining.length) {
      await audit({ actorId: user.id, action: "task.approved", entityType: "Task", entityId: id, entityLabel: label(t), caseId: t.caseId, clientId: t.clientId, meta: { step: step?.order, comment, final: false } }, tx);
      await notify({ userId: remaining[0].approverId, type: "task.review", title: "وظیفه‌ای منتظر تأیید نهایی شماست", body: t.title, link: `/tasks/${id}`, entityType: "Task", entityId: id }, tx);
    } else {
      await tx.task.update({ where: { id }, data: { status: "DONE", approvedAt: new Date(), completedAt: new Date(), version: { increment: 1 } } });
      await audit({ actorId: user.id, action: "task.approved", entityType: "Task", entityId: id, entityLabel: label(t), caseId: t.caseId, clientId: t.clientId, meta: { step: step?.order ?? 1, comment, final: true } }, tx);
      const ids = new Set([t.assigneeId, t.createdById].filter((x): x is string => !!x && x !== user.id));
      await notify([...ids].map((userId) => ({ userId, type: "task.approved", title: "وظیفه تأیید و بسته شد", body: t.title, link: `/tasks/${id}`, entityType: "Task", entityId: id })), tx);
    }
  });
}

export async function reassignTask(id: string, toUserId: string, note: string | null, user: SessionUser) {
  const t = await assertTaskAccess(user, id);
  if (!can(user, "task.assign") && t.assigneeId !== user.id) throw new ForbiddenError();
  if (!can(user, "task.assign")) throw new ForbiddenError("ارجاع وظیفه به دیگران نیازمند مجوز است.");
  if (["DONE", "CANCELLED"].includes(t.status)) throw new AppError("وظیفه خاتمه‌یافته قابل ارجاع نیست.");
  if (t.assigneeId === toUserId) throw new AppError("این کارمند هم‌اکنون مجری وظیفه است.");
  const target = await db.user.findFirst({ where: { id: toUserId, isActive: true } });
  if (!target) throw new AppError("کارمند انتخاب‌شده فعال نیست.");
  if (t.steps.some((s) => s.approverId === toUserId)) throw new AppError("تأییدکننده وظیفه نمی‌تواند مجری آن باشد.");
  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { assigneeId: toUserId, status: t.status === "WAITING_REVIEW" ? "IN_PROGRESS" : t.status, escalatedAt: null, version: { increment: 1 } } });
    await tx.assignment.create({ data: { entityType: "Task", entityId: id, fromUserId: t.assigneeId, toUserId, byUserId: user.id, note } });
    await audit({ actorId: user.id, action: "task.reassigned", entityType: "Task", entityId: id, entityLabel: label(t), caseId: t.caseId, clientId: t.clientId, meta: { from: t.assigneeId, to: toUserId, toName: target.fullName, note } }, tx);
    await notify({ userId: toUserId, type: "task.assigned", title: "وظیفه‌ای به شما ارجاع شد", body: `${t.title}${note ? ` — ${note}` : ""}`, link: `/tasks/${id}`, entityType: "Task", entityId: id, important: t.priority === "URGENT" }, tx);
    if (t.assigneeId && t.assigneeId !== user.id) await notify({ userId: t.assigneeId, type: "task.unassigned", title: "وظیفه از شما به کارمند دیگری ارجاع شد", body: t.title, link: `/tasks/${id}` }, tx);
  });
}

export async function commentTask(id: string, body: string, user: SessionUser) {
  const t = await assertTaskAccess(user, id);
  await db.$transaction(async (tx) => {
    await tx.taskComment.create({ data: { taskId: id, authorId: user.id, body: body.trim() } });
    await audit({ actorId: user.id, action: "task.commented", entityType: "Task", entityId: id, entityLabel: label(t), caseId: t.caseId, clientId: t.clientId }, tx);
    const ids = new Set([t.assigneeId, t.createdById].filter((x): x is string => !!x && x !== user.id));
    await notify([...ids].map((userId) => ({ userId, type: "task.comment", title: "نظر جدید در وظیفه", body: `${t.title}: ${body.trim().slice(0, 120)}`, link: `/tasks/${id}`, entityType: "Task", entityId: id })), tx);
  });
}

export async function listTasks(user: SessionUser, p: { q?: string; status?: string; priority?: string; view?: string; caseId?: string; page: number; pageSize: number }) {
  const and: Prisma.TaskWhereInput[] = [taskScope(user)];
  const now = new Date();
  switch (p.view) {
    case "mine": and.push({ assigneeId: user.id }); break;
    case "created": and.push({ createdById: user.id }); break;
    case "review": and.push({ status: "WAITING_REVIEW", OR: [{ approverId: user.id }, { steps: { some: { approverId: user.id, status: "PENDING" } } }] }); break;
    case "unassigned": and.push({ assigneeId: null, status: { in: OPEN } }); break;
    case "overdue": and.push({ dueAt: { lt: now }, status: { in: OPEN } }); break;
  }
  if (p.status && p.status in TASK_STATUS) and.push({ status: p.status as TaskStatus });
  else if (p.status !== "all" && p.view !== "review") and.push({ status: { in: OPEN } });
  if (p.priority && ["LOW", "NORMAL", "HIGH", "URGENT"].includes(p.priority)) and.push({ priority: p.priority as never });
  if (p.caseId) and.push({ caseId: p.caseId });
  if (p.q) { const q = p.q.trim(); and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { code: { contains: toEnDigits(q), mode: "insensitive" } }] }); }
  const where = { AND: and };
  const [total, rows] = await Promise.all([
    db.task.count({ where }),
    db.task.findMany({ where, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], skip: (p.page - 1) * p.pageSize, take: p.pageSize, include: { case: { select: { id: true, number: true, title: true } } } }),
  ]);
  return { total, rows };
}
