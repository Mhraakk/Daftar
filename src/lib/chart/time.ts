// دوره‌های زمانی جلالی برای نمودار: روز، هفته (شنبه تا جمعه، به وقت تهران) و ماه، با برچسب فارسی.
import { addDays, fromJalali, jParts, J_MONTHS, startOfTehranDay, TEHRAN_OFFSET_MIN } from "@/lib/jalali";
import { toFaDigits } from "@/lib/text";

export type Bucket = "day" | "week" | "month";
export interface Period { start: Date; end: Date; label: string; long: string }

const DAYS_IN_WEEK = 7;
const SATURDAY = 6;
const MONTHS_IN_YEAR = 12;
const MS_PER_MINUTE = 60_000;
/** نیمه‌شب تهران به UTC جابه‌جا می‌شود؛ برای خواندن روز هفته آن را به همان روز تقویمی برمی‌گردانیم */
const TEHRAN_SHIFT_MS = TEHRAN_OFFSET_MIN * MS_PER_MINUTE;

/** آغاز هفته جلالی (شنبه) برای یک لحظه، به وقت تهران */
export function startOfJalaliWeek(d: Date): Date {
  const day = startOfTehranDay(d);
  const weekday = new Date(day.getTime() + TEHRAN_SHIFT_MS).getUTCDay();
  const back = (weekday - SATURDAY + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  return addDays(day, -back);
}
export function startOfJalaliMonth(d: Date): Date {
  const p = jParts(d);
  return fromJalali(p.jy, p.jm, 1);
}

function nextMonth(d: Date): Date {
  const p = jParts(d);
  return p.jm === MONTHS_IN_YEAR ? fromJalali(p.jy + 1, 1, 1) : fromJalali(p.jy, p.jm + 1, 1);
}

const monthName = (d: Date): string => J_MONTHS[jParts(d).jm - 1];
const dayMonth = (d: Date): string => `${toFaDigits(jParts(d).jd)} ${monthName(d)}`;

const LABELS: Record<Bucket, (start: Date) => { label: string; long: string }> = {
  day: (s) => ({ label: toFaDigits(jParts(s).jd), long: `${dayMonth(s)} ${toFaDigits(jParts(s).jy)}` }),
  week: (s) => ({ label: dayMonth(s), long: `هفته ${dayMonth(s)} تا ${dayMonth(addDays(s, DAYS_IN_WEEK - 1))}` }),
  month: (s) => ({ label: monthName(s), long: `${monthName(s)} ${toFaDigits(jParts(s).jy)}` }),
};

const STEP: Record<Bucket, (d: Date) => Date> = {
  day: (d) => addDays(d, 1),
  week: (d) => addDays(d, DAYS_IN_WEEK),
  month: nextMonth,
};

const START: Record<Bucket, (d: Date) => Date> = {
  day: startOfTehranDay,
  week: startOfJalaliWeek,
  month: startOfJalaliMonth,
};

/** count دوره پیاپی که آخرینِ آن‌ها دوره شامل «now» است (قدیمی‌ترین نخست) */
export function periods(bucket: Bucket, count: number, now = new Date()): Period[] {
  const last = START[bucket](now);
  const first = Array.from({ length: count - 1 }).reduce<Date>((d) => START[bucket](new Date(d.getTime() - 1)), last);
  return Array.from({ length: count }).reduce<Period[]>((acc) => {
    const start = acc.length ? acc[acc.length - 1].end : first;
    const end = STEP[bucket](start);
    return [...acc, { start, end, ...LABELS[bucket](start) }];
  }, []);
}

/** شماره دوره‌ای که لحظه t در آن است (یا -1) */
export function periodIndex(list: Period[], t: Date): number {
  return list.findIndex((p) => t >= p.start && t < p.end);
}

/** شمار رویدادها در هر دوره */
export function countBy(list: Period[], dates: Date[]): number[] {
  return dates.reduce((acc, d) => {
    const i = periodIndex(list, d);
    return i < 0 ? acc : acc.map((n, k) => (k === i ? n + 1 : n));
  }, list.map(() => 0));
}

/** آغاز دوره‌های پیاپی از نخستین دوره شامل from تا پیش از to (بازگشتی؛ بیشینه چند ده دوره) */
function startsUntil(bucket: Bucket, cur: Date, to: Date): Date[] {
  return cur >= to ? [] : [cur, ...startsUntil(bucket, STEP[bucket](cur), to)];
}

/** دوره‌های پوشاننده بازه [from, to): نخستین و آخرین دوره به لبه بازه بریده می‌شوند تا شمارش بیرون از بازه را نگیرد */
export function rangePeriods(bucket: Bucket, from: Date, to: Date): Period[] {
  return startsUntil(bucket, START[bucket](from), to).map((s) => {
    const end = STEP[bucket](s);
    return { start: s < from ? from : s, end: end > to ? to : end, ...LABELS[bucket](s) };
  });
}
