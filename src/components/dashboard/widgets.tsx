// ویجت‌های پیشخوان (رندر سمت سرور): فهرست‌های کار شخصی، شمارش معکوس مهلت‌ها، ستون‌های ۱۴ روزه، بار کاری و وضعیت پرونده‌ها
import { AlarmClock, CalendarDays, FileText, FolderOpen, Inbox, ListChecks, MessagesSquare, ShieldAlert, Stamp, UserX } from "lucide-react";
import Link from "next/link";
import { BarChart, ColumnChart, Ring, StackedBars, type SeriesToken } from "@/components/charts";
import { EmptyState, Panel, Stat } from "@/components/ui/page";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { Timeline as ActivityTimeline } from "@/components/ui/timeline";
import type { AxisDir } from "@/lib/chart/scale";
import { cn } from "@/lib/cn";
import { addDays, diffTehranDays, formatJalali, jParts, relativeDay } from "@/lib/jalali";
import { CASE_STATUS, EVENT_TYPE, PRIORITY, TASK_STATUS } from "@/lib/labels";
import { faNum } from "@/lib/text";
import { DEADLINE_HORIZON_DAYS, type managerDashboard, type personalDashboard } from "@/server/dashboard";

type Personal = Awaited<ReturnType<typeof personalDashboard>>;
type Manager = NonNullable<Awaited<ReturnType<typeof managerDashboard>>>;

const RINGS = 4;
const RING_SIZE = 74;
const MS_PER_DAY = 86_400_000;
const URGENT_DAYS = 1;
const SOON_DAYS = 3;
const WORKLOAD_ROWS = 10;
const all = (href: string, label = "همه") => <Link href={href} className="text-sm text-lapis hover:underline">{label}</Link>;

export function SummaryWidget({ d }: { d: Personal }) {
  const c = d.counts;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="کارتابل من" value={faNum(c.inboxCount)} hint={c.unseenReferrals ? `${faNum(c.unseenReferrals)} ارجاع دیده‌نشده` : "ارجاع تازه‌ای نیست"} tone={c.unseenReferrals ? "accent" : "neutral"} href="/cartable" icon={<Inbox />} />
      <Stat label="وظایف باز" value={faNum(c.openTasks)} hint={c.overdueTasks ? `${faNum(c.overdueTasks)} مورد از موعد گذشته` : "همه در موعد"} tone={c.overdueTasks ? "danger" : "neutral"} href="/tasks?view=mine" icon={<ListChecks />} />
      <Stat label="مهلت‌های ۷ روز آینده" value={faNum(c.weekDeadlines)} hint={c.overdueDeadlines ? `${faNum(c.overdueDeadlines)} مهلت معوق` : "مهلت معوق ندارید"} tone={c.overdueDeadlines ? "danger" : "warning"} href="/deadlines" icon={<AlarmClock />} />
      <Stat label="پیام خوانده‌نشده" value={faNum(c.unreadMessages)} hint={c.toReview ? `${faNum(c.toReview)} وظیفه منتظر تأیید شما` : undefined} tone={c.unreadMessages ? "accent" : "neutral"} href="/messages" icon={<MessagesSquare />} />
    </div>
  );
}

export function DeadlinesWidget({ d, now }: { d: Personal; now: Date }) {
  return (
    <Panel title="مهلت‌های نزدیک و معوق" icon={<AlarmClock />} action={all("/deadlines", "همه مهلت‌ها")} bodyClass="p-0">
      {d.urgentDeadlines.length === 0 ? <EmptyState icon={<AlarmClock />} title="مهلتی در هفت روز آینده ندارید" hint="مهلت‌های ثبت‌شده برای شما اینجا نمایش داده می‌شود." /> : (
        <ul>
          {d.urgentDeadlines.map((x) => {
            const late = x.dueAt < now;
            return (
              <li key={x.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                <span className={cn("flex w-[86px] shrink-0 flex-col items-center rounded-md border px-2 py-1 text-center", late ? "border-mohr/30 bg-mohr-50 text-mohr" : "border-zafaran/30 bg-zafaran-50 text-zafaran")}>
                  <span className="text-sm font-extrabold">{relativeDay(x.dueAt, now)}</span>
                  <span className="num text-2xs">{formatJalali(x.dueAt, "date")}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/deadlines?focus=${x.id}`} className="block truncate font-bold hover:text-lapis">{x.title}</Link>
                  <p className="truncate text-xs text-ink-3">{x.case ? `${x.case.title} · ${x.case.number}` : "بدون پرونده"} · ساعت {formatJalali(x.dueAt, "time")}</p>
                </div>
                {x.isLegal && <Seal tone={x.verifiedAt ? "success" : "warning"}>{x.verifiedAt ? "قانونی · تأییدشده" : "قانونی · نیازمند تأیید"}</Seal>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** حلقه شمارش معکوس: سهم باقی‌مانده از کل مهلت (از ثبت تا سررسید)؛ رنگ با نزدیکی سررسید تند می‌شود */
function ringToken(daysLeft: number): SeriesToken {
  if (daysLeft <= URGENT_DAYS) return "chart-neg";
  return daysLeft <= SOON_DAYS ? "zafaran" : "chart-1";
}

export function DeadlineRingsWidget({ d, now }: { d: Personal; now: Date }) {
  const items = d.urgentDeadlines.slice(0, RINGS);
  return (
    <Panel title="شمارش معکوس مهلت‌ها" icon={<AlarmClock />}>
      {items.length === 0 ? <p className="text-sm text-ink-3">مهلت بازی در هفت روز آینده ندارید.</p> : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-4">
          {items.map((x) => {
            const total = Math.max(1, x.dueAt.getTime() - x.createdAt.getTime());
            const left = x.dueAt.getTime() - now.getTime();
            const days = Math.ceil(left / MS_PER_DAY);
            return (
              <li key={x.id} className="flex flex-col items-center gap-1.5 text-center">
                <Ring ratio={Math.max(0, left) / total} size={RING_SIZE} token={ringToken(days)} label={`زمان باقی‌مانده مهلت «${x.title}»`} center={left < 0 ? "معوق" : `${faNum(Math.max(days, 0))} روز`} />
                <Link href={`/deadlines?focus=${x.id}`} className="line-clamp-2 text-xs font-medium leading-5 hover:text-lapis">{x.title}</Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-2xs text-ink-3">حلقه سهم باقی‌مانده از کل مدت مهلت (از ثبت تا سررسید) را نشان می‌دهد.</p>
    </Panel>
  );
}

/** ستون‌های روزانه مهلت‌های باز از امروز تا ۱۴ روز بعد */
export function HorizonWidget({ title, dates, today, dir, scope }: { title: string; dates: Date[]; today: Date; dir: AxisDir; scope: string }) {
  const days = Array.from({ length: DEADLINE_HORIZON_DAYS }, (_, i) => addDays(today, i));
  const counts = days.map((day) => dates.filter((t) => diffTehranDays(day, t) === 0).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const peak = counts.indexOf(Math.max(...counts));
  return (
    <Panel title={title} icon={<CalendarDays />} action={all("/deadlines", "همه مهلت‌ها")} bodyClass="chart-in-panel">
      {total === 0 ? <p className="text-sm text-ink-3">مهلت بازی {scope} در ۱۴ روز آینده نیست.</p> : <ColumnChart title={title} unit="مهلت" dir={dir} highlight={0} seriesLabel="مهلت‌های باز"
        summary={total ? `${faNum(total)} مهلت باز ${scope} در ۱۴ روز آینده؛ بیشترین در ${formatJalali(days[peak], "long")} (${faNum(counts[peak])} مورد).` : `مهلت بازی ${scope} در ۱۴ روز آینده نیست.`}
        data={days.map((day, i) => ({ label: faNum(jParts(day).jd), long: formatJalali(day, "long"), value: counts[i] }))} />}
    </Panel>
  );
}

export function TasksWidget({ d, now }: { d: Personal; now: Date }) {
  return (
    <Panel title="وظایف من" icon={<ListChecks />} action={all("/tasks?view=mine", "همه وظایف")} bodyClass="p-0">
      {d.myTasks.length === 0 ? <EmptyState icon={<ListChecks />} title="وظیفه بازی ندارید" /> : (
        <ul>
          {d.myTasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
              <div className="min-w-0 flex-1">
                <Link href={`/tasks/${t.id}`} className="block truncate font-medium hover:text-lapis">{t.title}</Link>
                <p className="truncate text-xs text-ink-3"><span className="mono-code">{t.code}</span>{t.case && <> · پرونده {t.case.number}</>}{t.dueAt && <> · <span className={t.dueAt < now ? "font-bold text-mohr" : ""}>سررسید {relativeDay(t.dueAt, now)}</span></>}</p>
              </div>
              {t.priority !== "NORMAL" && <StatusSeal map={PRIORITY} value={t.priority} />}
              <StatusSeal map={TASK_STATUS} value={t.status} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function CartableWidget({ d }: { d: Personal }) {
  return (
    <Panel title="ورودی کارتابل" icon={<Inbox />} action={all("/cartable", "کارتابل")} bodyClass="p-0">
      {d.inbox.length === 0 ? <EmptyState icon={<Inbox />} title="کارتابل شما خالی است" /> : (
        <ul>
          {d.inbox.map((x) => {
            const r = x.referrals[0];
            const fresh = r?.status === "PENDING";
            return (
              <li key={x.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                <span className={cn("size-2 shrink-0 rounded-full", fresh ? "bg-firuze" : "bg-line-strong")} title={fresh ? "دیده‌نشده" : undefined} />
                <div className="min-w-0 flex-1">
                  <Link href={`/cartable/${x.id}`} className={cn("block truncate hover:text-lapis", fresh ? "font-bold" : "font-medium")}>{x.subject}</Link>
                  <p className="truncate text-xs text-ink-3"><span className="mono-code">{x.refNumber}</span>{r && <> · از {d.senders[r.fromUserId] ?? "—"}</>}{r?.instruction && <> · {r.instruction}</>}</p>
                </div>
                {x.priority !== "NORMAL" && <StatusSeal map={PRIORITY} value={x.priority} />}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function EventsWidget({ d }: { d: Personal }) {
  return (
    <Panel title="قرارها و جلسات پیش رو" icon={<CalendarDays />} action={all("/calendar", "تقویم")} bodyClass="p-0">
      {d.events.length === 0 ? <EmptyState icon={<CalendarDays />} title="رویدادی در دو هفته آینده نیست" /> : (
        <ul>
          {d.events.map((e) => (
            <li key={e.id} className="border-b border-line px-4 py-2.5 last:border-0">
              <p className="truncate font-medium">{e.title}</p>
              <p className="text-xs text-ink-3">{EVENT_TYPE[e.type].label} · {formatJalali(e.startAt, "long")}{!e.allDay && ` · ${formatJalali(e.startAt, "time")}`}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function CasesWidget({ d }: { d: Personal }) {
  return (
    <Panel title="پرونده‌های من" icon={<FolderOpen />} action={all("/cases?mine=1")} bodyClass="p-0">
      {d.myCases.length === 0 ? <EmptyState icon={<FolderOpen />} title="پرونده فعالی به شما ارجاع نشده است" /> : (
        <ul>
          {d.myCases.map((x) => (
            <li key={x.id} className="flex items-center gap-2 border-b border-line px-4 py-2.5 last:border-0">
              <div className="min-w-0 flex-1">
                <Link href={`/cases/${x.id}`} className="block truncate font-medium hover:text-lapis">{x.title}</Link>
                <p className="truncate text-xs text-ink-3"><span className="mono-code">{x.number}</span> · {x.client.displayName}</p>
              </div>
              <StatusSeal map={CASE_STATUS} value={x.status} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function DocsWidget({ d }: { d: Personal }) {
  return (
    <Panel title="اسناد اخیر" icon={<FileText />} bodyClass="p-0">
      {d.recentDocs.length === 0 ? <EmptyState icon={<FileText />} title="سندی ثبت نشده است" /> : (
        <ul>
          {d.recentDocs.map((x) => (
            <li key={x.id} className="border-b border-line px-4 py-2.5 last:border-0">
              <Link href={`/documents/${x.id}`} className="block truncate font-medium hover:text-lapis">{x.title}</Link>
              <p className="truncate text-xs text-ink-3">{x.category} · {formatJalali(x.updatedAt, "date")}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function ActivityWidget({ d, name }: { d: Personal; name: string }) {
  return (
    <Panel title="فعالیت‌های اخیر من">
      <ActivityTimeline items={d.activity.map((a) => ({ id: a.id, action: a.action, actorName: name, entityLabel: a.entityLabel, createdAt: a.createdAt }))} />
    </Panel>
  );
}

export function OfficeSummaryWidget({ m }: { m: Manager }) {
  const c = m.counts;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="پرونده‌های جاری" value={faNum(c.openCases)} hint={`${faNum(c.intakeCases)} در پذیرش اولیه`} tone="info" href="/cases" icon={<FolderOpen />} />
      <Stat label="پرونده بدون مسئول" value={faNum(c.unassignedCases)} tone={c.unassignedCases ? "warning" : "neutral"} href="/cases?mine=unassigned" icon={<UserX />} />
      <Stat label="وظایف معوق دفتر" value={faNum(c.overdueTasks)} hint={`${faNum(c.unassignedTasks)} وظیفه بدون مسئول`} tone={c.overdueTasks ? "danger" : "neutral"} href="/tasks?view=overdue" icon={<ShieldAlert />} />
      <Stat label="مهلت‌های معوق دفتر" value={faNum(c.overdueDeadlines)} hint={`${faNum(c.unverifiedLegal)} مهلت قانونی تأییدنشده`} tone={c.overdueDeadlines ? "danger" : "neutral"} href="/deadlines?view=overdue" icon={<Stamp />} />
    </div>
  );
}

export function WorkloadWidget({ m }: { m: Manager }) {
  const rows = m.workload.slice(0, WORKLOAD_ROWS).map((w) => ({ label: w.overdue ? `${w.name} (${faNum(w.overdue)} معوق)` : w.name, parts: [w.cases, w.tasks] }));
  const busiest = m.workload[0];
  return (
    <Panel title="بار کاری کارمندان" action={all("/reports", "گزارش کامل")} bodyClass="chart-in-panel">
      {rows.length === 0 ? <EmptyState title="کارمندی تعریف نشده است" /> : (
        <StackedBars title="بار کاری کارمندان" unit="مورد" series={["پرونده جاری", "وظیفه باز"]} rows={rows}
          summary={busiest ? `بیشترین بار: ${busiest.name} با ${faNum(busiest.cases)} پرونده جاری و ${faNum(busiest.tasks)} وظیفه باز.` : "بار کاری ثبت نشده است."} />
      )}
    </Panel>
  );
}

export function CaseStatusWidget({ m }: { m: Manager }) {
  const total = m.statusGroups.reduce((a, g) => a + g.count, 0);
  const rows = Object.keys(CASE_STATUS).map((s) => ({ label: CASE_STATUS[s].label, value: m.statusGroups.find((g) => g.status === s)?.count ?? 0, href: `/cases?status=${s}` }));
  return (
    <Panel title="وضعیت پرونده‌ها" bodyClass="chart-in-panel">
      <BarChart title="وضعیت پرونده‌ها" unit="پرونده" rows={rows} sort={false} summary={`${faNum(total)} پرونده در محدوده دسترسی شما، به تفکیک وضعیت.`} />
    </Panel>
  );
}
