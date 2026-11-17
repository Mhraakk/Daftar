import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { addDays, startOfTehranDay } from "@/lib/jalali";
import { caseScope, deadlineScope, documentScope, eventScope, userNames } from "./access";

const OPEN_TASK = ["TODO", "IN_PROGRESS", "WAITING_REVIEW", "REJECTED"] as const;
/** افق ستون‌های مهلت در پیشخوان (روز) */
export const DEADLINE_HORIZON_DAYS = 14;
const WEEK_DAYS = 7;
const LIST_ITEMS = 6;
const SHORT_LIST = 5;
const ACTIVITY_ITEMS = 8;

export async function personalDashboard(user: SessionUser) {
  const now = new Date();
  const today = startOfTehranDay(now);
  const weekEnd = addDays(today, WEEK_DAYS);
  const [
    unseenReferrals, inboxCount, openTasks, overdueTasks, weekDeadlines, overdueDeadlines, toReview, unreadMessages,
    urgentDeadlines, myTasks, inbox, myCases, events, recentDocs, activity, horizon,
  ] = await Promise.all([
    db.referral.count({ where: { toUserId: user.id, status: "PENDING" } }),
    db.correspondence.count({ where: { currentHolderId: user.id, status: { in: ["REGISTERED", "IN_PROGRESS"] } } }),
    db.task.count({ where: { assigneeId: user.id, status: { in: [...OPEN_TASK] } } }),
    db.task.count({ where: { assigneeId: user.id, status: { in: [...OPEN_TASK] }, dueAt: { lt: now } } }),
    db.deadline.count({ where: { assigneeId: user.id, status: "OPEN", dueAt: { gte: now, lt: weekEnd } } }),
    db.deadline.count({ where: { assigneeId: user.id, status: "OPEN", dueAt: { lt: now } } }),
    db.task.count({ where: { status: "WAITING_REVIEW", OR: [{ approverId: user.id }, { steps: { some: { approverId: user.id, status: "PENDING" } } }] } }),
    db.messageRecipient.count({ where: { userId: user.id, readAt: null, archivedAt: null } }),
    db.deadline.findMany({ where: { assigneeId: user.id, status: "OPEN", dueAt: { lt: weekEnd } }, orderBy: { dueAt: "asc" }, take: LIST_ITEMS, include: { case: { select: { id: true, number: true, title: true } } } }),
    db.task.findMany({ where: { assigneeId: user.id, status: { in: [...OPEN_TASK] } }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: LIST_ITEMS, include: { case: { select: { id: true, number: true } } } }),
    db.correspondence.findMany({ where: { currentHolderId: user.id, status: { in: ["REGISTERED", "IN_PROGRESS"] } }, orderBy: { updatedAt: "desc" }, take: SHORT_LIST, include: { referrals: { where: { toUserId: user.id }, orderBy: { createdAt: "desc" }, take: 1 } } }),
    can(user, "case.view") ? db.case.findMany({ where: { status: { notIn: ["CLOSED", "ARCHIVED"] }, OR: [{ responsibleId: user.id }, { members: { some: { userId: user.id } } }] }, orderBy: { updatedAt: "desc" }, take: SHORT_LIST, include: { client: { select: { displayName: true } } } }) : [],
    can(user, "calendar.view") ? db.calendarEvent.findMany({ where: { cancelledAt: null, startAt: { gte: today, lt: addDays(today, DEADLINE_HORIZON_DAYS) }, AND: [eventScope(user)], OR: [{ ownerId: user.id }, { attendees: { some: { userId: user.id } } }] }, orderBy: { startAt: "asc" }, take: SHORT_LIST }) : [],
    can(user, "document.view") ? db.document.findMany({ where: documentScope(user), orderBy: { updatedAt: "desc" }, take: SHORT_LIST, include: { versions: { orderBy: { versionNo: "desc" }, take: 1, select: { fileName: true } } } }) : [],
    db.activityLog.findMany({ where: { actorId: user.id, action: { notIn: ["auth.login", "auth.logout", "document.viewed"] } }, orderBy: { createdAt: "desc" }, take: ACTIVITY_ITEMS }),
    db.deadline.findMany({ where: { assigneeId: user.id, status: "OPEN", dueAt: { gte: today, lt: addDays(today, DEADLINE_HORIZON_DAYS) } }, select: { dueAt: true } }),
  ]);
  const senders = await userNames(inbox.map((c) => c.referrals[0]?.fromUserId));
  return {
    counts: { unseenReferrals, inboxCount, openTasks, overdueTasks, weekDeadlines, overdueDeadlines, toReview, unreadMessages },
    urgentDeadlines, myTasks, inbox, senders, myCases, events, recentDocs, activity, horizon: horizon.map((h) => h.dueAt), today,
  };
}

export async function managerDashboard(user: SessionUser) {
  const now = new Date();
  const scope = caseScope(user);
  const today = startOfTehranDay(now);
  const [openCases, unassignedCases, intakeCases, overdueTasks, unassignedTasks, overdueDeadlines, unverifiedLegal, activeCorr, statusGroups, users, taskLoads, caseLoads, overdueByUser, horizon] = await Promise.all([
    db.case.count({ where: { AND: [scope], status: { notIn: ["CLOSED", "ARCHIVED"] } } }),
    db.case.count({ where: { AND: [scope], responsibleId: null, status: { notIn: ["CLOSED", "ARCHIVED"] } } }),
    db.case.count({ where: { AND: [scope], status: "INTAKE" } }),
    db.task.count({ where: { status: { in: [...OPEN_TASK] }, dueAt: { lt: now } } }),
    db.task.count({ where: { status: { in: [...OPEN_TASK] }, assigneeId: null } }),
    db.deadline.count({ where: { status: "OPEN", dueAt: { lt: now } } }),
    db.deadline.count({ where: { status: "OPEN", isLegal: true, verifiedAt: null } }),
    db.correspondence.count({ where: { status: { in: ["REGISTERED", "IN_PROGRESS"] } } }),
    db.case.groupBy({ by: ["status"], where: scope, _count: true }),
    db.user.findMany({ where: { isActive: true, NOT: { role: { key: { in: ["admin", "auditor"] } } } }, select: { id: true, fullName: true, title: true, department: { select: { name: true } } }, orderBy: { fullName: "asc" } }),
    db.task.groupBy({ by: ["assigneeId"], where: { status: { in: [...OPEN_TASK] }, assigneeId: { not: null } }, _count: true }),
    db.case.groupBy({ by: ["responsibleId"], where: { status: { notIn: ["CLOSED", "ARCHIVED"] }, responsibleId: { not: null } }, _count: true }),
    db.task.groupBy({ by: ["assigneeId"], where: { status: { in: [...OPEN_TASK] }, dueAt: { lt: now }, assigneeId: { not: null } }, _count: true }),
    db.deadline.findMany({ where: { status: "OPEN", dueAt: { gte: today, lt: addDays(today, DEADLINE_HORIZON_DAYS) }, AND: [deadlineScope(user)] }, select: { dueAt: true } }),
  ]);
  const tl = new Map(taskLoads.map((x) => [x.assigneeId, x._count]));
  const cl = new Map(caseLoads.map((x) => [x.responsibleId, x._count]));
  const ol = new Map(overdueByUser.map((x) => [x.assigneeId, x._count]));
  const workload = users.map((u) => ({ id: u.id, name: u.fullName, sub: u.department?.name ?? u.title ?? "", tasks: tl.get(u.id) ?? 0, cases: cl.get(u.id) ?? 0, overdue: ol.get(u.id) ?? 0 }))
    .sort((a, b) => b.tasks + b.cases - (a.tasks + a.cases));
  return {
    counts: { openCases, unassignedCases, intakeCases, overdueTasks, unassignedTasks, overdueDeadlines, unverifiedLegal, activeCorr },
    statusGroups: statusGroups.map((s) => ({ status: s.status, count: s._count })), workload, horizon: horizon.map((h) => h.dueAt), today,
  };
}
