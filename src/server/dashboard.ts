import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { addDays, startOfTehranDay } from "@/lib/jalali";
import { caseScope, documentScope, eventScope, userNames } from "./access";

const OPEN_TASK = ["TODO", "IN_PROGRESS", "WAITING_REVIEW", "REJECTED"] as const;

export async function personalDashboard(user: SessionUser) {
  const now = new Date();
  const today = startOfTehranDay(now);
  const weekEnd = addDays(today, 7);
  const [
    unseenReferrals, inboxCount, openTasks, overdueTasks, weekDeadlines, overdueDeadlines, toReview, unreadMessages,
    urgentDeadlines, myTasks, inbox, myCases, events, recentDocs, activity,
  ] = await Promise.all([
    db.referral.count({ where: { toUserId: user.id, status: "PENDING" } }),
    db.correspondence.count({ where: { currentHolderId: user.id, status: { in: ["REGISTERED", "IN_PROGRESS"] } } }),
    db.task.count({ where: { assigneeId: user.id, status: { in: [...OPEN_TASK] } } }),
    db.task.count({ where: { assigneeId: user.id, status: { in: [...OPEN_TASK] }, dueAt: { lt: now } } }),
    db.deadline.count({ where: { assigneeId: user.id, status: "OPEN", dueAt: { gte: now, lt: weekEnd } } }),
    db.deadline.count({ where: { assigneeId: user.id, status: "OPEN", dueAt: { lt: now } } }),
    db.task.count({ where: { status: "WAITING_REVIEW", OR: [{ approverId: user.id }, { steps: { some: { approverId: user.id, status: "PENDING" } } }] } }),
    db.messageRecipient.count({ where: { userId: user.id, readAt: null, archivedAt: null } }),
    db.deadline.findMany({ where: { assigneeId: user.id, status: "OPEN", dueAt: { lt: weekEnd } }, orderBy: { dueAt: "asc" }, take: 6, include: { case: { select: { id: true, number: true, title: true } } } }),
    db.task.findMany({ where: { assigneeId: user.id, status: { in: [...OPEN_TASK] } }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 6, include: { case: { select: { id: true, number: true } } } }),
    db.correspondence.findMany({ where: { currentHolderId: user.id, status: { in: ["REGISTERED", "IN_PROGRESS"] } }, orderBy: { updatedAt: "desc" }, take: 5, include: { referrals: { where: { toUserId: user.id }, orderBy: { createdAt: "desc" }, take: 1 } } }),
    can(user, "case.view") ? db.case.findMany({ where: { status: { notIn: ["CLOSED", "ARCHIVED"] }, OR: [{ responsibleId: user.id }, { members: { some: { userId: user.id } } }] }, orderBy: { updatedAt: "desc" }, take: 5, include: { client: { select: { displayName: true } } } }) : [],
    can(user, "calendar.view") ? db.calendarEvent.findMany({ where: { cancelledAt: null, startAt: { gte: today, lt: addDays(today, 14) }, AND: [eventScope(user)], OR: [{ ownerId: user.id }, { attendees: { some: { userId: user.id } } }] }, orderBy: { startAt: "asc" }, take: 5 }) : [],
    can(user, "document.view") ? db.document.findMany({ where: documentScope(user), orderBy: { updatedAt: "desc" }, take: 5, include: { versions: { orderBy: { versionNo: "desc" }, take: 1, select: { fileName: true } } } }) : [],
    db.activityLog.findMany({ where: { actorId: user.id, action: { notIn: ["auth.login", "auth.logout", "document.viewed"] } }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const senders = await userNames(inbox.map((c) => c.referrals[0]?.fromUserId));
  return {
    counts: { unseenReferrals, inboxCount, openTasks, overdueTasks, weekDeadlines, overdueDeadlines, toReview, unreadMessages },
    urgentDeadlines, myTasks, inbox, senders, myCases, events, recentDocs, activity,
  };
}

export async function managerDashboard(user: SessionUser) {
  const now = new Date();
  const scope = caseScope(user);
  const [openCases, unassignedCases, intakeCases, overdueTasks, unassignedTasks, overdueDeadlines, unverifiedLegal, activeCorr, statusGroups, users, taskLoads, caseLoads, overdueByUser] = await Promise.all([
    db.case.count({ where: { AND: [scope], status: { notIn: ["CLOSED", "ARCHIVED"] } } }),
    db.case.count({ where: { AND: [scope], responsibleId: null, status: { notIn: ["CLOSED", "ARCHIVED"] } } }),
    db.case.count({ where: { AND: [scope], status: "INTAKE" } }),
    db.task.count({ where: { status: { in: [...OPEN_TASK] }, dueAt: { lt: now } } }),
    db.task.count({ where: { status: { in: [...OPEN_TASK] }, assigneeId: null } }),
    db.deadline.count({ where: { status: "OPEN", dueAt: { lt: now } } }),
    db.deadline.count({ where: { status: "OPEN", isLegal: true, verifiedAt: null } }),
    db.correspondence.count({ where: { status: { in: ["REGISTERED", "IN_PROGRESS"] } } }),
    db.case.groupBy({ by: ["status"], _count: true }),
    db.user.findMany({ where: { isActive: true, NOT: { role: { key: { in: ["admin", "auditor"] } } } }, select: { id: true, fullName: true, title: true, department: { select: { name: true } } }, orderBy: { fullName: "asc" } }),
    db.task.groupBy({ by: ["assigneeId"], where: { status: { in: [...OPEN_TASK] }, assigneeId: { not: null } }, _count: true }),
    db.case.groupBy({ by: ["responsibleId"], where: { status: { notIn: ["CLOSED", "ARCHIVED"] }, responsibleId: { not: null } }, _count: true }),
    db.task.groupBy({ by: ["assigneeId"], where: { status: { in: [...OPEN_TASK] }, dueAt: { lt: now }, assigneeId: { not: null } }, _count: true }),
  ]);
  const tl = new Map(taskLoads.map((x) => [x.assigneeId, x._count]));
  const cl = new Map(caseLoads.map((x) => [x.responsibleId, x._count]));
  const ol = new Map(overdueByUser.map((x) => [x.assigneeId, x._count]));
  const workload = users.map((u) => ({ id: u.id, name: u.fullName, sub: u.department?.name ?? u.title ?? "", tasks: tl.get(u.id) ?? 0, cases: cl.get(u.id) ?? 0, overdue: ol.get(u.id) ?? 0 }))
    .sort((a, b) => b.tasks + b.cases - (a.tasks + a.cases));
  return {
    counts: { openCases, unassignedCases, intakeCases, overdueTasks, unassignedTasks, overdueDeadlines, unverifiedLegal, activeCorr },
    statusGroups: statusGroups.map((s) => ({ status: s.status, count: s._count })), workload,
  };
}
