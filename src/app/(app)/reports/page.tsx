// گزارش‌ها و تحلیل: دوره پیش‌ساخته یا دلخواه شمسی، مقایسه با دوره هم‌طول قبل، نمودارهای بین‌المللی و جدول بار کاری کارمندان
import Link from "next/link";
import { RangeForm } from "@/components/reports/range-form";
import { ReportStats, reportCharts } from "@/components/reports/report-charts";
import { LinkButton } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { PageHeader, Panel } from "@/components/ui/page";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { cn } from "@/lib/cn";
import { sortFrom } from "@/lib/table-sort";
import { faNum, formatBytes } from "@/lib/text";
import { officeReport, PRESETS, resolveRange, type OfficeReport } from "@/server/reports";
import { resolveUi } from "@/theme/prefs";

export const metadata = { title: "گزارش‌ها" };

type Employee = OfficeReport["employees"][number];
const PERCENT = 100;
const SORT_KEYS = ["name", "department", "cases", "open", "done", "overdue"] as const;
const SORT_DEFAULT = { key: "open", dir: "desc" as const };
type NumKey = "cases" | "open" | "done" | "overdue";
const num = (k: NumKey, label: string, rows: Employee[]): Column<Employee> =>
  ({ key: k, label, numeric: true, sortable: "desc", cell: (e) => faNum(e[k]), total: faNum(rows.reduce((a, e) => a + e[k], 0)) });
const columns = (rows: Employee[]): Column<Employee>[] => [
  { key: "name", label: "کارمند", sortable: "asc", cell: (e) => <span className="font-medium">{e.name}</span>, total: "جمع" },
  { key: "department", label: "واحد", sortable: "asc", cell: (e) => e.department },
  num("cases", "پرونده جاری", rows), num("open", "وظیفه باز", rows), num("done", "انجام‌شده در دوره", rows),
  { ...num("overdue", "معوق", rows), cell: (e) => <span className={cn(e.overdue > 0 && "font-bold text-mohr")}>{faNum(e.overdue)}</span> },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePerm("report.view");
  const sp = await searchParams;
  const range = resolveRange(sp);
  const [rep, ui] = await Promise.all([officeReport(user, range), resolveUi(user.id)]);
  const t = rep.totals;
  const query = range.key === "custom" ? `from=${encodeURIComponent(range.fromInput)}&to=${encodeURIComponent(range.toInput)}` : `period=${range.key}`;
  const sort = sortFrom(sp, SORT_KEYS, SORT_DEFAULT);
  const employees = [...rep.employees].sort((a, b) => {
    const k = sort.key as keyof Employee;
    const cmp = typeof a[k] === "number" ? (a[k] as number) - (b[k] as number) : String(a[k]).localeCompare(String(b[k]), "fa");
    return sort.dir === "asc" ? cmp : -cmp;
  });
  const charts = reportCharts(rep, ui.chartTimeAxis);
  return (
    <>
      <PageHeader title="گزارش‌ها و تحلیل" subtitle={`دوره: ${rep.range.label} · مقایسه با ${rep.prev.label} · همه ارقام از رکوردهای واقعی و در محدوده دسترسی شما محاسبه می‌شود.`}
        actions={can(user, "report.export") && <>
          <LinkButton href={`/api/export/report?${query}`}>خروجی Excel</LinkButton>
          <LinkButton href={`/api/export/report-pdf?${query}`} variant="primary">خروجی PDF</LinkButton>
        </>} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="دوره گزارش" className="flex overflow-hidden rounded-ctl border border-line-strong text-sm">
          {PRESETS.map(([k, l]) => (
            <Link key={k} href={`/reports?period=${k}`} aria-current={k === range.key ? "page" : undefined}
              className={cn("px-3 py-2", k === range.key ? "bg-night text-on-night" : "bg-surface hover:bg-surface-2")}>{l}</Link>
          ))}
        </nav>
        <RangeForm from={range.fromInput} to={range.toInput} />
      </div>
      <ReportStats rep={rep} />
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="کارایی گردش کار">
          <dl className="flex flex-col gap-4">
            <div><dt className="text-sm text-ink-2">میانگین زمان انجام وظیفه</dt><dd className="num text-2xl font-extrabold">{rep.workflow.avgDays === null ? "—" : `${faNum(Number(rep.workflow.avgDays.toFixed(1)))} روز`}</dd></div>
            <div><dt className="text-sm text-ink-2">انجام در موعد</dt><dd className="num text-2xl font-extrabold text-sabz">{rep.workflow.onTimeRate === null ? "—" : `${faNum(Math.round(rep.workflow.onTimeRate * PERCENT))}٪`}</dd></div>
            <div><dt className="text-sm text-ink-2">مهلت‌های ازدست‌رفته در دوره</dt><dd className={cn("num text-2xl font-extrabold", t.deadlinesMissed > 0 && "text-mohr")}>{faNum(t.deadlinesMissed)}</dd></div>
            <div><dt className="text-sm text-ink-2">موارد معوق (اکنون)</dt><dd className={cn("num text-2xl font-extrabold", t.overdueTasks + t.overdueDeadlines > 0 && "text-mohr")}>{faNum(t.overdueTasks + t.overdueDeadlines)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-ink-3">بر پایه {faNum(rep.workflow.sample)} وظیفه انجام‌شده · {faNum(t.pendingReferrals)} ارجاع در انتظار اقدام · حجم اسناد دوره {formatBytes(Number(t.docBytes))}</p>
        </Panel>
        {charts.map((c) => (
          <Panel key={c.id} title={c.title} className={cn(c.wide && "xl:col-span-2")} bodyClass="chart-in-panel">{c.node}</Panel>
        ))}
      </div>
      <div className="mt-4">
        <DataTable caption="بار کاری کارمندان" columns={columns(employees)} rows={employees} rowKey={(e) => e.id} sort={sort} path="/reports" params={sp}
          empty="کارمندی تعریف نشده است." />
      </div>
    </>
  );
}
