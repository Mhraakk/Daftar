// کیت نمودار «دفتر»: مؤلفه‌های سمت سرور (HTML + SVG) با نشانه‌گذاری به سبک IBCS، ارقام فارسی، محور زمان راست‌به‌چپ
// و دسترس‌پذیری کامل: عنوان و خلاصه، برچسب هر نشانه برای صفحه‌خوان و صفحه‌کلید، راهنما برای دو سری یا بیشتر،
// و جدول داده‌ها برای هر نمودار. راهنمای ابزار با ChartTips (سمت مرورگر) اضافه می‌شود ولی هیچ مقداری فقط در آن نیست.
//   واقعی = خاکستری پررنگ (--chart-actual)، دوره قبل = خاکستری روشن (--chart-prev)، تأکید = --chart-1،
//   اختلاف مثبت/منفی = --chart-pos/--chart-neg همراه علامت + و −، رنگ‌های دسته‌ای به ترتیب ثابت chart-1…6.
import { useId } from "react";
import { axisLabel, compact, percent, signed, signedPercent } from "@/lib/chart/format";
import { linear, type AxisDir } from "@/lib/chart/scale";
import { startOfJalaliWeek } from "@/lib/chart/time";
import { cn } from "@/lib/cn";
import { addDays, formatJalali, jParts, J_MONTHS, J_WEEKDAYS_SHORT } from "@/lib/jalali";
import { faNum } from "@/lib/text";

export const SERIES_TOKENS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6"] as const;
export type SeriesToken = (typeof SERIES_TOKENS)[number] | "chart-actual" | "chart-prev" | "chart-pos" | "chart-neg" | "lapis" | "zafaran" | "mohr" | "sabz";

export const tokenColor = (token: string, alpha?: number): string => (alpha === undefined ? `rgb(var(--${token}))` : `rgb(var(--${token}) / ${alpha})`);
const seriesColor = (i: number): string => tokenColor(SERIES_TOKENS[i % SERIES_TOKENS.length]);

const PCT = 100;
const SVG_SIZE = 1000;
const HALF = 0.5;
const DEFAULT_HEIGHT = 200;
/** بیشینه برچسب محور افقی (بقیه پنهان؛ مقدار در راهنما و جدول هست) */
const MAX_X_LABELS = 6;
const MAX_TABLE_ROWS = 12;
/** فاصله عمودی کمینه (٪ ارتفاع) میان برچسب‌های پایان خط؛ نزدیک‌تر از این برچسب‌ها حذف و به راهنما سپرده می‌شوند */
const END_LABEL_GAP = 9;
const MAX_END_LABELS = 4;
const SHARE_LABEL_MIN = 0.12;
/** چهار پله شدت نقشه حرارتی (شفافیت یک فام) و مرزهای چارک برای تقسیم روزهای غیرصفر */
const LEVEL_LOW = 0.3;
const LEVEL_MID = 0.5;
const LEVEL_HIGH = 0.75;
const HEAT_LEVELS = [LEVEL_LOW, LEVEL_MID, LEVEL_HIGH, 1];
const Q1 = 0.25;
const Q2 = 0.5;
const Q3 = 0.75;
const QUARTILES = [Q1, Q2, Q3];
const DAYS_IN_WEEK = 7;
/** برچسب روزهای شنبه، دوشنبه و چهارشنبه کنار نقشه حرارتی (بقیه برای خلوتی پنهان) */
const SATURDAY_ROW = 0;
const MONDAY_ROW = 2;
const WEDNESDAY_ROW = 4;
const SHOWN_WEEKDAYS = new Set([SATURDAY_ROW, MONDAY_ROW, WEDNESDAY_ROW]);
const HEAT_CELL = 13;
const BAR_THICKNESS = 16;
/** سهم بیشینه میله از پهنای خط؛ باقی برای برچسب مقدار در انتهای میله */
const TIP_SCALE = 0.84;
const RING_RADIUS = 18;
const RING_BOX = 42;
const RING_CENTER = 21;
const RING_STROKE = 4;
const RING_START = -90;
const RING_SIZE = 56;
const DASH_DIGITS = 2;
const RING_TRACK_ALPHA = 0.18;
/** نسبت اندازه متن مرکز حلقه به قطر آن */
const RING_FONT_DIV = 4;
const RADIANS_PER_HALF_TURN = Math.PI;
const FULL_TURN = RADIANS_PER_HALF_TURN + RADIANS_PER_HALF_TURN;
const SPARK_DOT = 2.6;
const SPARK_DOT_SIZE = 6;
const SPARK_HEIGHT = 28;
const MS_PER_DAY = 86_400_000;

interface TipRow { label: string; value: string; color?: string }
/** داده راهنمای ابزار (JSON) — ChartTips آن را با textContent نمایش می‌دهد */
const tip = (title: string, rows: TipRow[]): string => JSON.stringify({ t: title, r: rows.map((r) => [r.label, r.value, r.color ?? ""]) });

export interface LegendItem { label: string; color: string; kind?: "box" | "line" | "outline" }
/** numeric: شماره ستون‌های عددی (پیش‌فرض: همه جز ستون نخست) */
export interface TableData { head: string[]; rows: (string | number)[][]; numeric?: number[] }

/** قاب مشترک هر نمودار: عنوان («شکل ۱ — …»)، خلاصه، راهنما، نمودار و جدول داده‌ها */
export function ChartFrame({ title, caption, summary, legend, table, className, children }: {
  title: string; caption?: string; summary: string; legend?: LegendItem[]; table: TableData; className?: string; children: React.ReactNode;
}) {
  const id = useId();
  const numeric = table.numeric ?? table.head.map((_, i) => i).slice(1);
  return (
    <figure className={cn("dfc", className)} aria-labelledby={`${id}-t`} aria-describedby={`${id}-s`}>
      <figcaption className="dfc-head">
        <p className="dfc-title" id={`${id}-t`}>{caption && <span className="dfc-cap">{caption} — </span>}{title}</p>
        <p className="dfc-sum" id={`${id}-s`}>{summary}</p>
      </figcaption>
      {legend && legend.length > 1 && (
        <ul className="dfc-legend">
          {legend.map((l) => (
            <li key={l.label}>
              <span className={cn("dfc-key", l.kind === "line" && "dfc-key-line", l.kind === "outline" && "dfc-key-outline")} style={l.kind === "outline" ? { borderColor: l.color } : { background: l.color }} aria-hidden />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      {children}
      <details className="dfc-table">
        <summary>جدول داده‌ها</summary>
        <table>
          <thead><tr>{table.head.map((h, i) => <th key={h} scope="col" className={cn(numeric.includes(i) && "is-num")}>{h}</th>)}</tr></thead>
          <tbody>
            {table.rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => (ci === 0 ? <th key={ci} scope="row">{c}</th> : <td key={ci} className={cn(numeric.includes(ci) && "is-num")}>{typeof c === "number" ? faNum(c) : c}</td>))}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function YAxis({ ticks, at, max }: { ticks: number[]; at: (v: number) => number; max: number }) {
  return (
    <div className="dfc-yaxis" aria-hidden>
      {ticks.map((t) => <span key={t} className="dfc-tick" style={{ bottom: `${at(t)}%` }}>{axisLabel(t, max)}</span>)}
    </div>
  );
}

function Grid({ ticks, at }: { ticks: number[]; at: (v: number) => number }) {
  return <>{ticks.map((t) => <span key={t} className={cn("dfc-grid", t === 0 && "is-zero")} style={{ bottom: `${at(t)}%` }} aria-hidden />)}</>;
}

function XLabels({ labels, dir }: { labels: string[]; dir: AxisDir }) {
  const every = Math.ceil(labels.length / MAX_X_LABELS);
  return (
    <div className="dfc-xlabels" dir={dir} style={{ marginInlineStart: "2.75rem" }} aria-hidden>
      {labels.map((l, i) => <span key={`${l}-${i}`} className={cn("dfc-xlabel", (labels.length - 1 - i) % every !== 0 && "is-skip")}>{l}</span>)}
    </div>
  );
}

export interface Point { label: string; long?: string; value: number; prev?: number | null }

/** ستونی زمانی (IBCS): واقعی در برابر دوره قبل، برچسب فقط برای آخرین و بیشینه، محور زمان راست‌به‌چپ */
export function ColumnChart({ title, caption, summary, data, unit, seriesLabel = "دوره جاری", prevLabel = "دوره قبل", highlight, dir = "rtl", height = DEFAULT_HEIGHT }: {
  title: string; caption?: string; summary: string; data: Point[]; unit: string; seriesLabel?: string; prevLabel?: string; highlight?: number; dir?: AxisDir; height?: number;
}) {
  const hasPrev = data.some((d) => d.prev !== undefined && d.prev !== null);
  const y = linear(data.flatMap((d) => [d.value, d.prev ?? 0]), 0, PCT);
  const maxAt = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  const labelled = new Set([data.length - 1, maxAt]);
  const name = (d: Point) => d.long ?? d.label;
  const overview = `نمودار ستونی: ${faNum(data.length)} دوره از ${name(data[0] ?? { label: "" })} تا ${name(data[data.length - 1] ?? { label: "" })}؛ محور عمودی ${unit} از ${faNum(y.min)} تا ${faNum(y.max)}`;
  return (
    <ChartFrame title={title} caption={caption} summary={summary}
      legend={hasPrev ? [{ label: seriesLabel, color: tokenColor("chart-actual") }, { label: prevLabel, color: tokenColor("chart-prev") }] : undefined}
      table={{ head: ["دوره", `${seriesLabel} (${unit})`, ...(hasPrev ? [prevLabel, "اختلاف"] : [])], rows: data.map((d) => [name(d), d.value, ...(hasPrev ? [d.prev ?? 0, signed(d.value - (d.prev ?? 0))] : [])]) }}>
      <div className="dfc-frame" dir={dir} style={{ height }}>
        <YAxis ticks={y.ticks} at={y} max={y.max} />
        <div className="dfc-area" role="img" aria-label={overview}>
          <Grid ticks={y.ticks} at={y} />
          <div className="dfc-cols" role="list">
            {data.map((d, i) => {
              const rows: TipRow[] = [{ label: seriesLabel, value: `${faNum(d.value)} ${unit}`, color: tokenColor(i === highlight ? "chart-1" : "chart-actual") }, ...(hasPrev ? [{ label: prevLabel, value: `${faNum(d.prev ?? 0)} ${unit}`, color: tokenColor("chart-prev") }] : [])];
              return (
                <div key={`${d.label}-${i}`} role="listitem" className="dfc-slot" tabIndex={0} data-tip={tip(name(d), rows)}
                  aria-label={`${name(d)}: ${faNum(d.value)} ${unit}${hasPrev ? `، ${prevLabel} ${faNum(d.prev ?? 0)}` : ""}`}>
                  {hasPrev && <div className="dfc-col"><span className="dfc-bar" style={{ height: `${y(d.prev ?? 0)}%`, background: tokenColor("chart-prev") }} /></div>}
                  <div className="dfc-col">
                    {labelled.has(i) && d.value > 0 && <span className="dfc-val" style={{ bottom: `${y(d.value)}%` }}>{compact(d.value)}</span>}
                    <span className="dfc-bar" style={{ height: `${y(d.value)}%`, background: tokenColor(i === highlight ? "chart-1" : "chart-actual") }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <XLabels labels={data.map((d) => d.label)} dir={dir} />
    </ChartFrame>
  );
}

export interface LineSeries { name: string; values: number[]; token?: SeriesToken }

/** خطی زمانی برای چند سری (رنگ دسته‌ای به ترتیب ثابت)، برچسب پایان خط هنگام جدایی، خط نشانگر عمودی هنگام اشاره */
export function LineChart({ title, caption, summary, labels, longLabels, series, unit, dir = "rtl", height = DEFAULT_HEIGHT, area = false }: {
  title: string; caption?: string; summary: string; labels: string[]; longLabels?: string[]; series: LineSeries[]; unit: string; dir?: AxisDir; height?: number; area?: boolean;
}) {
  const n = labels.length;
  const y = linear(series.flatMap((s) => s.values), 0, PCT);
  const pos = (i: number) => (i + HALF) / Math.max(n, 1);
  const svgX = (i: number) => (dir === "rtl" ? 1 - pos(i) : pos(i)) * SVG_SIZE;
  const svgY = (v: number) => SVG_SIZE - (y(v) / PCT) * SVG_SIZE;
  const colorOf = (s: LineSeries, i: number) => (s.token ? tokenColor(s.token) : seriesColor(i));
  const ends = series.map((s, i) => ({ s, i, v: s.values[n - 1] ?? 0 })).sort((a, b) => a.v - b.v);
  const separated = series.length <= MAX_END_LABELS && ends.every((e, k) => k === 0 || y(e.v) - y(ends[k - 1].v) >= END_LABEL_GAP);
  const name = (i: number) => longLabels?.[i] ?? labels[i];
  return (
    <ChartFrame title={title} caption={caption} summary={summary}
      legend={series.map((s, i) => ({ label: s.name, color: colorOf(s, i), kind: "line" as const }))}
      table={{ head: ["دوره", ...series.map((s) => `${s.name} (${unit})`)], rows: labels.map((_, i) => [name(i), ...series.map((s) => s.values[i] ?? 0)]) }}>
      <div className="dfc-frame" dir={dir} style={{ height }}>
        <YAxis ticks={y.ticks} at={y} max={y.max} />
        <div className="dfc-area" role="img" aria-label={`نمودار خطی ${series.map((s) => s.name).join("، ")} در ${faNum(n)} دوره؛ محور عمودی ${unit} از ${faNum(y.min)} تا ${faNum(y.max)}`}>
          <Grid ticks={y.ticks} at={y} />
          <svg className="dfc-svg" viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} preserveAspectRatio="none" aria-hidden>
            {series.map((s, si) => {
              const d = s.values.map((v, i) => `${i === 0 ? "M" : "L"}${svgX(i).toFixed(1)} ${svgY(v).toFixed(1)}`).join(" ");
              const fill = area && series.length === 1 ? `${d} L${svgX(n - 1).toFixed(1)} ${SVG_SIZE} L${svgX(0).toFixed(1)} ${SVG_SIZE} Z` : "";
              return (
                <g key={s.name}>
                  {fill && <path d={fill} fill={colorOf(s, si)} fillOpacity={0.1} stroke="none" />}
                  <path d={d} fill="none" stroke={colorOf(s, si)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
          </svg>
          {ends.map((e) => (
            <span key={e.s.name} aria-hidden>
              <span className="dfc-dot" style={{ insetInlineStart: `calc(${pos(n - 1) * PCT}% - 8px)`, bottom: `${y(e.v)}%`, background: colorOf(e.s, e.i) }} />
              {separated && <span className="dfc-dot-label" style={{ insetInlineStart: `${pos(n - 1) * PCT}%`, bottom: `${y(e.v)}%` }}>{compact(e.v)}</span>}
            </span>
          ))}
          {labels.map((_, i) => (
            <div key={i} className="dfc-hit" tabIndex={0} style={{ insetInlineStart: `${(i / n) * PCT}%`, width: `${PCT / n}%` }}
              data-tip={tip(name(i), series.map((s, si) => ({ label: s.name, value: `${faNum(s.values[i] ?? 0)} ${unit}`, color: colorOf(s, si) })))}
              aria-label={`${name(i)}: ${series.map((s) => `${s.name} ${faNum(s.values[i] ?? 0)}`).join("، ")} ${unit}`} />
          ))}
        </div>
      </div>
      <XLabels labels={labels} dir={dir} />
    </ChartFrame>
  );
}

export interface BarRow { label: string; value: number; href?: string; note?: string }

/** میله‌ای افقی برای دسته‌ها (رتبه‌بندی‌شده)، مقدار در انتهای میله، یک سری = یک رنگ */
export function BarChart({ title, caption, summary, rows, unit, token = "chart-1", sort = true }: {
  title: string; caption?: string; summary: string; rows: BarRow[]; unit: string; token?: SeriesToken; sort?: boolean;
}) {
  const list = sort ? [...rows].sort((a, b) => b.value - a.value) : rows;
  const max = Math.max(1, ...list.map((r) => r.value));
  const total = list.reduce((s, r) => s + r.value, 0);
  return (
    <ChartFrame title={title} caption={caption} summary={summary}
      table={{ head: ["دسته", unit, "سهم"], rows: list.map((r) => [r.label, r.value, total ? percent(r.value / total) : "—"]) }}>
      <div className="dfc-rows" role="list">
        {list.map((r) => {
          const body = (
            <>
              <span className="dfc-rlabel">{r.label}</span>
              <span className="dfc-track">
                <span className="dfc-hbar" style={{ width: `${(r.value / max) * PCT * TIP_SCALE}%`, background: tokenColor(token) }} />
                <span className="dfc-rval">{faNum(r.value)}{r.note && <small>{r.note}</small>}</span>
              </span>
            </>
          );
          const a11y = { role: "listitem", tabIndex: 0, "aria-label": `${r.label}: ${faNum(r.value)} ${unit}`, "data-tip": tip(r.label, [{ label: unit, value: faNum(r.value), color: tokenColor(token) }]) };
          return r.href
            ? <a key={r.label} href={r.href} className="dfc-row" {...a11y}>{body}</a>
            : <div key={r.label} className="dfc-row" {...a11y}>{body}</div>;
        })}
      </div>
    </ChartFrame>
  );
}

export interface StackRow { label: string; parts: number[] }

/** میله‌ای انباشته افقی: سهم هر بخش (share) یا مقدار مطلق؛ فاصله ۲px میان بخش‌ها، راهنما و جدول */
export function StackedBars({ title, caption, summary, rows, series, unit, mode = "absolute" }: {
  title: string; caption?: string; summary: string; rows: StackRow[]; series: string[]; unit: string; mode?: "absolute" | "share";
}) {
  const totals = rows.map((r) => r.parts.reduce((s, v) => s + v, 0));
  const max = Math.max(1, ...totals);
  return (
    <ChartFrame title={title} caption={caption} summary={summary}
      legend={series.map((s, i) => ({ label: s, color: seriesColor(i) }))}
      table={{ head: ["دسته", ...series, "جمع"], rows: rows.map((r, ri) => [r.label, ...r.parts, totals[ri]]) }}>
      <div className="dfc-rows" role="list">
        {rows.map((r, ri) => {
          const total = totals[ri];
          const scale = mode === "share" ? PCT / Math.max(total, 1) : PCT / max;
          return (
            <div key={r.label} className="dfc-row" role="listitem" tabIndex={0}
              aria-label={`${r.label}: ${r.parts.map((v, i) => `${series[i]} ${faNum(v)}`).join("، ")}؛ جمع ${faNum(total)} ${unit}`}
              data-tip={tip(r.label, r.parts.map((v, i) => ({ label: series[i], value: total ? `${faNum(v)} (${percent(v / total)})` : faNum(v), color: seriesColor(i) })))}>
              <span className="dfc-rlabel">{r.label}</span>
              <span className="dfc-track">
                {r.parts.map((v, i) => (v > 0 ? <span key={series[i]} className="dfc-seg" style={{ width: `${v * scale * TIP_SCALE}%`, background: seriesColor(i) }} /> : null))}
                <span className="dfc-rval">{faNum(total)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </ChartFrame>
  );
}

export interface VarianceRow { label: string; actual: number; prev: number }

/** اختلاف با دوره قبل (IBCS): میله‌های دوسویه از خط صفر، مثبت سبز و منفی قرمز همراه علامت و درصد */
export function VarianceBars({ title, caption, summary, rows, unit, goodWhenUp = true }: {
  title: string; caption?: string; summary: string; rows: VarianceRow[]; unit: string; goodWhenUp?: boolean;
}) {
  const deltas = rows.map((r) => r.actual - r.prev);
  const max = Math.max(1, ...deltas.map(Math.abs));
  const good = (d: number) => (d >= 0) === goodWhenUp;
  return (
    <ChartFrame title={title} caption={caption} summary={summary}
      legend={[{ label: goodWhenUp ? "افزایش" : "کاهش", color: tokenColor("chart-pos") }, { label: goodWhenUp ? "کاهش" : "افزایش", color: tokenColor("chart-neg") }]}
      table={{ head: ["دسته", "دوره جاری", "دوره قبل", "اختلاف", "درصد"], rows: rows.map((r, i) => [r.label, r.actual, r.prev, signed(deltas[i]), r.prev ? signedPercent(deltas[i] / r.prev) : "—"]) }}>
      <div className="dfc-rows" role="list">
        {rows.map((r, i) => {
          const d = deltas[i];
          const bar = <span style={{ width: `${(Math.abs(d) / max) * PCT}%`, height: BAR_THICKNESS, background: tokenColor(good(d) ? "chart-pos" : "chart-neg") }} />;
          const pct = r.prev ? ` (${signedPercent(d / r.prev)})` : "";
          return (
            <div key={r.label} className="dfc-row" role="listitem" tabIndex={0} aria-label={`${r.label}: ${signed(d)} ${unit}${pct}`}
              data-tip={tip(r.label, [{ label: "دوره جاری", value: faNum(r.actual) }, { label: "دوره قبل", value: faNum(r.prev) }, { label: "اختلاف", value: `${signed(d)}${pct}`, color: tokenColor(good(d) ? "chart-pos" : "chart-neg") }])}>
              <span className="dfc-rlabel">{r.label}</span>
              <span className="dfc-var" aria-hidden>
                <span className="dfc-var-neg">{d < 0 && bar}</span>
                <span className="dfc-var-pos">{d > 0 && bar}</span>
              </span>
              <span className="dfc-rval">{signed(d)}<small>{pct}</small></span>
            </div>
          );
        })}
      </div>
    </ChartFrame>
  );
}

const dayKey = (d: Date): string => formatJalali(d, "input");

/** نقشه حرارتی تقویم جلالی: ستون‌ها هفته‌ها (شنبه تا جمعه)، از راست به چپ؛ شدت با یک فام از روشن به تیره */
export function CalendarHeatmap({ title, caption, summary, from, to, values, unit, cell = HEAT_CELL }: {
  title: string; caption?: string; summary: string; from: Date; to: Date; values: Record<string, number>; unit: string; cell?: number;
}) {
  const first = startOfJalaliWeek(from);
  const spanDays = Math.floor((to.getTime() - first.getTime()) / MS_PER_DAY) + 1;
  const weeks = Math.ceil(spanDays / DAYS_IN_WEEK);
  const days = Array.from({ length: weeks * DAYS_IN_WEEK }, (_, i) => addDays(first, i));
  const nonzero = Object.values(values).filter((v) => v > 0).sort((a, b) => a - b);
  const cuts = QUARTILES.map((q) => nonzero[Math.floor(q * (nonzero.length - 1))] ?? 0);
  const level = (v: number) => (v <= 0 ? -1 : cuts.filter((c) => v > c).length);
  const inRange = (d: Date) => d >= addDays(from, -1) && d <= to;
  const monthStarts = Array.from({ length: weeks }, (_, w) => days.slice(w * DAYS_IN_WEEK, (w + 1) * DAYS_IN_WEEK).find((d) => jParts(d).jd === 1 && inRange(d)));
  const busiest = Object.entries(values).sort((a, b) => b[1] - a[1]).slice(0, MAX_TABLE_ROWS);
  return (
    <ChartFrame title={title} caption={caption} summary={summary}
      table={{ head: ["روز", unit], rows: busiest.map(([k, v]) => [k, v]) }}>
      <div className="dfc-heat-wrap" style={{ ["--cell" as string]: `${cell}px` }}>
        <div className="dfc-heat-days" aria-hidden style={{ marginTop: "1.2rem" }}>
          {J_WEEKDAYS_SHORT.map((w, i) => <span key={w} style={{ visibility: SHOWN_WEEKDAYS.has(i) ? "visible" : "hidden" }}>{w}</span>)}
        </div>
        <div>
          <div className="dfc-heat-months" aria-hidden>{monthStarts.map((d, w) => <span key={w}>{d ? J_MONTHS[jParts(d).jm - 1] : ""}</span>)}</div>
          <div className="dfc-heat" role="list" aria-label={`${title}: ${faNum(weeks)} هفته`}>
            {days.map((d) => {
              const v = values[dayKey(d)] ?? 0;
              const l = level(v);
              const label = `${formatJalali(d, "long")}: ${faNum(v)} ${unit}`;
              return inRange(d)
                ? <span key={d.toISOString()} role="listitem" className="dfc-cell" tabIndex={v > 0 ? 0 : -1} aria-label={label} title={label}
                    data-tip={tip(formatJalali(d, "long"), [{ label: unit, value: faNum(v) }])}
                    style={l >= 0 ? { background: tokenColor("chart-1", HEAT_LEVELS[l]) } : undefined} />
                : <span key={d.toISOString()} className="dfc-cell is-out" aria-hidden />;
            })}
          </div>
        </div>
      </div>
      <div className="dfc-scale" aria-hidden>
        <span>کم</span>
        <span className="dfc-cell" />
        {HEAT_LEVELS.map((a) => <span key={a} className="dfc-cell" style={{ background: tokenColor("chart-1", a) }} />)}
        <span>زیاد</span>
      </div>
    </ChartFrame>
  );
}

export interface TimelineRow { label: string; start: Date; end?: Date | null; token?: SeriesToken; href?: string; note?: string }

/** خط زمانی (گانت): هر ردیف از آغاز تا پایان؛ رویدادهای تک‌روزه نقطه؛ خط «امروز» */
export function Timeline({ title, caption, summary, rows, from, to, today = new Date() }: {
  title: string; caption?: string; summary: string; rows: TimelineRow[]; from: Date; to: Date; today?: Date;
}) {
  const span = Math.max(1, to.getTime() - from.getTime());
  const at = (d: Date) => Math.min(PCT, Math.max(0, ((d.getTime() - from.getTime()) / span) * PCT));
  const showToday = today >= from && today <= to;
  return (
    <ChartFrame title={title} caption={caption} summary={summary}
      table={{ head: ["مورد", "آغاز", "پایان"], numeric: [], rows: rows.map((r) => [r.label, formatJalali(r.start, "date"), r.end ? formatJalali(r.end, "date") : "—"]) }}>
      <div className="dfc-tl" role="list">
        {rows.map((r, i) => {
          const color = tokenColor(r.token ?? "chart-1");
          const label = `${r.label}: ${formatJalali(r.start, "date")}${r.end ? ` تا ${formatJalali(r.end, "date")}` : ""}`;
          const tipData = tip(r.label, [{ label: "آغاز", value: formatJalali(r.start, "long") }, ...(r.end ? [{ label: "پایان", value: formatJalali(r.end, "long") }] : []), ...(r.note ? [{ label: "توضیح", value: r.note }] : [])]);
          const mark = r.end && r.end > r.start
            ? <span className="dfc-tl-bar" style={{ insetInlineStart: `${at(r.start)}%`, width: `${Math.max(at(r.end) - at(r.start), 1)}%`, background: color }} />
            : <span className="dfc-tl-mark" style={{ insetInlineStart: `calc(${at(r.start)}% - 10px)`, background: color }} />;
          return (
            <div key={`${r.label}-${i}`} className="dfc-tl-row" role="listitem">
              <span className="dfc-rlabel">{r.href ? <a href={r.href}>{r.label}</a> : r.label}</span>
              <span className="dfc-tl-track" tabIndex={0} aria-label={label} data-tip={tipData}>
                {showToday && i === 0 && <span className="dfc-today" style={{ insetInlineStart: `${at(today)}%` }}><span>امروز</span></span>}
                {showToday && i > 0 && <span className="dfc-today" style={{ insetInlineStart: `${at(today)}%` }} aria-hidden />}
                {mark}
              </span>
            </div>
          );
        })}
      </div>
    </ChartFrame>
  );
}

export interface FunnelStep { label: string; value: number }

/** قیف مراحل: پهنای هر میله نسبت به مرحله نخست و درصد گذر از مرحله قبل */
export function Funnel({ title, caption, summary, steps, unit }: { title: string; caption?: string; summary: string; steps: FunnelStep[]; unit: string }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ChartFrame title={title} caption={caption} summary={summary}
      table={{ head: ["مرحله", unit, "گذر از مرحله قبل"], rows: steps.map((s, i) => [s.label, s.value, i && steps[i - 1].value ? percent(s.value / steps[i - 1].value) : "—"]) }}>
      <div className="dfc-funnel" role="list">
        {steps.map((s, i) => (
          <div key={s.label} role="listitem">
            {i > 0 && <p className="dfc-fconv" aria-hidden>{steps[i - 1].value ? `↓ ${percent(s.value / steps[i - 1].value)}` : ""}</p>}
            <div className="dfc-fstep" tabIndex={0} aria-label={`${s.label}: ${faNum(s.value)} ${unit}`} data-tip={tip(s.label, [{ label: unit, value: faNum(s.value), color: tokenColor("chart-1") }])}>
              <span className="dfc-rlabel">{s.label} <b className="dfc-fval">{faNum(s.value)}</b></span>
              <span className="dfc-fbar-wrap"><span className="dfc-fbar" style={{ width: `${(s.value / top) * PCT}%`, background: tokenColor("chart-1") }} /></span>
            </div>
          </div>
        ))}
      </div>
    </ChartFrame>
  );
}

/** خط ریز روند (برای کاشی آمار)؛ آخرین نقطه با رنگ تأکید */
export function Sparkline({ values, token = "chart-1", height = SPARK_HEIGHT, label }: { values: number[]; token?: SeriesToken; height?: number; label: string }) {
  const n = values.length;
  const y = linear(values, 0, SVG_SIZE);
  const x = (i: number) => SVG_SIZE - (n > 1 ? (i / (n - 1)) * SVG_SIZE : SVG_SIZE * HALF);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${(SVG_SIZE - y(v)).toFixed(1)}`).join(" ");
  const last = values[n - 1] ?? 0;
  return (
    <span className="dfc-sparkwrap" style={{ height }} role="img" aria-label={`${label}: ${values.map((v) => faNum(v)).join("، ")}`}>
      <svg className="dfc-spark" viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} preserveAspectRatio="none" aria-hidden>
        <path d={d} fill="none" stroke={tokenColor("chart-prev")} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <span className="dfc-dot" style={{ left: `calc(0% - ${SPARK_DOT}px)`, bottom: `calc(${(y(last) / SVG_SIZE) * PCT}% - 0px)`, background: tokenColor(token), transform: "translate(0,50%)", width: SPARK_DOT_SIZE, height: SPARK_DOT_SIZE }} aria-hidden />
    </span>
  );
}

/** حلقه پیشرفت برای یک مقدار (هرگز نمودار دایره‌ای برای مقایسه) */
export function Ring({ ratio, label, size = RING_SIZE, token = "chart-1", center }: { ratio: number; label: string; size?: number; token?: SeriesToken; center?: string }) {
  const r = Math.min(1, Math.max(0, ratio));
  const circumference = FULL_TURN * RING_RADIUS;
  return (
    <span className="dfc-ring" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${percent(r)}`}>
      <svg viewBox={`0 0 ${RING_BOX} ${RING_BOX}`} width={size} height={size} aria-hidden>
        <circle cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS} fill="none" stroke={tokenColor(token, RING_TRACK_ALPHA)} strokeWidth={RING_STROKE} />
        <circle cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS} fill="none" stroke={tokenColor(token)} strokeWidth={RING_STROKE} strokeLinecap="round"
          strokeDasharray={`${(r * circumference).toFixed(DASH_DIGITS)} ${circumference.toFixed(DASH_DIGITS)}`} transform={`rotate(${RING_START} ${RING_CENTER} ${RING_CENTER})`} />
      </svg>
      <span style={{ fontSize: size / RING_FONT_DIV }}>{center ?? percent(r)}</span>
    </span>
  );
}

/** رنگ اختلاف: جهت × خوب‌بودن افزایش (کاهش هزینه خوب است، کاهش پرونده‌های بسته‌شده بد) */
function deltaTone(delta?: { value: number; goodWhenUp?: boolean }): string {
  if (!delta || delta.value === 0) return "is-flat";
  return (delta.value > 0) === (delta.goodWhenUp ?? true) ? "is-good" : "is-bad";
}

/** کاشی آمار: برچسب، مقدار (ارقام متناسب)، اختلاف با دوره نام‌برده و روند */
export function StatTile({ label, value, delta, trend, href }: {
  label: string; value: number; delta?: { value: number; period: string; goodWhenUp?: boolean }; trend?: number[]; href?: string;
}) {
  const tone = deltaTone(delta);
  const body = (
    <>
      <span className="dfc-stat-label">{label}</span>
      <span className="dfc-stat-value">{compact(value)}</span>
      {delta && <span className={cn("dfc-stat-delta", tone)}>{signed(delta.value)} <span>نسبت به {delta.period}</span></span>}
      {trend && trend.length > 1 && <Sparkline values={trend} label={`روند ${label}`} />}
    </>
  );
  return href ? <a href={href} className="dfc-stat">{body}</a> : <div className="dfc-stat">{body}</div>;
}
