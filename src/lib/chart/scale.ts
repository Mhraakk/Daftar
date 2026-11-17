// مقیاس‌های ساده نمودار (بدون وابستگی): خطی با تیک‌های «گرد» ۱-۲-۵، باند برای ستون‌ها و دسته‌ها، و جهت محور زمان.
// در راست‌به‌چپ نخستین دوره در سمت راست است (Apple HIG: پیشرفت در جهت خواندن)، مگر دفتر چپ‌به‌راست را برگزیند.

const BASE = 10;
const STEP_TWO = 2;
const STEP_FIVE = 5;
const NICE_STEPS = [1, STEP_TWO, STEP_FIVE, BASE];
const DEFAULT_TICKS = 4;
/** سهم نشانه از عرض باند (بقیه فضای خالی میان ستون‌ها) */
const MARK_SHARE = 0.62;
const HALF = 2;

/** گام «گرد» نزدیک به span/count از خانواده ۱، ۲، ۵ × ۱۰ⁿ */
export function niceStep(span: number, count = DEFAULT_TICKS): number {
  if (span <= 0) return 1;
  const raw = span / count;
  const magnitude = BASE ** Math.floor(Math.log10(raw));
  const step = NICE_STEPS.find((s) => s * magnitude >= raw) ?? BASE;
  return step * magnitude;
}

export interface LinearScale { (v: number): number; ticks: number[]; max: number; min: number }

/** مقیاس خطی از min تا بیشینه گردشده (همیشه شامل صفر) به بازه [r0, r1] */
export function linear(values: number[], r0: number, r1: number, count = DEFAULT_TICKS): LinearScale {
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const step = niceStep(hi - lo || 1, count);
  const max = Math.ceil(hi / step) * step || step;
  const min = Math.floor(lo / step) * step;
  const span = max - min || 1;
  const scale = ((v: number) => r0 + ((v - min) / span) * (r1 - r0)) as LinearScale;
  scale.ticks = Array.from({ length: Math.round(span / step) + 1 }, (_, i) => min + i * step);
  scale.max = max;
  scale.min = min;
  return scale;
}

export interface Band { start: number; size: number; center: number; slot: number }

/**
 * جایگاه n باند در طول length؛ ضخامت هر نشانه حداکثر maxSize (۲۴px) و باقی‌مانده فضای خالی است.
 * reverse=true یعنی نخستین باند در انتهای محور (سمت راست در راست‌به‌چپ).
 */
export function bands(n: number, length: number, maxSize: number, reverse: boolean): Band[] {
  const slot = n > 0 ? length / n : length;
  const size = Math.min(maxSize, slot * MARK_SHARE);
  return Array.from({ length: n }, (_, i) => {
    const k = reverse ? n - 1 - i : i;
    const center = k * slot + slot / HALF;
    return { start: center - size / HALF, size, center, slot };
  });
}

export type AxisDir = "rtl" | "ltr";
export const isReversed = (dir: AxisDir): boolean => dir === "rtl";
