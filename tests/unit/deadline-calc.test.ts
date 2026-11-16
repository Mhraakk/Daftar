import { describe, expect, it } from "vitest";
import { parseJalaliDateOnly, formatDateOnly } from "@/lib/jalali";
import { computeLegalDeadline, extractJalaliDates } from "@/server/deadline-calc";

const d = (s: string) => parseJalaliDateOnly(s)!;
const none = new Map<string, string>();

describe("محاسبه پیشنهادی موعد قانونی", () => {
  it("۲۰ روز از روز پس از ابلاغ", () => {
    // ابلاغ شنبه ۱۴۰۵/۰۲/۰۵ → روز بیستم: جمعه ۰۲/۲۵ → انتقال به شنبه ۰۲/۲۶
    const r = computeLegalDeadline(d("1405/02/05"), { days: 20 }, none);
    expect(formatDateOnly(r.lastDay)).toBe("۱۴۰۵/۰۲/۲۶");
    expect(r.shiftedForHoliday).toBe(true);
    expect(r.shiftReasons).toEqual(["جمعه"]);
  });
  it("بدون تعطیلی، جابه‌جایی ندارد", () => {
    const r = computeLegalDeadline(d("1405/02/06"), { days: 20 }, none); // → یکشنبه ۰۲/۲۶ + ۱ = شنبه؟ بررسی صریح
    expect(formatDateOnly(r.lastDay)).toBe("۱۴۰۵/۰۲/۲۶");
    expect(r.shiftedForHoliday).toBe(false);
  });
  it("تعطیلی رسمی پیاپی و جمعه را رد می‌کند", () => {
    const hol = new Map([[d("1405/02/26").toISOString().slice(0, 10), "تعطیل آزمایشی"], [d("1405/02/27").toISOString().slice(0, 10), "تعطیل آزمایشی ۲"]]);
    const r = computeLegalDeadline(d("1405/02/05"), { days: 20 }, hol);
    expect(formatDateOnly(r.lastDay)).toBe("۱۴۰۵/۰۲/۲۸");
    expect(r.shiftReasons).toHaveLength(3);
  });
  it("مدت ماهانه بر پایه ماه شمسی و تنظیم پایان ماه", () => {
    expect(formatDateOnly(computeLegalDeadline(d("1405/06/31"), { months: 2 }, none).lastDay)).toMatch(/^۱۴۰۵\/۰۹\/۰[۱۲]$|^۱۴۰۵\/۰۸\/۳۰$/);
    const r = computeLegalDeadline(d("1405/11/10"), { months: 2 }, none);
    expect(formatDateOnly(r.lastDay).startsWith("۱۴۰۶/۰۱/۱")).toBe(true); // عبور از سال
  });
  it("همیشه یادآوری تأیید انسانی دارد", () => {
    expect(computeLegalDeadline(d("1405/02/05"), { days: 10 }, none).explanation.at(-1)).toContain("تأیید");
  });
});

describe("استخراج تاریخ از متن سند", () => {
  it("قالب عددی، ارقام فارسی و نام ماه", () => {
    const text = "وقت رسیدگی به تاریخ ۱۴۰۵/۰۹/۱۲ ساعت ۱۰ تعیین شد. تاریخ ابلاغ: 1405/08/20 و مهلت تا ۵ آذر ۱۴۰۵ است. کد 12/45/99 تاریخ نیست.";
    const r = extractJalaliDates(text);
    expect(r.map((x) => `${x.jy}/${x.jm}/${x.jd}`)).toEqual(["1405/9/12", "1405/8/20", "1405/9/5"]);
    expect(r[0].hint).toBe("HEARING");
    expect(r[1].hint).toBe("RESPONSE");
  });
  it("تاریخ نامعتبر و تکراری را حذف می‌کند", () => {
    expect(extractJalaliDates("1405/13/40 و 1405/01/01 و ۱۴۰۵/۰۱/۰۱")).toHaveLength(1);
  });
});
