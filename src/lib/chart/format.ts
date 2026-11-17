// قالب عدد در نمودارها با ارقام فارسی: محور زیر ۱۰٬۰۰۰ کامل و بالاتر فشرده («۱۲ هزار»، «۴٫۲ میلیون»)،
// اختلاف با علامت (+۱۲ / −۵) و درصد. ارقام درون یک عدد هرگز وارونه نمی‌شوند (Apple HIG، راست‌به‌چپ).
import { faNum } from "@/lib/text";

const THOUSAND = 1_000;
const MILLION = 1_000_000;
const BILLION = 1_000_000_000;
const COMPACT_FROM = 10_000;
const ONE_DECIMAL = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
const PERCENT = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const MINUS = "−";
const PERCENT_SCALE = 100;
const PLUS = "+";

const UNITS: [number, string][] = [[BILLION, "میلیارد"], [MILLION, "میلیون"], [THOUSAND, "هزار"]];

/** «۱۲ هزار»، «۴٫۲ میلیون»؛ زیر ۱۰٬۰۰۰ کامل */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs < COMPACT_FROM) return faNum(n);
  const [div, unit] = UNITS.find(([d]) => abs >= d) ?? [1, ""];
  return `${ONE_DECIMAL.format(n / div)} ${unit}`.trim();
}

/** برچسب تیک محور: یک سبک برای کل محور (اگر بیشینه به ۱۰٬۰۰۰ برسد همه فشرده) */
export function axisLabel(v: number, axisMax: number): string {
  return axisMax >= COMPACT_FROM ? compact(v) : faNum(v);
}

/** اختلاف با علامت صریح: «+۱۲»، «−۵»، «۰» */
export function signed(n: number): string {
  if (n === 0) return faNum(0);
  return `${n > 0 ? PLUS : MINUS}${compact(Math.abs(n))}`;
}

/** درصد: «۴۲٪»؛ با signedPct علامت هم می‌آید */
export function percent(ratio: number): string {
  return `${PERCENT.format(Math.round(ratio * PERCENT_SCALE))}٪`;
}

export function signedPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return "—";
  const body = percent(Math.abs(ratio));
  if (ratio === 0) return body;
  return `${ratio > 0 ? PLUS : MINUS}${body}`;
}
