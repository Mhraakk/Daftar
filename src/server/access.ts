// قواعد دامنه دسترسی به رکوردها (کنترل سمت سرور). همه سرویس‌ها و APIها از این توابع استفاده می‌کنند.
import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";

export function caseScope(u: SessionUser): Prisma.CaseWhereInput {
  if (can(u, "case.view_all")) return {};
  return {
    OR: [
      { responsibleId: u.id },
      { createdById: u.id },
      { members: { some: { userId: u.id } } },
      { tasks: { some: { assigneeId: u.id } } },
    ],
  };
}

export function clientScope(u: SessionUser): Prisma.ClientWhereInput {
  if (can(u, "client.view_all")) return {};
  return { OR: [{ assignedToId: u.id }, { createdById: u.id }, { cases: { some: caseScope(u) } }] };
}

export function corrScope(u: SessionUser): Prisma.CorrespondenceWhereInput {
  if (can(u, "correspondence.view_all")) return {};
  return {
    OR: [
      { createdById: u.id },
      { currentHolderId: u.id },
      { referrals: { some: { OR: [{ toUserId: u.id }, { fromUserId: u.id }] } } },
    ],
  };
}

export function taskScope(u: SessionUser): Prisma.TaskWhereInput {
  if (can(u, "task.view_all")) return {};
  const or: Prisma.TaskWhereInput[] = [
    { assigneeId: u.id }, { createdById: u.id }, { approverId: u.id }, { steps: { some: { approverId: u.id } } },
  ];
  if (u.departmentId) or.push({ departmentId: u.departmentId, assigneeId: null });
  return { OR: or };
}

export function deadlineScope(u: SessionUser): Prisma.DeadlineWhereInput {
  if (can(u, "deadline.view_all")) return {};
  const or: Prisma.DeadlineWhereInput[] = [{ assigneeId: u.id }, { createdById: u.id }, { case: caseScope(u) }];
  // تأییدکننده مهلت‌های قانونی باید همه مهلت‌های قانونی را برای تطبیق و تأیید ببیند
  if (can(u, "deadline.verify_legal")) or.push({ isLegal: true });
  return { OR: or };
}

export function eventScope(u: SessionUser): Prisma.CalendarEventWhereInput {
  if (can(u, "calendar.view_all")) return {};
  const or: Prisma.CalendarEventWhereInput[] = [{ ownerId: u.id }, { attendees: { some: { userId: u.id } } }, { case: caseScope(u) }];
  if (u.departmentId) or.push({ departmentId: u.departmentId });
  return { OR: or };
}

export function draftScope(u: SessionUser): Prisma.LegalDraftWhereInput {
  if (can(u, "draft.view_all")) return {};
  return { OR: [{ authorId: u.id }, { reviewerId: u.id }, { case: caseScope(u) }] };
}

/** دامنه اسناد: محل نگهداری (پرونده/مراجع/مکاتبه/وظیفه/پیام) + سطح محرمانگی */
export function documentScope(u: SessionUser, opts: { includeDeleted?: boolean } = {}): Prisma.DocumentWhereInput {
  const and: Prisma.DocumentWhereInput[] = [];
  if (!opts.includeDeleted) and.push({ deletedAt: null });

  const levels: Prisma.DocumentWhereInput[] = [{ confidentiality: "NORMAL" }, { createdById: u.id }];
  if (can(u, "document.view_confidential")) levels.push({ confidentiality: "CONFIDENTIAL" });
  if (can(u, "document.view_restricted")) levels.push({ confidentiality: "RESTRICTED" });
  else levels.push({ confidentiality: "RESTRICTED", access: { some: { userId: u.id } } });
  and.push({ OR: levels });

  const everything = can(u, "case.view_all") && can(u, "client.view_all") && can(u, "correspondence.view_all");
  if (!everything) {
    and.push({
      OR: [
        { createdById: u.id },
        { access: { some: { userId: u.id } } },
        { case: caseScope(u) },
        { caseId: null, client: clientScope(u) },
        { correspondence: corrScope(u) },
        { task: taskScope(u) },
        { message: { OR: [{ senderId: u.id }, { recipients: { some: { userId: u.id } } }] } },
      ],
    });
  }
  return { AND: and };
}

async function denied(u: SessionUser, entityType: string, entityId: string): Promise<never> {
  await audit({ actorId: u.id, action: "security.forbidden", entityType, entityId });
  // برای جلوگیری از افشای وجود رکورد، پاسخ «یافت نشد» داده می‌شود
  throw new NotFoundError();
}

export async function assertCaseAccess(u: SessionUser, caseId: string) {
  const c = await db.case.findFirst({ where: { id: caseId, AND: [caseScope(u)] }, select: { id: true, number: true, title: true, clientId: true, status: true } });
  return c ?? denied(u, "Case", caseId);
}
export async function assertClientAccess(u: SessionUser, clientId: string) {
  const c = await db.client.findFirst({ where: { id: clientId, AND: [clientScope(u)] }, select: { id: true, code: true, displayName: true } });
  return c ?? denied(u, "Client", clientId);
}
export async function assertCorrAccess(u: SessionUser, id: string) {
  const c = await db.correspondence.findFirst({ where: { id, AND: [corrScope(u)] } });
  return c ?? denied(u, "Correspondence", id);
}
export async function assertTaskAccess(u: SessionUser, id: string) {
  const t = await db.task.findFirst({ where: { id, AND: [taskScope(u)] }, include: { steps: { orderBy: { order: "asc" } } } });
  return t ?? denied(u, "Task", id);
}
export async function assertDocumentAccess(u: SessionUser, id: string, opts: { includeDeleted?: boolean } = {}) {
  const d = await db.document.findFirst({ where: { id, AND: [documentScope(u, opts)] } });
  return d ?? denied(u, "Document", id);
}
export async function assertDraftAccess(u: SessionUser, id: string) {
  const d = await db.legalDraft.findFirst({ where: { id, AND: [draftScope(u)] } });
  return d ?? denied(u, "LegalDraft", id);
}
export async function assertDeadlineAccess(u: SessionUser, id: string) {
  const d = await db.deadline.findFirst({ where: { id, AND: [deadlineScope(u)] } });
  return d ?? denied(u, "Deadline", id);
}

/** نام کاربران برای نمایش (ستون‌های *ById رابطه مستقیم ندارند تا حذف کاربر تاریخچه را نشکند) */
export async function userNames(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return {};
  const rows = await db.user.findMany({ where: { id: { in: uniq } }, select: { id: true, fullName: true } });
  return Object.fromEntries(rows.map((r) => [r.id, r.fullName]));
}

export async function managerIds(): Promise<string[]> {
  const rows = await db.user.findMany({
    where: { isActive: true, role: { permissions: { some: { permissionKey: "dashboard.manager" } } }, NOT: { role: { key: "auditor" } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
