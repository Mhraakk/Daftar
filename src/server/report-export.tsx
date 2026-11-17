// خروجی گزارش عملکرد: Excel با همه جدول‌ها، و PDF با همان نمودارهای صفحه (SVG ایستا با رنگ‌های پوسته چاپی روی کاغذ سفید)
import { CHART_CSS } from "@/components/charts/css";
import { reportCharts } from "@/components/reports/report-charts";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/guard";
import { formatJalali } from "@/lib/jalali";
import { CASE_STATUS } from "@/lib/labels";
import { faNum, formatBytes } from "@/lib/text";
import { printRootCss } from "@/theme/skins";
import { getOffice } from "./admin";
import { buildWorkbook } from "./excel";
import { esc, htmlToPdf } from "./pdf";
import { officeReport, resolveRange, type OfficeReport, type RangeQuery } from "./reports";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PERCENT = 100;
const WIDE = 32;
const MID = 22;
const PDF_CSS = `
  .chart { break-inside: avoid; margin: 0 0 14px; }
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
  .charts .chart.wide { grid-column: 1 / -1; }
`;

export interface ExportFile { data: Buffer; name: string; type: string }

const stamp = () => formatJalali(new Date(), "date").split("/").join("-");

function summaryRows(rep: OfficeReport): [string, number, number][] {
  const t = rep.totals;
  const p = rep.previous;
  return [
    ["مراجعان جدید", t.newClients, p.newClients], ["پرونده‌های جدید", t.newCases, p.newCases], ["پرونده‌های مختومه", t.closedCases, p.closedCases],
    ["اسناد ثبت‌شده", t.docs, p.docs], ["نامه وارده", t.corrIn, p.corrIn], ["نامه صادره", t.corrOut, p.corrOut],
    ["وظایف انجام‌شده", t.tasksDone, p.tasksDone], ["مهلت‌های انجام‌شده", t.deadlinesDone, p.deadlinesDone],
  ];
}

const workflowLine = (rep: OfficeReport): string => [
  `میانگین زمان انجام وظایف: ${rep.workflow.avgDays === null ? "—" : `${faNum(Number(rep.workflow.avgDays.toFixed(1)))} روز`}`,
  `انجام در موعد: ${rep.workflow.onTimeRate === null ? "—" : `${faNum(Math.round(rep.workflow.onTimeRate * PERCENT))}٪`}`,
  `بر پایه ${faNum(rep.workflow.sample)} وظیفه`,
].join(" · ");

async function excel(user: SessionUser, rep: OfficeReport, title: string): Promise<ExportFile> {
  const office = await getOffice();
  const sheets = [
    { name: "خلاصه", columns: [{ header: "شاخص", key: "k", width: WIDE }, { header: "دوره جاری", key: "v" }, { header: "دوره قبل", key: "p" }, { header: "اختلاف", key: "d" }], rows: summaryRows(rep).map(([k, v, p]) => ({ k, v, p, d: v - p })) },
    { name: "روند", columns: [{ header: rep.bucket === "week" ? "هفته" : "ماه", key: "l", width: WIDE }, { header: "پرونده جدید", key: "c" }, { header: "پرونده جدید (دوره قبل)", key: "cp" }, { header: "وظیفه انجام‌شده", key: "t" }, { header: "وظیفه انجام‌شده (دوره قبل)", key: "tp" }, { header: "نامه وارده", key: "i" }, { header: "نامه صادره", key: "o" }],
      rows: rep.buckets.map((b, i) => ({ l: b.long, c: rep.series.cases.cur[i], cp: rep.series.cases.prev[i], t: rep.series.tasksDone.cur[i], tp: rep.series.tasksDone.prev[i], i: rep.series.corrIn[i], o: rep.series.corrOut[i] })) },
    { name: "قیف وظایف", columns: [{ header: "مرحله", key: "k", width: MID }, { header: "تعداد", key: "v" }], rows: rep.funnel.map((f) => ({ k: f.label, v: f.value })) },
    { name: "پیامد مهلت‌ها", columns: [{ header: "پیامد", key: "k", width: MID }, { header: "تعداد", key: "v" }], rows: rep.deadlineOutcomes.map((f) => ({ k: f.label, v: f.value })) },
    { name: "زمان انجام", columns: [{ header: "بازه", key: "k", width: MID }, { header: "تعداد وظیفه", key: "v" }], rows: rep.cycle.map((f) => ({ k: f.label, v: f.value })) },
    { name: "کارمندان", columns: [{ header: "کارمند", key: "name", width: WIDE }, { header: "واحد", key: "department", width: MID }, { header: "پرونده جاری", key: "cases" }, { header: "وظیفه باز", key: "open" }, { header: "انجام‌شده در دوره", key: "done" }, { header: "معوق", key: "overdue" }], rows: rep.employees },
    { name: "واحدها", columns: [{ header: "واحد", key: "name", width: MID }, { header: "تعداد کارمند", key: "staff" }, { header: "پرونده جاری", key: "cases" }, { header: "وظیفه باز", key: "open" }, { header: "انجام‌شده", key: "done" }, { header: "معوق", key: "overdue" }], rows: rep.departments },
    { name: "وضعیت پرونده‌ها", columns: [{ header: "وضعیت", key: "k", width: MID }, { header: "تعداد", key: "v" }], rows: rep.casesByStatus.map((x) => ({ k: CASE_STATUS[x.key]?.label ?? x.key, v: x.count })) },
    { name: "اسناد", columns: [{ header: "نوع سند", key: "k", width: MID }, { header: "تعداد", key: "v" }], rows: rep.docsByCategory.map((x) => ({ k: x.key, v: x.count })) },
  ];
  const data = await buildWorkbook(sheets, { title: `${office.officeName} — ${title}`, subtitle: `دوره: ${rep.range.label} · مقایسه با ${rep.prev.label} · تاریخ تهیه: ${formatJalali(new Date(), "datetime")} · تهیه‌کننده: ${user.fullName}` });
  await audit({ actorId: user.id, action: "report.exported", entityType: "Export", entityLabel: `${title} (Excel)`, meta: { rows: sheets.reduce((a, s) => a + s.rows.length, 0) } });
  return { data, name: `office-report-${stamp()}.xlsx`, type: XLSX };
}

const table = (head: string[], rows: (string | number)[][]): string =>
  `<table class="report"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
    rows.map((r) => `<tr>${r.map((c) => `<td>${esc(typeof c === "number" ? faNum(c) : c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${head.length}">—</td></tr>`
  }</tbody></table>`;

async function pdf(user: SessionUser, rep: OfficeReport, title: string): Promise<ExportFile> {
  const office = await getOffice();
  // react-dom/server در گراف App Router با import ایستا مجاز نیست؛ در زمان اجرا و فقط برای همین خروجی بارگذاری می‌شود
  const { renderToStaticMarkup } = await import("react-dom/server");
  const charts = reportCharts(rep, "rtl")
    .map((c) => `<div class="chart${c.wide ? " wide" : ""}">${renderToStaticMarkup(<>{c.node}</>)}</div>`).join("");
  const body = `<div class="head"><div><b>${esc(office.officeName)}</b><div class="small muted">گزارش عملکرد دفتر</div></div><div class="small">دوره: ${esc(rep.range.label)}<br>مقایسه با: ${esc(rep.prev.label)}<br>تاریخ تهیه: ${formatJalali(new Date(), "datetime")}</div></div>
    <h1>${esc(title)} — ${esc(rep.range.label)}</h1>
    <h2>خلاصه شاخص‌ها</h2>${table(["شاخص", "دوره جاری", "دوره قبل", "اختلاف"], summaryRows(rep).map(([k, v, p]) => [k, v, `${v - p > 0 ? "+" : ""}${faNum(v - p)}`]))}
    <p>${esc(workflowLine(rep))}</p>
    <h2>نمودارها</h2><div class="charts">${charts}</div>
    <h2>بار کاری کارمندان</h2>${table(["کارمند", "واحد", "پرونده جاری", "وظیفه باز", "انجام‌شده در دوره", "معوق"], rep.employees.map((e) => [e.name, e.department, e.cases, e.open, e.done, e.overdue]))}
    <p class="small muted">حجم اسناد ثبت‌شده در دوره: ${formatBytes(Number(rep.totals.docBytes))} · همه ارقام از رکوردهای واقعی سامانه و در محدوده دسترسی تهیه‌کننده (${esc(user.fullName)}) محاسبه شده است.</p>`;
  const data = await htmlToPdf({ title, bodyHtml: body, footerNote: `${office.officeName} — ${title} ${rep.range.label}`, extraCss: `${printRootCss()}${CHART_CSS}${PDF_CSS}` });
  await audit({ actorId: user.id, action: "report.exported", entityType: "Export", entityLabel: `${title} ${rep.range.label} (PDF)` });
  return { data, name: `office-report-${stamp()}.pdf`, type: "application/pdf" };
}

export async function reportExport(kind: "report" | "report-pdf", user: SessionUser, q: RangeQuery): Promise<ExportFile> {
  const rep = await officeReport(user, resolveRange(q));
  const title = "گزارش عملکرد";
  return kind === "report" ? excel(user, rep, title) : pdf(user, rep, title);
}
