// محاسبه پیشنهادیِ موعد قانونی از تاریخ ابلاغ. خروجی همیشه «پیشنهاد» است و باید توسط کارمند مجاز تأیید شود.
import jalaali from "jalaali-js";
import { addDays, jParts } from "@/lib/jalali";

export interface LegalCalcResult {
  /** آخرین روز مهلت (نیمه‌شب UTC همان روز میلادی) */
  lastDay: Date;
  shiftedForHoliday: boolean;
  shiftReasons: string[];
  explanation: string[];
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * triggerDate: روز ابلاغ/اعلام (ستون DATE). days: مدت به روز.
 * قاعده محاسبه: روز ابلاغ جزء مدت نیست؛ اگر روز پایانی جمعه یا تعطیل رسمی ثبت‌شده باشد به نخستین روز کاری بعد منتقل می‌شود.
 * محاسبه محافظه‌کارانه است: «روز اقدام» به سود کاربر اضافه نمی‌شود تا موعد دیرتر از واقع نشان داده نشود.
 */
export function computeLegalDeadline(triggerDate: Date, period: { days: number } | { months: number }, holidays: Map<string, string>): LegalCalcResult {
  const explanation: string[] = [];
  let last: Date;
  if ("days" in period) {
    explanation.push(`روز ابلاغ در محاسبه لحاظ نشده و ${period.days} روز از روز بعد شمرده شده است.`);
    last = addDays(triggerDate, period.days);
  } else {
    // ماه شمسی: همان روز از ماهِ مقصد (در صورت نبودِ آن روز، آخرین روز ماه)
    const j = jalaali.toJalaali(triggerDate.getUTCFullYear(), triggerDate.getUTCMonth() + 1, triggerDate.getUTCDate());
    const idx = j.jy * 12 + (j.jm - 1) + period.months;
    const jy = Math.floor(idx / 12), jm = (idx % 12) + 1;
    const jd = Math.min(j.jd, jalaali.jalaaliMonthLength(jy, jm));
    const g = jalaali.toGregorian(jy, jm, jd);
    last = new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
    explanation.push(`مدت ${period.months} ماه بر پایه ماه شمسی از تاریخ ابلاغ محاسبه شده است.`);
  }
  const reasons: string[] = [];
  for (let i = 0; i < 30; i++) {
    // ظهر UTC همان روز تا تبدیل به تهران روز را جابه‌جا نکند
    const wd = jParts(new Date(last.getTime() + 12 * 3600_000 - 210 * 60_000)).weekday;
    const holiday = holidays.get(dayKey(last));
    if (wd === 6) reasons.push("جمعه");
    else if (holiday) reasons.push(`تعطیل رسمی: ${holiday}`);
    else break;
    last = addDays(last, 1);
  }
  if (reasons.length) explanation.push(`روز پایانی با تعطیلی (${reasons.join("، ")}) مصادف بود و به نخستین روز کاری بعد منتقل شد.`);
  explanation.push("این محاسبه پیشنهادی است؛ تعطیلات غیرمترقبه، نوع ابلاغ (واقعی/قانونی/الکترونیک) و اقامت خارج از کشور باید توسط کارمند مجاز بررسی و تأیید شود.");
  return { lastDay: last, shiftedForHoliday: reasons.length > 0, shiftReasons: reasons, explanation };
}

// ───────── استخراج تاریخ‌های شمسی از متن سند ─────────
import { J_MONTHS, isValidJalali } from "@/lib/jalali";
import { toEnDigits } from "@/lib/text";

export interface ExtractedDate { jy: number; jm: number; jd: number; raw: string; context: string; hint: string | null }

const HINTS: [RegExp, string][] = [
  [/جلسه|وقت رسیدگی|حضور/, "HEARING"], [/ابلاغ/, "RESPONSE"], [/تجدید ?نظر|فرجام/, "APPEAL"], [/واخواهی|اعتراض/, "OBJECTION"],
  [/مهلت|ظرف|موعد/, "FILING"], [/سررسید|پرداخت/, "FOLLOW_UP"],
];

export function extractJalaliDates(text: string, limit = 40): ExtractedDate[] {
  const out: ExtractedDate[] = [];
  const seen = new Set<string>();
  const src = toEnDigits(text);
  const push = (jy: number, jm: number, jd: number, raw: string, idx: number) => {
    if (jy < 100) jy += 1300 + (jy < 20 ? 100 : 0);
    if (jy < 1300 || jy > 1500 || !isValidJalali(jy, jm, jd)) return;
    const key = `${jy}-${jm}-${jd}`;
    if (seen.has(key)) return;
    seen.add(key);
    const context = src.slice(Math.max(0, idx - 70), Math.min(src.length, idx + raw.length + 50)).replace(/\s+/g, " ").trim();
    // برای برچسب پیشنهادی فقط واژه‌های نزدیک به خودِ تاریخ ملاک است
    const near = src.slice(Math.max(0, idx - 32), Math.min(src.length, idx + raw.length + 12));
    const hint = HINTS.find(([re]) => re.test(near))?.[1] ?? null;
    out.push({ jy, jm, jd, raw, context, hint });
  };
  for (const m of src.matchAll(/(?<!\d)(1[34]\d{2}|\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?!\d)/g)) {
    push(Number(m[1]), Number(m[2]), Number(m[3]), m[0], m.index ?? 0);
    if (out.length >= limit) return out;
  }
  const months = J_MONTHS.map((x) => x.replace("ی", "[یي]")).join("|");
  for (const m of src.matchAll(new RegExp(`(?<!\\d)(\\d{1,2})\\s*(?:ام\\s*)?(${months})(?:\\s*ماه)?\\s*(?:سال\\s*)?(1[34]\\d{2})`, "g"))) {
    const jm = J_MONTHS.findIndex((x) => new RegExp(`^${x.replace("ی", "[یي]")}$`).test(m[2])) + 1;
    push(Number(m[3]), jm, Number(m[1]), m[0], m.index ?? 0);
    if (out.length >= limit) return out;
  }
  return out;
}
