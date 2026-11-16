import type { SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { addDays, formatJalali, fromJalali, jParts, shiftMonth, J_MONTHS } from "@/lib/jalali";
import { toFaDigits } from "@/lib/text";

const OPEN = ["TODO", "IN_PROGRESS", "WAITING_REVIEW", "REJECTED"] as const;

export interface ReportRange { from: Date; to: Date; label: string }

export function resolveRange(period?: string): ReportRange {
  const now = new Date();
  const p = jParts(now);
  if (period === "year") return { from: fromJalali(p.jy, 1, 1), to: addDays(now, 1), label: `سال ${toFaDigits(p.jy)}` };
  if (period === "prev") { const m = shiftMonth(p.jy, p.jm, -1); return { from: fromJalali(m.jy, m.jm, 1), to: fromJalali(p.jy, p.jm, 1), label: `${J_MONTHS[m.jm - 1]} ${toFaDigits(m.jy)}` }; }
  if (period === "90") return { from: addDays(now, -90), to: addDays(now, 1), label: "۹۰ روز اخیر" };
  return { from: fromJalali(p.jy, p.jm, 1), to: addDays(now, 1), label: `${J_MONTHS[p.jm - 1]} ${toFaDigits(p.jy)}` };
}

/** همه شاخص‌ها مستقیماً از رکوردهای واقعی پایگاه داده محاسبه می‌شوند. */
export async function officeReport(_user: SessionUser, range: ReportRange) {
  const now = new Date();
  const inRange = { gte: range.from, lt: range.to };
  const [
    newClients, newCases, closedCases, docs, docSize, corrIn, corrOut, corrInt, tasksCreated, tasksDone, overdueTasks, deadlinesDone, deadlinesMissed, overdueDeadlines,
    casesByStatus, casesByCategory, docsByCategory, users, taskOpenBy, taskDoneBy, taskLateBy, caseBy, depts, doneTasks, pendingReferrals, topClients, trendCases, trendTasks,
  ] = await Promise.all([
    db.client.count({ where: { createdAt: inRange } }), db.case.count({ where: { createdAt: inRange } }), db.case.count({ where: { closedAt: inRange } }),
    db.document.count({ where: { createdAt: inRange, deletedAt: null } }), db.documentVersion.aggregate({ _sum: { size: true }, where: { createdAt: inRange } }),
    db.correspondence.count({ where: { registeredAt: inRange, direction: "INCOMING" } }), db.correspondence.count({ where: { registeredAt: inRange, direction: "OUTGOING" } }), db.correspondence.count({ where: { registeredAt: inRange, direction: "INTERNAL" } }),
    db.task.count({ where: { createdAt: inRange } }), db.task.count({ where: { completedAt: inRange, status: "DONE" } }), db.task.count({ where: { status: { in: [...OPEN] }, dueAt: { lt: now } } }),
    db.deadline.count({ where: { completedAt: inRange } }), db.deadline.count({ where: { status: "MISSED", updatedAt: inRange } }), db.deadline.count({ where: { status: "OPEN", dueAt: { lt: now } } }),
    db.case.groupBy({ by: ["status"], _count: true }), db.case.groupBy({ by: ["category"], _count: true, where: { createdAt: inRange } }), db.document.groupBy({ by: ["category"], _count: true, where: { deletedAt: null } }),
    db.user.findMany({ where: { isActive: true, NOT: { role: { key: { in: ["admin", "auditor"] } } } }, select: { id: true, fullName: true, departmentId: true, department: { select: { name: true } } }, orderBy: { fullName: "asc" } }),
    db.task.groupBy({ by: ["assigneeId"], where: { status: { in: [...OPEN] } }, _count: true }),
    db.task.groupBy({ by: ["assigneeId"], where: { status: "DONE", completedAt: inRange }, _count: true }),
    db.task.groupBy({ by: ["assigneeId"], where: { status: { in: [...OPEN] }, dueAt: { lt: now } }, _count: true }),
    db.case.groupBy({ by: ["responsibleId"], where: { status: { notIn: ["CLOSED", "ARCHIVED"] } }, _count: true }),
    db.department.findMany({ select: { id: true, name: true } }),
    db.task.findMany({ where: { status: "DONE", completedAt: inRange, startedAt: { not: null } }, select: { createdAt: true, completedAt: true, dueAt: true }, take: 5000 }),
    db.referral.count({ where: { status: { in: ["PENDING", "SEEN"] } } }),
    db.case.groupBy({ by: ["clientId"], _count: true, where: { createdAt: inRange }, orderBy: { _count: { clientId: "desc" } }, take: 8 }),
    db.$queryRaw<{ d: Date; n: bigint }[]>`SELECT date_trunc('week', "createdAt") AS d, count(*) AS n FROM "Case" WHERE "createdAt" >= ${addDays(now, -84)} GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<{ d: Date; n: bigint }[]>`SELECT date_trunc('week', "completedAt") AS d, count(*) AS n FROM "Task" WHERE "completedAt" >= ${addDays(now, -84)} AND "status" = 'DONE' GROUP BY 1 ORDER BY 1`,
  ]);
  const g = (rows: { _count: number }[], key: string) => new Map(rows.map((r) => [(r as unknown as Record<string, string | null>)[key], r._count]));
  const o = g(taskOpenBy, "assigneeId"), dn = g(taskDoneBy, "assigneeId"), lt = g(taskLateBy, "assigneeId"), cb = g(caseBy, "responsibleId");
  const employees = users.map((u) => ({ id: u.id, name: u.fullName, department: u.department?.name ?? "—", departmentId: u.departmentId, cases: cb.get(u.id) ?? 0, open: o.get(u.id) ?? 0, done: dn.get(u.id) ?? 0, overdue: lt.get(u.id) ?? 0 }));
  const departments = depts.map((d) => { const m = employees.filter((e) => e.departmentId === d.id); return { name: d.name, staff: m.length, cases: m.reduce((a, e) => a + e.cases, 0), open: m.reduce((a, e) => a + e.open, 0), done: m.reduce((a, e) => a + e.done, 0), overdue: m.reduce((a, e) => a + e.overdue, 0) }; });
  const durations = doneTasks.map((t) => (t.completedAt!.getTime() - t.createdAt.getTime()) / 86_400_000);
  const withDue = doneTasks.filter((t) => t.dueAt);
  const clientNames = topClients.length ? await db.client.findMany({ where: { id: { in: topClients.map((c) => c.clientId) } }, select: { id: true, displayName: true } }) : [];
  // ۱۲ هفته اخیر با پرکردن هفته‌های بدون رکورد
  const weeks: { label: string; cases: number; tasks: number }[] = [];
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const mc = new Map(trendCases.map((r) => [key(r.d), Number(r.n)])), mt = new Map(trendTasks.map((r) => [key(r.d), Number(r.n)]));
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  for (let i = 11; i >= 0; i--) { const d = addDays(monday, -7 * i); weeks.push({ label: formatJalali(d, "date").slice(5), cases: mc.get(key(d)) ?? 0, tasks: mt.get(key(d)) ?? 0 }); }
  return {
    range,
    totals: { newClients, newCases, closedCases, docs, docBytes: docSize._sum.size ?? 0, corrIn, corrOut, corrInt, tasksCreated, tasksDone, overdueTasks, deadlinesDone, deadlinesMissed, overdueDeadlines, pendingReferrals },
    casesByStatus: casesByStatus.map((x) => ({ key: x.status, count: x._count })), casesByCategory: casesByCategory.map((x) => ({ key: x.category, count: x._count })).sort((a, b) => b.count - a.count),
    docsByCategory: docsByCategory.map((x) => ({ key: x.category, count: x._count })).sort((a, b) => b.count - a.count),
    employees, departments, weeks,
    workflow: {
      avgDays: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
      onTimeRate: withDue.length ? withDue.filter((t) => t.completedAt! <= t.dueAt!).length / withDue.length : null, sample: durations.length,
    },
    topClients: topClients.map((c) => ({ name: clientNames.find((n) => n.id === c.clientId)?.displayName ?? "—", count: c._count })),
  };
}
export type OfficeReport = Awaited<ReturnType<typeof officeReport>>;
