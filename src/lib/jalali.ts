// تقویم شمسی و منطقه زمانی تهران (UTC+03:30، بدون تغییر ساعت از ۱۴۰۱)
import jalaali from "jalaali-js";
import { toEnDigits, toFaDigits } from "./text";

export const TEHRAN_OFFSET_MIN = 210;
export const TZ = "Asia/Tehran";

export const J_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
// شنبه = 0
export const J_WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
export const J_WEEKDAYS_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

export interface JParts {
  jy: number; jm: number; jd: number;
  hour: number; minute: number;
  /** شنبه = 0 … جمعه = 6 */
  weekday: number;
}

/** اجزای تاریخ یک لحظه در تهران */
export function jParts(date: Date): JParts {
  const t = new Date(date.getTime() + TEHRAN_OFFSET_MIN * 60_000);
  const { jy, jm, jd } = jalaali.toJalaali(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  return {
    jy, jm, jd,
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
    weekday: (t.getUTCDay() + 1) % 7,
  };
}

/** ساخت لحظه از تاریخ شمسی و ساعت به وقت تهران */
export function fromJalali(jy: number, jm: number, jd: number, hour = 0, minute = 0): Date {
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  return new Date(Date.UTC(gy, gm - 1, gd, hour, minute) - TEHRAN_OFFSET_MIN * 60_000);
}

export function isValidJalali(jy: number, jm: number, jd: number): boolean {
  return jalaali.isValidJalaaliDate(jy, jm, jd);
}

export function jMonthLength(jy: number, jm: number): number {
  return jalaali.jalaaliMonthLength(jy, jm);
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** پارس ورودی مانند «۱۴۰۵/۰۸/۲۵» و ساعت اختیاری «۱۴:۳۰» */
export function parseJalali(dateStr: string, timeStr?: string | null): Date | null {
  const m = toEnDigits(dateStr.trim()).match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (!m) return null;
  const [jy, jm, jd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isValidJalali(jy, jm, jd)) return null;
  let h = 0, mi = 0;
  if (timeStr && timeStr.trim()) {
    const t = toEnDigits(timeStr.trim()).match(/^(\d{1,2}):(\d{2})$/);
    if (!t) return null;
    h = Number(t[1]); mi = Number(t[2]);
    if (h > 23 || mi > 59) return null;
  }
  return fromJalali(jy, jm, jd, h, mi);
}

/** تاریخ بدون ساعت (ستون‌های DATE) — نیمه‌شب UTC همان روز میلادی */
export function parseJalaliDateOnly(dateStr: string): Date | null {
  const m = toEnDigits(dateStr.trim()).match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (!m) return null;
  const [jy, jm, jd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isValidJalali(jy, jm, jd)) return null;
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  return new Date(Date.UTC(gy, gm - 1, gd));
}

export function formatDateOnly(date: Date | null | undefined): string {
  if (!date) return "—";
  const { jy, jm, jd } = jalaali.toJalaali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  return toFaDigits(`${jy}/${p2(jm)}/${p2(jd)}`);
}
export function dateOnlyInput(date: Date | null | undefined): string {
  if (!date) return "";
  const { jy, jm, jd } = jalaali.toJalaali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  return `${jy}/${p2(jm)}/${p2(jd)}`;
}

export type JFormat = "date" | "datetime" | "long" | "time" | "monthYear" | "input" | "inputTime";

export function formatJalali(date: Date | string | null | undefined, fmt: JFormat = "date"): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  const p = jParts(d);
  switch (fmt) {
    case "date": return toFaDigits(`${p.jy}/${p2(p.jm)}/${p2(p.jd)}`);
    case "time": return toFaDigits(`${p2(p.hour)}:${p2(p.minute)}`);
    case "datetime": return toFaDigits(`${p.jy}/${p2(p.jm)}/${p2(p.jd)} — ${p2(p.hour)}:${p2(p.minute)}`);
    case "long": return `${J_WEEKDAYS[p.weekday]} ${toFaDigits(p.jd)} ${J_MONTHS[p.jm - 1]} ${toFaDigits(p.jy)}`;
    case "monthYear": return `${J_MONTHS[p.jm - 1]} ${toFaDigits(p.jy)}`;
    case "input": return `${p.jy}/${p2(p.jm)}/${p2(p.jd)}`;
    case "inputTime": return `${p2(p.hour)}:${p2(p.minute)}`;
  }
}

/** ابتدای روز تهران برای یک لحظه */
export function startOfTehranDay(date: Date): Date {
  const p = jParts(date);
  return fromJalali(p.jy, p.jm, p.jd);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** تفاوت روزهای تقویمی تهران (b - a) */
export function diffTehranDays(a: Date, b: Date): number {
  return Math.round((startOfTehranDay(b).getTime() - startOfTehranDay(a).getTime()) / 86_400_000);
}

export function relativeDay(date: Date, now = new Date()): string {
  const d = diffTehranDays(now, date);
  if (d === 0) return "امروز";
  if (d === 1) return "فردا";
  if (d === -1) return "دیروز";
  if (d > 1) return `${toFaDigits(d)} روز دیگر`;
  return `${toFaDigits(-d)} روز پیش`;
}

export function relativeTime(date: Date, now = new Date()): string {
  const s = Math.round((now.getTime() - date.getTime()) / 1000);
  if (s < 60) return "لحظاتی پیش";
  if (s < 3600) return `${toFaDigits(Math.floor(s / 60))} دقیقه پیش`;
  if (s < 86400) return `${toFaDigits(Math.floor(s / 3600))} ساعت پیش`;
  if (s < 86400 * 7) return `${toFaDigits(Math.floor(s / 86400))} روز پیش`;
  return formatJalali(date, "date");
}

export function currentJalaliYear(now = new Date()): number {
  return jParts(now).jy;
}

/** ماتریس ماه برای نمای تقویم: هفته‌ها از شنبه؛ خانه‌های خالی null */
export function monthMatrix(jy: number, jm: number): (number | null)[][] {
  const first = fromJalali(jy, jm, 1);
  const lead = jParts(first).weekday;
  const len = jMonthLength(jy, jm);
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: len }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function shiftMonth(jy: number, jm: number, delta: number): { jy: number; jm: number } {
  const idx = jy * 12 + (jm - 1) + delta;
  return { jy: Math.floor(idx / 12), jm: (idx % 12) + 1 };
}
