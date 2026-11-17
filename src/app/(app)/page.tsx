// پیشخوان: ویجت‌های کار شخصی و (برای مدیران) نمای دفتر؛ ترتیب و نمایش هر ویجت را هر کاربر خودش تنظیم می‌کند
import { WidgetBoard, type BoardWidget } from "@/components/dashboard/widget-board";
import {
  ActivityWidget, CartableWidget, CasesWidget, CaseStatusWidget, DeadlineRingsWidget, DeadlinesWidget, DocsWidget, EventsWidget, HorizonWidget, OfficeSummaryWidget,
  SummaryWidget, TasksWidget, WorkloadWidget,
} from "@/components/dashboard/widgets";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { can, requireUser } from "@/lib/auth/guard";
import { faNum } from "@/lib/text";
import { managerDashboard, personalDashboard } from "@/server/dashboard";
import { getDashboardLayout } from "@/server/dashboard-layout";
import { resolveUi } from "@/theme/prefs";

export const metadata = { title: "پیشخوان" };

const MORNING_END = 12;
const AFTERNOON_END = 17;

function greeting(h: number): string {
  if (h < MORNING_END) return "صبح بخیر";
  return h < AFTERNOON_END ? "روز بخیر" : "عصر بخیر";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const manager = can(user, "dashboard.manager");
  const [d, mgr, saved, ui] = await Promise.all([personalDashboard(user), manager ? managerDashboard(user) : null, getDashboardLayout(user.id), resolveUi(user.id)]);
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Tehran" }).format(now));
  const attention = d.counts.overdueDeadlines + d.counts.overdueTasks;
  const widgets: BoardWidget[] = [
    { id: "summary", node: <SummaryWidget d={d} /> },
    { id: "my-deadlines", node: <DeadlinesWidget d={d} now={now} /> },
    { id: "deadline-rings", node: <DeadlineRingsWidget d={d} now={now} /> },
    { id: "deadlines-14", node: <HorizonWidget title="مهلت‌های من در ۱۴ روز آینده" dates={d.horizon} today={d.today} dir={ui.chartTimeAxis} scope="شما" /> },
    { id: "events", node: <EventsWidget d={d} /> },
    { id: "my-tasks", node: <TasksWidget d={d} now={now} /> },
    { id: "my-cases", node: <CasesWidget d={d} /> },
    { id: "cartable", node: <CartableWidget d={d} /> },
    { id: "recent-docs", node: <DocsWidget d={d} /> },
    ...(mgr ? [
      { id: "office-summary" as const, node: <OfficeSummaryWidget m={mgr} /> },
      { id: "workload" as const, node: <WorkloadWidget m={mgr} /> },
      { id: "case-status" as const, node: <CaseStatusWidget m={mgr} /> },
      { id: "office-deadlines-14" as const, node: <HorizonWidget title="مهلت‌های دفتر در ۱۴ روز آینده" dates={mgr.horizon} today={mgr.today} dir={ui.chartTimeAxis} scope="در دفتر" /> },
    ] : []),
    { id: "activity", node: <ActivityWidget d={d} name={user.fullName} /> },
  ];
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
      <WidgetBoard widgets={widgets} saved={saved} />
    </>
  );
}
