// گزارش عملکرد دفتر: همه شاخص‌ها از رکوردهای واقعی و در محدوده دسترسی کاربر محاسبه می‌شود.
// دوره پیش‌ساخته یا دلخواه شمسی، با مقایسه با «دوره هم‌طول قبل»؛ هفته‌ها از شنبه و به وقت تهران.
import type { SessionUser } from "@/lib/auth/guard";
import { countBy, rangePeriods, type Bucket } from "@/lib/chart/time";
import { db } from "@/lib/db";
import { addDays, formatJalali, fromJalali, jParts, J_MONTHS, parseJalali, shiftMonth, startOfTehranDay } from "@/lib/jalali";
import { toFaDigits } from "@/lib/text";
import { caseScope, clientScope, corrScope, deadlineScope, documentScope, taskScope } from "./access";

const OPEN_TASK = ["TODO", "IN_PROGRESS", "WAITING_REVIEW", "REJECTED"] as ("TODO" | "IN_PROGRESS" | "WAITING_REVIEW" | "REJECTED")[];
const MS_PER_DAY = 86_400_000;
const WEEKLY_MAX_DAYS = 92;
const MAX_RANGE_DAYS = 1_100;
const PRESET_90 = 90;
const TOP_CLIENTS = 8;
const ROW_CAP = 20_000;
/** مرز بالای هر ستون نمودار زمان انجام وظیفه (روز) */
// eslint-disable-next-line ts-patterns/no-magic-numbers -- histogram bin edges in days
const CYCLE_EDGES = [1, 3, 7, 14, 30];
const CYCLE_LABELS = ["کمتر از ۱ روز", "۱ تا ۳ روز", "۳ تا ۷ روز", "۷ تا ۱۴ روز", "۱۴ تا ۳۰ روز", "بیش از ۳۰ روز"];

export const PRESETS = [["month", "ماه جاری"], ["prev", "ماه قبل"], ["90", "۹۰ روز اخیر"], ["year", "سال جاری"]] as const;
export interface ReportRange { from: Date; to: Date; label: string; key: string; fromInput: string; toInput: string }
export interface RangeQuery { period?: string; from?: string; to?: string }

const make = (from: Date, to: Date, label: string, key: string): ReportRange =>
  ({ from, to, label, key, fromInput: formatJalali(from, "date"), toInput: formatJalali(addDays(to, -1), "date") });

const PRESET_RANGES: Record<string, (now: Date) => ReportRange> = {
  year: (now) => make(fromJalali(jParts(now).jy, 1, 1), addDays(startOfTehranDay(now), 1), `سال ${toFaDigits(jParts(now).jy)}`, "year"),
  prev: (now) => {
    const p = jParts(now);
    const m = shiftMonth(p.jy, p.jm, -1);
    return make(fromJalali(m.jy, m.jm, 1), fromJalali(p.jy, p.jm, 1), `${J_MONTHS[m.jm - 1]} ${toFaDigits(m.jy)}`, "prev");
  },
  "90": (now) => make(addDays(startOfTehranDay(now), -PRESET_90 + 1), addDays(startOfTehranDay(now), 1), "۹۰ روز اخیر", "90"),
  month: (now) => {
    const p = jParts(now);
    return make(fromJalali(p.jy, p.jm, 1), addDays(startOfTehranDay(now), 1), `${J_MONTHS[p.jm - 1]} ${toFaDigits(p.jy)}`, "month");
  },
};

/** بازه گزارش: «از/تا» شمسی دلخواه (روز پایان هم شمرده می‌شود) یا یکی از دوره‌های پیش‌ساخته */
export function resolveRange(q: RangeQuery = {}, now = new Date()): ReportRange {
  // نیمه‌شب تهران (نه UTC)، تا روزهای بازه با روزهای تقویم دفتر یکی باشد
  const from = q.from ? parseJalali(q.from) : null;
  const last = q.to ? parseJalali(q.to) : null;
  if (from && last && last >= from && (last.getTime() - from.getTime()) / MS_PER_DAY <= MAX_RANGE_DAYS) {
    return make(from, addDays(last, 1), `${formatJalali(from, "date")} تا ${formatJalali(last, "date")}`, "custom");
  }
  return (PRESET_RANGES[q.period ?? "month"] ?? PRESET_RANGES.month)(now);
}

/** دوره هم‌طولِ بلافاصله پیش از بازه، برای مقایسه */
export function previousRange(r: ReportRange): ReportRange {
  const len = r.to.getTime() - r.from.getTime();
  const from = new Date(r.from.getTime() - len);
  return make(from, r.from, `${formatJalali(from, "date")} تا ${formatJalali(addDays(r.from, -1), "date")}`, "previous");
}

async function totalsFor(user: SessionUser, from: Date, to: Date) {
  const inRange = { gte: from, lt: to };
  const [newClients, newCases, closedCases, docs, corrIn, corrOut, tasksDone, deadlinesDone] = await Promise.all([
    db.client.count({ where: { createdAt: inRange, AND: [clientScope(user)] } }),
    db.case.count({ where: { createdAt: inRange, AND: [caseScope(user)] } }),
    db.case.count({ where: { closedAt: inRange, AND: [caseScope(user)] } }),
    db.document.count({ where: { createdAt: inRange, AND: [documentScope(user)] } }),
    db.correspondence.count({ where: { registeredAt: inRange, direction: "INCOMING", AND: [corrScope(user)] } }),
    db.correspondence.count({ where: { registeredAt: inRange, direction: "OUTGOING", AND: [corrScope(user)] } }),
    db.task.count({ where: { completedAt: inRange, status: "DONE", AND: [taskScope(user)] } }),
    db.deadline.count({ where: { completedAt: inRange, status: "DONE", AND: [deadlineScope(user)] } }),
  ]);
  return { newClients, newCases, closedCases, docs, corrIn, corrOut, tasksDone, deadlinesDone };
}
export type ReportTotals = Awaited<ReturnType<typeof totalsFor>>;

const cycleBin = (days: number): number => {
  const i = CYCLE_EDGES.findIndex((edge) => days < edge);
  return i < 0 ? CYCLE_EDGES.length : i;
};

/** پیامد مهلت‌هایی که سررسیدشان در بازه است */
function deadlineOutcomes(rows: { status: string; dueAt: Date; completedAt: Date | null }[], now: Date): { label: string; value: number }[] {
  const of = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  return [
    { label: "انجام در موعد", value: of((r) => r.status === "DONE" && !!r.completedAt && r.completedAt <= r.dueAt) },
    { label: "انجام پس از موعد", value: of((r) => r.status === "DONE" && (!r.completedAt || r.completedAt > r.dueAt)) },
    { label: "ازدست‌رفته", value: of((r) => r.status === "MISSED") },
    { label: "باز و گذشته از موعد", value: of((r) => r.status === "OPEN" && r.dueAt < now) },
    { label: "باز و در پیش", value: of((r) => r.status === "OPEN" && r.dueAt >= now) },
  ];
}

export async function officeReport(user: SessionUser, range: ReportRange, now = new Date()) {
  const prev = previousRange(range);
  const len = range.to.getTime() - range.from.getTime();
  const bucket: Bucket = len / MS_PER_DAY <= WEEKLY_MAX_DAYS ? "week" : "month";
  const buckets = rangePeriods(bucket, range.from, range.to);
  const both = { gte: prev.from, lt: range.to };
  const inRange = { gte: range.from, lt: range.to };
  const [
    totals, previous, caseDates, taskDates, corrRows, createdTasks, dueDeadlines, doneTasks, overdueTasks, overdueDeadlines, pendingReferrals, docSize, corrInt,
    tasksCreated, casesByStatus, casesByCategory, docsByCategory, users, taskOpenBy, taskDoneBy, taskLateBy, caseBy, depts, topClients,
  ] = await Promise.all([
    totalsFor(user, range.from, range.to),
    totalsFor(user, prev.from, prev.to),
    db.case.findMany({ where: { createdAt: both, AND: [caseScope(user)] }, select: { createdAt: true }, take: ROW_CAP }),
    db.task.findMany({ where: { completedAt: both, status: "DONE", AND: [taskScope(user)] }, select: { completedAt: true }, take: ROW_CAP }),
    db.correspondence.findMany({ where: { registeredAt: inRange, direction: { in: ["INCOMING", "OUTGOING"] }, AND: [corrScope(user)] }, select: { registeredAt: true, direction: true }, take: ROW_CAP }),
    db.task.findMany({ where: { createdAt: inRange, AND: [taskScope(user)] }, select: { startedAt: true, status: true, completedAt: true, dueAt: true }, take: ROW_CAP }),
    db.deadline.findMany({ where: { dueAt: inRange, status: { not: "CANCELLED" }, AND: [deadlineScope(user)] }, select: { status: true, dueAt: true, completedAt: true }, take: ROW_CAP }),
    db.task.findMany({ where: { status: "DONE", completedAt: inRange, AND: [taskScope(user)] }, select: { createdAt: true, completedAt: true, dueAt: true }, take: ROW_CAP }),
    db.task.count({ where: { status: { in: OPEN_TASK }, dueAt: { lt: now }, AND: [taskScope(user)] } }),
    db.deadline.count({ where: { status: "OPEN", dueAt: { lt: now }, AND: [deadlineScope(user)] } }),
    db.referral.count({ where: { status: { in: ["PENDING", "SEEN"] }, correspondence: corrScope(user) } }),
    db.documentVersion.aggregate({ _sum: { size: true }, where: { createdAt: inRange, document: documentScope(user) } }),
    db.correspondence.count({ where: { registeredAt: inRange, direction: "INTERNAL", AND: [corrScope(user)] } }),
    db.task.count({ where: { createdAt: inRange, AND: [taskScope(user)] } }),
    db.case.groupBy({ by: ["status"], where: caseScope(user), _count: true }),
    db.case.groupBy({ by: ["category"], _count: true, where: { createdAt: inRange, AND: [caseScope(user)] } }),
    db.document.groupBy({ by: ["category"], _count: true, where: { AND: [documentScope(user)] } }),
    db.user.findMany({ where: { isActive: true, NOT: { role: { key: { in: ["admin", "auditor"] } } } }, select: { id: true, fullName: true, departmentId: true, department: { select: { name: true } } }, orderBy: { fullName: "asc" } }),
    db.task.groupBy({ by: ["assigneeId"], where: { status: { in: OPEN_TASK }, AND: [taskScope(user)] }, _count: true }),
    db.task.groupBy({ by: ["assigneeId"], where: { status: "DONE", completedAt: inRange, AND: [taskScope(user)] }, _count: true }),
    db.task.groupBy({ by: ["assigneeId"], where: { status: { in: OPEN_TASK }, dueAt: { lt: now }, AND: [taskScope(user)] }, _count: true }),
    db.case.groupBy({ by: ["responsibleId"], where: { status: { notIn: ["CLOSED", "ARCHIVED"] }, AND: [caseScope(user)] }, _count: true }),
    db.department.findMany({ select: { id: true, name: true } }),
    db.case.groupBy({ by: ["clientId"], _count: true, where: { createdAt: inRange, AND: [caseScope(user)] }, orderBy: { _count: { clientId: "desc" } }, take: TOP_CLIENTS }),
  ]);

  const shifted = (dates: Date[]) => dates.filter((d) => d < range.from).map((d) => new Date(d.getTime() + len));
  const current = (dates: Date[]) => dates.filter((d) => d >= range.from);
  const cases = caseDates.map((c) => c.createdAt);
  const done = taskDates.flatMap((t) => (t.completedAt ? [t.completedAt] : []));
  const series = {
    cases: { cur: countBy(buckets, current(cases)), prev: countBy(buckets, shifted(cases)) },
    tasksDone: { cur: countBy(buckets, current(done)), prev: countBy(buckets, shifted(done)) },
    corrIn: countBy(buckets, corrRows.filter((r) => r.direction === "INCOMING").map((r) => r.registeredAt)),
    corrOut: countBy(buckets, corrRows.filter((r) => r.direction === "OUTGOING").map((r) => r.registeredAt)),
  };

  const funnel = [
    { label: "وظیفه ثبت‌شده", value: createdTasks.length },
    { label: "آغازشده", value: createdTasks.filter((t) => t.startedAt).length },
    { label: "انجام‌شده", value: createdTasks.filter((t) => t.status === "DONE").length },
    { label: "انجام در موعد", value: createdTasks.filter((t) => t.status === "DONE" && t.dueAt && t.completedAt && t.completedAt <= t.dueAt).length },
  ];
  const durations = doneTasks.flatMap((t) => (t.completedAt ? [(t.completedAt.getTime() - t.createdAt.getTime()) / MS_PER_DAY] : []));
  const cycle = CYCLE_LABELS.map((label, i) => ({ label, value: durations.filter((d) => cycleBin(d) === i).length }));
  const withDue = doneTasks.filter((t) => t.dueAt && t.completedAt);

  const g = (rows: { _count: number }[], key: string) => new Map(rows.map((r) => [(r as unknown as Record<string, string | null>)[key], r._count]));
  const [o, dn, lt, cb] = [g(taskOpenBy, "assigneeId"), g(taskDoneBy, "assigneeId"), g(taskLateBy, "assigneeId"), g(caseBy, "responsibleId")];
  const employees = users.map((u) => ({ id: u.id, name: u.fullName, department: u.department?.name ?? "—", departmentId: u.departmentId, cases: cb.get(u.id) ?? 0, open: o.get(u.id) ?? 0, done: dn.get(u.id) ?? 0, overdue: lt.get(u.id) ?? 0 }));
  const sum = (list: typeof employees, k: "cases" | "open" | "done" | "overdue") => list.reduce((a, e) => a + e[k], 0);
  const departments = depts.map((d) => {
    const m = employees.filter((e) => e.departmentId === d.id);
    return { name: d.name, staff: m.length, cases: sum(m, "cases"), open: sum(m, "open"), done: sum(m, "done"), overdue: sum(m, "overdue") };
  });
  const clientNames = topClients.length ? await db.client.findMany({ where: { id: { in: topClients.map((c) => c.clientId) } }, select: { id: true, displayName: true } }) : [];

  return {
    range, prev, bucket, buckets: buckets.map((b) => ({ label: b.label, long: b.long })),
    totals: { ...totals, docBytes: docSize._sum.size ?? 0, corrInt, tasksCreated, overdueTasks, overdueDeadlines, pendingReferrals, deadlinesMissed: dueDeadlines.filter((d) => d.status === "MISSED").length },
    previous, series, funnel, deadlineOutcomes: deadlineOutcomes(dueDeadlines, now), cycle,
    casesByStatus: casesByStatus.map((x) => ({ key: x.status, count: x._count })),
    casesByCategory: casesByCategory.map((x) => ({ key: x.category, count: x._count })).sort((a, b) => b.count - a.count),
    docsByCategory: docsByCategory.map((x) => ({ key: x.category, count: x._count })).sort((a, b) => b.count - a.count),
    employees, departments,
    workflow: {
      avgDays: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
      onTimeRate: withDue.length ? withDue.filter((t) => (t.completedAt as Date) <= (t.dueAt as Date)).length / withDue.length : null,
      sample: durations.length,
    },
    topClients: topClients.map((c) => ({ name: clientNames.find((n) => n.id === c.clientId)?.displayName ?? "—", count: c._count })),
  };
}
export type OfficeReport = Awaited<ReturnType<typeof officeReport>>;
