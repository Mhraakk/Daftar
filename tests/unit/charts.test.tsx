/* eslint-disable ts-patterns/no-magic-numbers -- assertions compare against literal expected values */
// کیت نمودار: مقیاس‌های گرد، قالب عدد فارسی، دوره‌های جلالی (هفته از شنبه)، محور زمان راست‌به‌چپ و دسترس‌پذیری.
// با CHART_GALLERY=<پوشه> گالری HTML همه نمودارها برای بازبینی چشمی در چهار پوسته هم نوشته می‌شود.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BarChart, CalendarHeatmap, ColumnChart, Funnel, LineChart, Ring, StackedBars, StatTile, Timeline, VarianceBars } from "@/components/charts";
import { CHART_CSS } from "@/components/charts/css";
import { axisLabel, compact, percent, signed, signedPercent } from "@/lib/chart/format";
import { bands, linear, niceStep } from "@/lib/chart/scale";
import { countBy, periods, startOfJalaliWeek } from "@/lib/chart/time";
import { addDays, formatJalali, fromJalali } from "@/lib/jalali";
import { SKIN_IDS, skinCss } from "@/theme/skins";

const NOW = fromJalali(1405, 8, 26, 10, 0);

describe("scales", () => {
  it("picks 1-2-5 steps and always includes zero", () => {
    expect(niceStep(34, 4)).toBe(10);
    expect(niceStep(7, 4)).toBe(2);
    expect(niceStep(1800, 4)).toBe(500);
    const y = linear([12, 34, 9], 0, 100);
    expect(y.ticks).toEqual([0, 10, 20, 30, 40]);
    expect(y(40)).toBe(100);
    expect(y(0)).toBe(0);
    expect(linear([0, 0], 0, 100).max).toBeGreaterThan(0);
  });

  it("places the first band on the right in right-to-left", () => {
    const rtl = bands(3, 300, 24, true);
    const ltr = bands(3, 300, 24, false);
    expect(rtl[0].center).toBe(250);
    expect(ltr[0].center).toBe(50);
    expect(rtl[0].size).toBeLessThanOrEqual(24);
  });
});

describe("Persian number formats", () => {
  it("keeps axis labels full below 10,000 and compact above, with Persian digits", () => {
    expect(compact(1284)).toBe("۱٬۲۸۴");
    expect(compact(12_500)).toBe("۱۲٫۵ هزار");
    expect(compact(4_200_000)).toBe("۴٫۲ میلیون");
    expect(axisLabel(2000, 8000)).toBe("۲٬۰۰۰");
    expect(axisLabel(20_000, 40_000)).toBe("۲۰ هزار");
  });

  it("signs differences explicitly and formats percentages", () => {
    expect(signed(12)).toBe("+۱۲");
    expect(signed(-5)).toBe("−۵");
    expect(signed(0)).toBe("۰");
    expect(percent(0.42)).toBe("۴۲٪");
    expect(signedPercent(-0.25)).toBe("−۲۵٪");
    expect(signedPercent(Infinity)).toBe("—");
  });
});

describe("Jalali periods", () => {
  it("starts weeks on Saturday in Tehran", () => {
    // ۲۶ آبان ۱۴۰۵ سه‌شنبه است (۱۷ نوامبر ۲۰۲۶)؛ شنبه همان هفته ۲۳ آبان
    const wednesday = fromJalali(1405, 8, 27, 15, 0);
    expect(formatJalali(startOfJalaliWeek(wednesday), "input")).toBe("1405/08/23");
    const saturdayMorning = fromJalali(1405, 8, 23, 0, 30);
    expect(formatJalali(startOfJalaliWeek(saturdayMorning), "input")).toBe("1405/08/23");
    const fridayNight = fromJalali(1405, 8, 22, 23, 50);
    expect(formatJalali(startOfJalaliWeek(fridayNight), "input")).toBe("1405/08/16");
  });

  it("builds consecutive months ending with the current one and counts events", () => {
    const months = periods("month", 3, NOW);
    expect(months.map((m) => m.long)).toEqual(["شهریور ۱۴۰۵", "مهر ۱۴۰۵", "آبان ۱۴۰۵"]);
    expect(months[1].start.getTime()).toBe(months[0].end.getTime());
    expect(countBy(months, [fromJalali(1405, 7, 3), fromJalali(1405, 8, 1), fromJalali(1405, 8, 20), fromJalali(1404, 1, 1)])).toEqual([0, 1, 2]);
  });
});

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
/** شمار رخداد یک رشته در HTML خروجی */
const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;
const sample = periods("month", 4, NOW).map((m, i) => ({ label: m.label, long: m.long, value: [12, 30, 9, 21][i], prev: [10, 18, 14, 20][i] }));

describe("chart rendering", () => {
  it("column chart: one focusable labelled slot per period, legend for two series, data table", () => {
    const out = html(<ColumnChart title="ثبت پرونده" summary="پرونده‌های تازه" unit="پرونده" data={sample} />);
    expect(count(out, 'class="dfc-slot"')).toBe(4);
    expect(out).toContain('aria-label="آبان ۱۴۰۵: ۲۱ پرونده، دوره قبل ۲۰"');
    expect(out).toContain('dir="rtl"');
    expect(out).toContain("دوره قبل</li>");
    expect(count(out, "<tr>")).toBe(5);
    expect(out).toContain("+۱۲");
    // برچسب مقدار فقط روی آخرین و بیشینه
    expect(count(out, 'class="dfc-val"')).toBe(2);
  });

  it("supports a left-to-right time axis as an office option", () => {
    expect(html(<ColumnChart title="t" summary="s" unit="u" data={sample} dir="ltr" />)).toContain('dir="ltr"');
  });

  it("line chart: crosshair slots carry every series, end labels when separated", () => {
    const out = html(<LineChart title="کارتابل" summary="وارده و صادره" unit="نامه" labels={["الف", "ب", "ج"]} series={[{ name: "وارده", values: [5, 8, 20] }, { name: "صادره", values: [3, 4, 2] }]} />);
    expect(count(out, 'class="dfc-hit"')).toBe(3);
    expect(out).toContain('aria-label="ج: وارده ۲۰، صادره ۲ نامه"');
    expect(count(out, 'class="dfc-dot-label"')).toBe(2);
    expect(out).toContain("vector-effect=\"non-scaling-stroke\"");
  });

  it("escapes data used in tooltips and labels", () => {
    const out = html(<BarChart title="t" summary="s" unit="u" rows={[{ label: "<img src=x onerror=alert(1)>", value: 3 }]} />);
    expect(out).not.toContain("<img src=x");
    expect(out).toContain("&lt;img");
  });

  it("variance bars sign every difference so colour is never the only cue", () => {
    const out = html(<VarianceBars title="t" summary="s" unit="مورد" rows={[{ label: "الف", actual: 30, prev: 20 }, { label: "ب", actual: 5, prev: 10 }]} />);
    expect(out).toContain("+۱۰");
    expect(out).toContain("−۵");
    expect(out).toContain("(+۵۰٪)");
  });

  it("other charts render accessible names", () => {
    const today = NOW;
    expect(html(<StackedBars title="t" summary="s" unit="u" series={["الف", "ب"]} rows={[{ label: "ر", parts: [2, 3] }]} />)).toContain("جمع ۵ u");
    expect(html(<CalendarHeatmap title="t" summary="s" unit="مهلت" from={addDays(today, -20)} to={today} values={{ [formatJalali(today, "input")]: 3 }} />)).toContain(`${formatJalali(today, "long")}: ۳ مهلت`);
    expect(html(<Timeline title="t" summary="s" from={addDays(today, -10)} to={addDays(today, 10)} today={today} rows={[{ label: "جلسه", start: addDays(today, 2) }]} />)).toContain("امروز");
    expect(html(<Funnel title="t" summary="s" unit="u" steps={[{ label: "الف", value: 10 }, { label: "ب", value: 5 }]} />)).toContain("۵۰٪");
    expect(html(<Ring ratio={0.68} label="پیشرفت" />)).toContain('aria-label="پیشرفت: ۶۸٪"');
    expect(html(<StatTile label="فعال" value={186} delta={{ value: -4, period: "هفته قبل" }} />)).toContain("is-bad");
  });
});

describe("gallery", () => {
  it.skipIf(!process.env.CHART_GALLERY)("writes an HTML gallery of every chart in each skin", () => {
    const months = periods("month", 8, NOW);
    const weeks = periods("week", 10, NOW);
    const heat = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [formatJalali(addDays(NOW, -i), "input"), (i * 7) % 5]).filter(([, v]) => Number(v) > 0));
    const body = html(
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16, padding: 16 }}>
        <section className="panel"><ColumnChart caption="شکل ۱" title="ثبت پرونده در ماه" summary="پرونده‌های تازه در هشت ماه اخیر در برابر همان ماه سال قبل" unit="پرونده" highlight={7} data={months.map((m, i) => ({ label: m.label, long: m.long, value: [12, 18, 9, 22, 30, 26, 19, 34][i], prev: [10, 15, 14, 18, 20, 21, 22, 25][i] }))} /></section>
        <section className="panel"><LineChart caption="شکل ۲" title="ورودی و خروجی کارتابل" summary="نامه‌های وارده و صادره در ده هفته (هفته از شنبه)" unit="نامه" labels={weeks.map((w) => w.label)} longLabels={weeks.map((w) => w.long)} series={[{ name: "وارده", values: [5, 8, 6, 12, 9, 14, 11, 16, 13, 18] }, { name: "صادره", values: [3, 4, 7, 6, 8, 7, 10, 9, 12, 10] }]} /></section>
        <section className="panel"><BarChart title="پرونده‌ها بر حسب دسته" summary="پرونده‌های باز به تفکیک دسته" unit="پرونده" rows={[{ label: "حقوقی", value: 42 }, { label: "خانواده", value: 18 }, { label: "کیفری", value: 11 }, { label: "ثبتی", value: 7 }]} /></section>
        <section className="panel"><StackedBars title="وظایف هر کارمند" summary="باز، در جریان و دیرکرد" unit="وظیفه" series={["باز", "در جریان", "دیرکرد"]} rows={[{ label: "علی رضایی", parts: [6, 3, 1] }, { label: "مریم احمدی", parts: [4, 5, 0] }, { label: "سارا کریمی", parts: [2, 1, 3] }]} /></section>
        <section className="panel"><VarianceBars title="اختلاف با ماه قبل" summary="تغییر شمار کارها نسبت به ماه قبل" unit="مورد" rows={[{ label: "دادخواست", actual: 34, prev: 25 }, { label: "لایحه", actual: 12, prev: 16 }, { label: "اظهارنامه", actual: 9, prev: 9 }, { label: "ابلاغیه", actual: 40, prev: 28 }]} /></section>
        <section className="panel"><CalendarHeatmap title="مهلت‌ها در روزهای سال" summary="مهلت‌های قانونی هر روز در چهار ماه اخیر" unit="مهلت" from={addDays(NOW, -119)} to={NOW} values={heat} /></section>
        <section className="panel"><Timeline title="خط زمانی پرونده" summary="رویدادهای اصلی پرونده" today={NOW} from={addDays(NOW, -60)} to={addDays(NOW, 30)} rows={[{ label: "تشکیل پرونده", start: addDays(NOW, -58) }, { label: "مهلت رفع نقص", start: addDays(NOW, -40), end: addDays(NOW, -30), token: "zafaran" }, { label: "رسیدگی", start: addDays(NOW, -25), end: addDays(NOW, 10) }, { label: "جلسه دادرسی", start: addDays(NOW, 12), token: "mohr" }]} /></section>
        <section className="panel"><Funnel title="قیف وظایف" summary="از ایجاد تا تأیید" unit="وظیفه" steps={[{ label: "ایجادشده", value: 120 }, { label: "انجام‌شده", value: 84 }, { label: "برای تأیید", value: 60 }, { label: "تأییدشده", value: 52 }]} /></section>
        <section className="panel" style={{ display: "flex", gap: 24, alignItems: "center" }}><Ring ratio={0.68} label="پیشرفت" /><StatTile label="پرونده‌های فعال" value={186} delta={{ value: 8, period: "هفته قبل" }} trend={[150, 160, 158, 170, 172, 180, 178, 186]} /></section>
      </div>,
    );
    const dir = String(process.env.CHART_GALLERY);
    SKIN_IDS.forEach((skin) => writeFileSync(path.join(dir, `gallery-${skin}.html`), `<!doctype html><html lang="fa" dir="rtl" data-skin="${skin}"><head><meta charset="utf-8"><style>${skinCss()}${CHART_CSS}
body{margin:0;font-family:Vazirmatn,Tahoma,sans-serif;background:var(--canvas),rgb(var(--paper));color:rgb(var(--ink))}
.panel{padding:16px;background:rgb(var(--surface));border:1px solid rgb(var(--line));border-radius:var(--radius-card)}
@font-face{font-family:Vazirmatn;src:url(file://${path.resolve("src/assets/fonts/Vazirmatn-Variable.woff2")})}</style></head><body>${body}</body></html>`));
    expect(body.length).toBeGreaterThan(1000);
  });
});
