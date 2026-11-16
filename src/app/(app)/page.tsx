import { AlarmClock, CalendarDays, FileText, FolderOpen, Inbox, ListChecks, MessagesSquare, ShieldAlert, Stamp, UserX } from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, Stat } from "@/components/ui/page";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { Timeline } from "@/components/ui/timeline";
import { can, requireUser } from "@/lib/auth/guard";
import { cn } from "@/lib/cn";
import { formatJalali, relativeDay } from "@/lib/jalali";
import { CASE_STATUS, EVENT_TYPE, PRIORITY, TASK_STATUS } from "@/lib/labels";
import { faNum } from "@/lib/text";
import { managerDashboard, personalDashboard } from "@/server/dashboard";

export const metadata = { title: "پیشخوان" };

function greeting(h: number) { return h < 12 ? "صبح بخیر" : h < 17 ? "روز بخیر" : "عصر بخیر"; }

export default async function DashboardPage() {
  const user = await requireUser();
  const d = await personalDashboard(user);
  const mgr = can(user, "dashboard.manager") ? await managerDashboard(user) : null;
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Tehran" }).format(now));
  const c = d.counts;
  const attention = c.overdueDeadlines + c.overdueTasks;

  return (
    <>
      <PageHeader
        title={`${greeting(hour)}، ${user.fullName.split(" ")[0]}`}
        subtitle={attention > 0 ? `${faNum(attention)} مورد معوق نیازمند رسیدگی فوری دارید.` : "کار معوقی ندارید. فهرست کارهای پیش رو در زیر آمده است."}
        actions={
          <>
            {can(user, "client.create") && <LinkButton href="/clients/new" variant="primary">ثبت مراجعه‌کننده</LinkButton>}
            {can(user, "case.create") && <LinkButton href="/cases/new">پرونده جدید</LinkButton>}
            {can(user, "task.create") && <LinkButton href="/tasks?new=1">وظیفه جدید</LinkButton>}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="کارتابل من" value={faNum(c.inboxCount)} hint={c.unseenReferrals ? `${faNum(c.unseenReferrals)} ارجاع دیده‌نشده` : "ارجاع تازه‌ای نیست"} tone={c.unseenReferrals ? "accent" : "neutral"} href="/cartable" icon={<Inbox />} />
        <Stat label="وظایف باز" value={faNum(c.openTasks)} hint={c.overdueTasks ? `${faNum(c.overdueTasks)} مورد از موعد گذشته` : "همه در موعد"} tone={c.overdueTasks ? "danger" : "info"} href="/tasks?view=mine" icon={<ListChecks />} />
        <Stat label="مهلت‌های ۷ روز آینده" value={faNum(c.weekDeadlines)} hint={c.overdueDeadlines ? `${faNum(c.overdueDeadlines)} مهلت معوق` : "مهلت معوق ندارید"} tone={c.overdueDeadlines ? "danger" : c.weekDeadlines ? "warning" : "neutral"} href="/deadlines?view=mine" icon={<AlarmClock />} />
        <Stat label="پیام خوانده‌نشده" value={faNum(c.unreadMessages)} hint={c.toReview ? `${faNum(c.toReview)} وظیفه منتظر تأیید شما` : undefined} tone={c.unreadMessages ? "accent" : "neutral"} href="/messages" icon={<MessagesSquare />} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Panel title="مهلت‌های نزدیک و معوق" icon={<AlarmClock />} action={<Link href="/deadlines" className="text-sm text-lapis hover:underline">همه مهلت‌ها</Link>} bodyClass="p-0">
            {d.urgentDeadlines.length === 0 ? <EmptyState icon={<AlarmClock />} title="مهلتی در هفت روز آینده ندارید" hint="مهلت‌های ثبت‌شده برای شما اینجا با شمارش معکوس نمایش داده می‌شود." /> : (
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

          <Panel title="وظایف من" icon={<ListChecks />} action={<Link href="/tasks?view=mine" className="text-sm text-lapis hover:underline">همه وظایف</Link>} bodyClass="p-0">
            {d.myTasks.length === 0 ? <EmptyState icon={<ListChecks />} title="وظیفه بازی ندارید" /> : (
              <ul>
                {d.myTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <Link href={`/tasks/${t.id}`} className="block truncate font-medium hover:text-lapis">{t.title}</Link>
                      <p className="truncate text-xs text-ink-3"><span className="mono-code">{t.code}</span>{t.case && <> · پرونده {t.case.number}</>}{t.dueAt && <> · <span className={t.dueAt < now ? "font-bold text-mohr" : ""}>موعد {relativeDay(t.dueAt, now)}</span></>}</p>
                    </div>
                    {t.priority !== "NORMAL" && <StatusSeal map={PRIORITY} value={t.priority} />}
                    <StatusSeal map={TASK_STATUS} value={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="ورودی کارتابل" icon={<Inbox />} action={<Link href="/cartable" className="text-sm text-lapis hover:underline">کارتابل</Link>} bodyClass="p-0">
            {d.inbox.length === 0 ? <EmptyState icon={<Inbox />} title="کارتابل شما خالی است" /> : (
              <ul>
                {d.inbox.map((x) => {
                  const r = x.referrals[0];
                  return (
                    <li key={x.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                      <span className={cn("size-2 shrink-0 rounded-full", r?.status === "PENDING" ? "bg-firuze" : "bg-line-strong")} title={r?.status === "PENDING" ? "دیده‌نشده" : undefined} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/cartable/${x.id}`} className={cn("block truncate hover:text-lapis", r?.status === "PENDING" ? "font-bold" : "font-medium")}>{x.subject}</Link>
                        <p className="truncate text-xs text-ink-3"><span className="mono-code">{x.refNumber}</span>{r && <> · از {d.senders[r.fromUserId] ?? "—"}</>}{r?.instruction && <> · {r.instruction}</>}</p>
                      </div>
                      {x.priority !== "NORMAL" && <StatusSeal map={PRIORITY} value={x.priority} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="قرارها و جلسات پیش رو" icon={<CalendarDays />} action={<Link href="/calendar" className="text-sm text-lapis hover:underline">تقویم</Link>} bodyClass="p-0">
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
          <Panel title="پرونده‌های من" icon={<FolderOpen />} action={<Link href="/cases?mine=1" className="text-sm text-lapis hover:underline">همه</Link>} bodyClass="p-0">
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
        </div>
      </div>

      {mgr && (
        <section className="mt-8">
          <h2 className="ledger-rule mb-4 pb-3 text-xl font-extrabold">نمای مدیریتی دفتر</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="پرونده‌های جاری" value={faNum(mgr.counts.openCases)} hint={`${faNum(mgr.counts.intakeCases)} در پذیرش اولیه`} tone="info" href="/cases" icon={<FolderOpen />} />
            <Stat label="پرونده بدون مسئول" value={faNum(mgr.counts.unassignedCases)} tone={mgr.counts.unassignedCases ? "warning" : "neutral"} href="/cases?mine=unassigned" icon={<UserX />} />
            <Stat label="وظایف معوق دفتر" value={faNum(mgr.counts.overdueTasks)} hint={`${faNum(mgr.counts.unassignedTasks)} وظیفه بدون مسئول`} tone={mgr.counts.overdueTasks ? "danger" : "neutral"} href="/tasks?view=overdue" icon={<ShieldAlert />} />
            <Stat label="مهلت‌های معوق دفتر" value={faNum(mgr.counts.overdueDeadlines)} hint={`${faNum(mgr.counts.unverifiedLegal)} مهلت قانونی تأییدنشده`} tone={mgr.counts.overdueDeadlines ? "danger" : mgr.counts.unverifiedLegal ? "warning" : "neutral"} href="/deadlines?view=overdue" icon={<Stamp />} />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Panel title="بار کاری کارمندان" className="xl:col-span-2" bodyClass="p-0" action={<Link href="/reports" className="text-sm text-lapis hover:underline">گزارش کامل</Link>}>
              {mgr.workload.length === 0 ? <EmptyState title="کارمندی تعریف نشده است" /> : (
                <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead><tr><th>کارمند</th><th>پرونده جاری</th><th>وظیفه باز</th><th>معوق</th><th className="w-[38%]">توزیع</th></tr></thead>
                    <tbody>
                      {mgr.workload.map((w) => {
                        const max = Math.max(1, ...mgr.workload.map((x) => x.tasks + x.cases));
                        return (
                          <tr key={w.id}>
                            <td><span className="font-medium">{w.name}</span><span className="block text-xs text-ink-3">{w.sub}</span></td>
                            <td className="num">{faNum(w.cases)}</td><td className="num">{faNum(w.tasks)}</td>
                            <td className={cn("num", w.overdue && "font-bold text-mohr")}>{faNum(w.overdue)}</td>
                            <td>
                              <div className="flex h-2.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${w.cases} پرونده و ${w.tasks} وظیفه`}>
                                <span className="bg-lapis" style={{ width: `${(w.cases / max) * 100}%` }} />
                                <span className="bg-firuze" style={{ width: `${(w.tasks / max) * 100}%` }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel title="وضعیت پرونده‌ها">
              <ul className="flex flex-col gap-2.5">
                {Object.keys(CASE_STATUS).map((s) => {
                  const n = mgr.statusGroups.find((g) => g.status === s)?.count ?? 0;
                  const total = Math.max(1, mgr.statusGroups.reduce((a, g) => a + g.count, 0));
                  return (
                    <li key={s}>
                      <div className="mb-1 flex justify-between text-sm"><Link href={`/cases?status=${s}`} className="hover:text-lapis">{CASE_STATUS[s].label}</Link><span className="num font-bold">{faNum(n)}</span></div>
                      <div className="h-1.5 rounded-full bg-line"><div className="h-full rounded-full bg-lapis" style={{ width: `${(n / total) * 100}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>
        </section>
      )}

      <Panel title="فعالیت‌های اخیر من" className="mt-4">
        <Timeline items={d.activity.map((a) => ({ id: a.id, action: a.action, actorName: user.fullName, entityLabel: a.entityLabel, createdAt: a.createdAt }))} />
      </Panel>
    </>
  );
}
