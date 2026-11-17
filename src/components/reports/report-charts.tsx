// نمودارهای گزارش عملکرد؛ هم در صفحه گزارش و هم (با رندر ایستا) در خروجی PDF به کار می‌رود.
// نشانه‌گذاری IBCS: دوره جاری توپر، دوره قبل خاکستری، اختلاف با رنگ و علامت.
import { BarChart, ColumnChart, Funnel, LineChart, StackedBars, StatTile, VarianceBars } from "@/components/charts";
import type { AxisDir } from "@/lib/chart/scale";
import { CASE_STATUS } from "@/lib/labels";
import { faNum } from "@/lib/text";
import type { OfficeReport, ReportTotals } from "@/server/reports";

export interface ReportChart { id: string; title: string; wide?: boolean; node: React.ReactNode }

const PERCENT = 100;
const TOTAL_ROWS: [keyof ReportTotals, string, string][] = [
  ["newClients", "مراجعان جدید", "/clients"], ["newCases", "پرونده‌های جدید", "/cases"], ["closedCases", "پرونده‌های مختومه", "/cases?status=CLOSED"],
  ["tasksDone", "وظایف انجام‌شده", "/tasks"], ["deadlinesDone", "مهلت‌های انجام‌شده", "/deadlines"], ["docs", "اسناد ثبت‌شده", "/documents"],
  ["corrIn", "نامه وارده", "/cartable"], ["corrOut", "نامه صادره", "/cartable"],
];
const sumOf = (list: number[]) => list.reduce((a, b) => a + b, 0);

export function ReportStats({ rep }: { rep: OfficeReport }) {
  const trends: Partial<Record<keyof ReportTotals, number[]>> = { newCases: rep.series.cases.cur, tasksDone: rep.series.tasksDone.cur, corrIn: rep.series.corrIn, corrOut: rep.series.corrOut };
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {TOTAL_ROWS.map(([k, label, href]) => (
        <StatTile key={k} label={label} value={rep.totals[k]} href={href} trend={trends[k]}
          delta={{ value: rep.totals[k] - rep.previous[k], period: "دوره قبل" }} />
      ))}
    </div>
  );
}

export function reportCharts(rep: OfficeReport, dir: AxisDir): ReportChart[] {
  const unitLabel = rep.bucket === "week" ? "هفته" : "ماه";
  const casesNow = sumOf(rep.series.cases.cur);
  const tasksNow = sumOf(rep.series.tasksDone.cur);
  const funnelTop = rep.funnel[0]?.value ?? 0;
  const onTime = rep.funnel.at(-1)?.value ?? 0;
  const outcomesTotal = sumOf(rep.deadlineOutcomes.map((o) => o.value));
  const cycleTotal = sumOf(rep.cycle.map((c) => c.value));
  return [
    {
      id: "variance", title: "دوره جاری در برابر دوره قبل", wide: true,
      node: <VarianceBars title="دوره جاری در برابر دوره قبل" unit="مورد" rows={TOTAL_ROWS.map(([k, label]) => ({ label, actual: rep.totals[k], prev: rep.previous[k] }))}
        summary={`مقایسه ${rep.range.label} با دوره هم‌طول قبل (${rep.prev.label}).`} />,
    },
    {
      id: "cases-trend", title: `پرونده‌های جدید به تفکیک ${unitLabel}`,
      node: <ColumnChart title={`پرونده‌های جدید به تفکیک ${unitLabel}`} unit="پرونده" dir={dir} data={rep.buckets.map((b, i) => ({ ...b, value: rep.series.cases.cur[i], prev: rep.series.cases.prev[i] }))}
        summary={`${faNum(casesNow)} پرونده جدید در دوره، در برابر ${faNum(rep.previous.newCases)} در دوره قبل.`} />,
    },
    {
      id: "tasks-trend", title: `وظایف انجام‌شده به تفکیک ${unitLabel}`,
      node: <ColumnChart title={`وظایف انجام‌شده به تفکیک ${unitLabel}`} unit="وظیفه" dir={dir} data={rep.buckets.map((b, i) => ({ ...b, value: rep.series.tasksDone.cur[i], prev: rep.series.tasksDone.prev[i] }))}
        summary={`${faNum(tasksNow)} وظیفه انجام شد، در برابر ${faNum(rep.previous.tasksDone)} در دوره قبل.`} />,
    },
    {
      id: "correspondence", title: "مکاتبات وارده و صادره",
      node: <LineChart title="مکاتبات وارده و صادره" unit="نامه" dir={dir} labels={rep.buckets.map((b) => b.label)} longLabels={rep.buckets.map((b) => b.long)}
        series={[{ name: "وارده", values: rep.series.corrIn, token: "chart-1" }, { name: "صادره", values: rep.series.corrOut, token: "chart-2" }]}
        summary={`${faNum(rep.totals.corrIn)} نامه وارده و ${faNum(rep.totals.corrOut)} نامه صادره در دوره.`} />,
    },
    {
      id: "funnel", title: "قیف وظایف ثبت‌شده در دوره",
      node: <Funnel title="قیف وظایف ثبت‌شده در دوره" unit="وظیفه" steps={rep.funnel}
        summary={funnelTop ? `از ${faNum(funnelTop)} وظیفه ثبت‌شده، ${faNum(onTime)} وظیفه (${faNum(Math.round((onTime / funnelTop) * PERCENT))}٪) در موعد انجام شد.` : "وظیفه‌ای در دوره ثبت نشده است."} />,
    },
    {
      id: "deadlines", title: "پیامد مهلت‌های سررسیده در دوره",
      node: <BarChart title="پیامد مهلت‌های سررسیده در دوره" unit="مهلت" rows={rep.deadlineOutcomes} sort={false}
        summary={outcomesTotal ? `${faNum(outcomesTotal)} مهلت سررسید دوره؛ ${faNum(rep.deadlineOutcomes[0].value)} در موعد انجام شد.` : "مهلتی در این دوره سررسید نشده است."} />,
    },
    {
      id: "cycle", title: "زمان انجام وظایف (از ثبت تا انجام)",
      node: <ColumnChart title="زمان انجام وظایف (از ثبت تا انجام)" unit="وظیفه" dir={dir} seriesLabel="وظیفه انجام‌شده" data={rep.cycle}
        summary={cycleTotal ? `توزیع ${faNum(cycleTotal)} وظیفه انجام‌شده بر پایه روزهای از ثبت تا انجام${rep.workflow.avgDays === null ? "" : `؛ میانگین ${faNum(Number(rep.workflow.avgDays.toFixed(1)))} روز`}.` : "وظیفه‌ای در دوره انجام نشده است."} />,
    },
    {
      id: "case-status", title: "وضعیت پرونده‌ها (کل)",
      node: <BarChart title="وضعیت پرونده‌ها (کل)" unit="پرونده" sort={false} rows={Object.keys(CASE_STATUS).map((s) => ({ label: CASE_STATUS[s].label, value: rep.casesByStatus.find((x) => x.key === s)?.count ?? 0, href: `/cases?status=${s}` }))}
        summary={`${faNum(sumOf(rep.casesByStatus.map((x) => x.count)))} پرونده در محدوده دسترسی شما.`} />,
    },
    {
      id: "departments", title: "بار کاری واحدها",
      node: <StackedBars title="بار کاری واحدها" unit="مورد" series={["پرونده جاری", "وظیفه باز"]} rows={rep.departments.map((d) => ({ label: d.name, parts: [d.cases, d.open] }))}
        summary={`${faNum(rep.departments.length)} واحد؛ پرونده‌های جاری و وظایف باز کارمندان هر واحد.`} />,
    },
    {
      id: "categories", title: "پرونده‌های جدید به تفکیک دسته",
      node: <BarChart title="پرونده‌های جدید به تفکیک دسته" unit="پرونده" rows={rep.casesByCategory.map((x) => ({ label: x.key, value: x.count }))} summary={`${faNum(rep.casesByCategory.length)} دسته در دوره.`} />,
    },
    {
      id: "docs", title: "اسناد به تفکیک نوع",
      node: <BarChart title="اسناد به تفکیک نوع" unit="سند" rows={rep.docsByCategory.map((x) => ({ label: x.key, value: x.count }))} summary={`${faNum(sumOf(rep.docsByCategory.map((x) => x.count)))} سند در محدوده دسترسی شما.`} />,
    },
    {
      id: "clients", title: "فعال‌ترین مراجعان در دوره",
      node: <BarChart title="فعال‌ترین مراجعان در دوره" unit="پرونده" rows={rep.topClients.map((c) => ({ label: c.name, value: c.count }))} summary="مراجعانی که در دوره بیشترین پرونده جدید را داشته‌اند." />,
    },
  ];
}
