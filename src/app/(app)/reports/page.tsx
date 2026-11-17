import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { PageHeader, Panel, Stat } from "@/components/ui/page";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { cn } from "@/lib/cn";
import { CASE_STATUS } from "@/lib/labels";
import { faNum, formatBytes } from "@/lib/text";
import { officeReport, resolveRange } from "@/server/reports";

export const metadata = { title: "گزارش‌ها" };
const PERIODS = [["month", "ماه جاری"], ["prev", "ماه قبل"], ["90", "۹۰ روز اخیر"], ["year", "سال جاری"]];

function Bars({ data, color = "bg-lapis" }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="py-6 text-center text-sm text-ink-3">داده‌ای در این دوره ثبت نشده است.</p>;
  return (
    <ul className="flex flex-col gap-2">{data.map((d) => (
      <li key={d.label} className="grid grid-cols-[minmax(90px,34%)_1fr_auto] items-center gap-2 text-sm">
        <span className="truncate">{d.label}</span><div className="h-2.5 rounded-full bg-line"><div className={cn("h-full rounded-full", color)} style={{ width: `${(d.value / max) * 100}%` }} /></div><span className="num w-8 text-end font-bold">{faNum(d.value)}</span>
      </li>))}</ul>
  );
}

function Trend({ weeks }: { weeks: { label: string; cases: number; tasks: number }[] }) {
  const max = Math.max(1, ...weeks.flatMap((w) => [w.cases, w.tasks]));
  const W = 640, H = 170, pad = 26, step = (W - pad * 2) / (weeks.length - 1);
  const pts = (k: "cases" | "tasks") => weeks.map((w, i) => `${pad + i * step},${H - pad - (w[k] / max) * (H - pad * 2)}`).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="روند هفتگی پرونده‌های جدید و وظایف انجام‌شده در ۱۲ هفته اخیر" style={{ direction: "ltr" }}>
        {[0, 0.5, 1].map((t) => <line key={t} x1={pad} x2={W - pad} y1={H - pad - t * (H - pad * 2)} y2={H - pad - t * (H - pad * 2)} stroke="rgb(var(--line))" strokeDasharray={t ? "3 4" : undefined} />)}
        <polyline points={pts("cases")} fill="none" stroke="rgb(var(--lapis))" strokeWidth="2.2" strokeLinejoin="round" />
        <polyline points={pts("tasks")} fill="none" stroke="rgb(var(--firuze))" strokeWidth="2.2" strokeLinejoin="round" />
        {weeks.map((w, i) => (<g key={i}>
          <circle cx={pad + i * step} cy={H - pad - (w.cases / max) * (H - pad * 2)} r="3" fill="rgb(var(--lapis))"><title>{`پرونده جدید: ${w.cases}`}</title></circle>
          <circle cx={pad + i * step} cy={H - pad - (w.tasks / max) * (H - pad * 2)} r="3" fill="rgb(var(--firuze))"><title>{`وظیفه انجام‌شده: ${w.tasks}`}</title></circle>
          {i % 2 === 0 && <text x={pad + i * step} y={H - 6} textAnchor="middle" fontSize="10" fill="rgb(var(--ink-3))">{w.label}</text>}
        </g>))}
        <text x={pad - 6} y={pad + 3} textAnchor="end" fontSize="10" fill="rgb(var(--ink-3))">{faNum(max)}</text>
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-ink-2"><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-lapis" />پرونده جدید</span><span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-firuze" />وظیفه انجام‌شده</span></figcaption>
    </figure>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requirePagePerm("report.view");
  const period = (await searchParams).period ?? "month";
  const rep = await officeReport(user, resolveRange(period));
  const t = rep.totals;
  return (
    <>
      <PageHeader title="گزارش‌ها و تحلیل" subtitle={`دوره: ${rep.range.label} · همه ارقام از رکوردهای واقعی سامانه محاسبه می‌شود.`}
        actions={<>
          <div className="flex overflow-hidden rounded-md border border-line-strong text-sm">{PERIODS.map(([k, l]) => <Link key={k} href={`/reports?period=${k}`} className={cn("px-3 py-2", k === period ? "bg-night text-on-night" : "bg-surface hover:bg-surface-2")}>{l}</Link>)}</div>
          {can(user, "report.export") && <><LinkButton href={`/api/export/report?period=${period}`}>خروجی Excel</LinkButton><LinkButton href={`/api/export/report-pdf?period=${period}`} variant="primary">خروجی PDF</LinkButton></>}
        </>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="مراجعان جدید" value={faNum(t.newClients)} tone="accent" /><Stat label="پرونده‌های جدید" value={faNum(t.newCases)} hint={`${faNum(t.closedCases)} پرونده مختومه`} tone="info" />
        <Stat label="وظایف انجام‌شده" value={faNum(t.tasksDone)} hint={`از ${faNum(t.tasksCreated)} وظیفه ایجادشده`} tone="success" />
        <Stat label="موارد معوق (اکنون)" value={faNum(t.overdueTasks + t.overdueDeadlines)} hint={`${faNum(t.overdueTasks)} وظیفه · ${faNum(t.overdueDeadlines)} مهلت`} tone={t.overdueTasks + t.overdueDeadlines ? "danger" : "neutral"} />
        <Stat label="نامه وارده" value={faNum(t.corrIn)} /><Stat label="نامه صادره" value={faNum(t.corrOut)} hint={`${faNum(t.corrInt)} مکاتبه داخلی`} />
        <Stat label="اسناد ثبت‌شده" value={faNum(t.docs)} hint={formatBytes(Number(t.docBytes))} /><Stat label="ارجاع در انتظار اقدام" value={faNum(t.pendingReferrals)} tone={t.pendingReferrals ? "warning" : "neutral"} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="روند ۱۲ هفته اخیر" className="xl:col-span-2"><Trend weeks={rep.weeks} /></Panel>
        <Panel title="کارایی گردش کار">
          <dl className="flex flex-col gap-4">
            <div><dt className="text-sm text-ink-2">میانگین زمان انجام وظیفه</dt><dd className="num text-2xl font-extrabold">{rep.workflow.avgDays === null ? "—" : `${faNum(Number(rep.workflow.avgDays.toFixed(1)))} روز`}</dd></div>
            <div><dt className="text-sm text-ink-2">انجام در موعد</dt><dd className="num text-2xl font-extrabold text-sabz">{rep.workflow.onTimeRate === null ? "—" : `${faNum(Math.round(rep.workflow.onTimeRate * 100))}٪`}</dd></div>
            <div><dt className="text-sm text-ink-2">مهلت‌های ازدست‌رفته در دوره</dt><dd className={cn("num text-2xl font-extrabold", t.deadlinesMissed ? "text-mohr" : "")}>{faNum(t.deadlinesMissed)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-ink-3">بر پایه {faNum(rep.workflow.sample)} وظیفه انجام‌شده در دوره.</p>
        </Panel>
        <Panel title="بار کاری کارمندان" className="xl:col-span-2" bodyClass="p-0">
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>کارمند</th><th>واحد</th><th>پرونده جاری</th><th>وظیفه باز</th><th>انجام‌شده در دوره</th><th>معوق</th></tr></thead>
            <tbody>{rep.employees.length === 0 ? <tr><td colSpan={6} className="py-6 text-center text-ink-3">کارمندی تعریف نشده است.</td></tr> : rep.employees.map((e) => (
              <tr key={e.id}><td className="font-medium">{e.name}</td><td>{e.department}</td><td className="num">{faNum(e.cases)}</td><td className="num">{faNum(e.open)}</td><td className="num">{faNum(e.done)}</td><td className={cn("num", e.overdue && "font-bold text-mohr")}>{faNum(e.overdue)}</td></tr>))}</tbody></table></div>
        </Panel>
        <Panel title="بار کاری واحدها"><Bars data={rep.departments.map((d) => ({ label: d.name, value: d.open + d.cases }))} color="bg-firuze" /></Panel>
        <Panel title="وضعیت پرونده‌ها (کل)"><Bars data={rep.casesByStatus.map((x) => ({ label: CASE_STATUS[x.key].label, value: x.count }))} /></Panel>
        <Panel title="پرونده‌های جدید به تفکیک دسته"><Bars data={rep.casesByCategory.map((x) => ({ label: x.key, value: x.count }))} color="bg-zafaran" /></Panel>
        <Panel title="اسناد به تفکیک نوع"><Bars data={rep.docsByCategory.map((x) => ({ label: x.key, value: x.count }))} color="bg-firuze" /></Panel>
        <Panel title="فعال‌ترین مراجعان در دوره" className="xl:col-span-3"><Bars data={rep.topClients.map((c) => ({ label: c.name, value: c.count }))} /></Panel>
      </div>
    </>
  );
}
