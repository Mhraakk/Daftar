import { describe, expect, it } from "vitest";
import { diffTehranDays, formatDateOnly, formatJalali, fromJalali, jParts, monthMatrix, parseJalali, parseJalaliDateOnly, relativeDay, shiftMonth } from "@/lib/jalali";

describe("تقویم شمسی و منطقه زمانی تهران", () => {
  it("تبدیل شمسی ↔ میلادی در تاریخ‌های مرجع", () => {
    // ۱ فروردین ۱۴۰۴ = 21 مارس 2025 ؛ ۱ فروردین ۱۴۰۳ (کبیسه میلادی) = 20 مارس 2024
    expect(fromJalali(1404, 1, 1).toISOString()).toBe("2025-03-20T20:30:00.000Z");
    expect(fromJalali(1403, 1, 1).toISOString()).toBe("2024-03-19T20:30:00.000Z");
    expect(jParts(new Date("2025-03-20T20:30:00Z"))).toMatchObject({ jy: 1404, jm: 1, jd: 1, hour: 0, minute: 0 });
  });
  it("مرز روز بر پایه تهران است نه UTC", () => {
    expect(jParts(new Date("2025-03-20T20:29:00Z"))).toMatchObject({ jy: 1403, jm: 12, jd: 30 }); // ۱۴۰۳ کبیسه است
    expect(jParts(new Date("2025-03-20T20:30:00Z")).jd).toBe(1);
  });
  it("روز هفته: شنبه=۰ … جمعه=۶", () => {
    expect(jParts(new Date("2025-03-21T08:00:00Z")).weekday).toBe(6); // جمعه ۱ فروردین ۱۴۰۴
    expect(jParts(new Date("2025-03-22T08:00:00Z")).weekday).toBe(0);
  });
  it("پارس ورودی با ارقام فارسی و رد تاریخ نامعتبر", () => {
    expect(parseJalali("۱۴۰۴/۰۱/۰۱", "۰۹:۳۰")?.toISOString()).toBe("2025-03-21T06:00:00.000Z");
    expect(parseJalali("1404/12/30")).toBeNull(); // ۱۴۰۴ کبیسه نیست
    expect(parseJalali("1403/12/30")).not.toBeNull();
    expect(parseJalali("1404/13/01")).toBeNull();
    expect(parseJalali("1404/01/01", "25:00")).toBeNull();
    expect(parseJalali("not a date")).toBeNull();
  });
  it("رفت‌وبرگشت تاریخ بدون ساعت", () => {
    const d = parseJalaliDateOnly("1380/11/22")!;
    expect(d.toISOString()).toBe("2002-02-11T00:00:00.000Z");
    expect(formatDateOnly(d)).toBe("۱۳۸۰/۱۱/۲۲");
  });
  it("قالب‌بندی", () => {
    const d = fromJalali(1405, 8, 25, 14, 5);
    expect(formatJalali(d, "date")).toBe("۱۴۰۵/۰۸/۲۵");
    expect(formatJalali(d, "time")).toBe("۱۴:۰۵");
    expect(formatJalali(d, "input")).toBe("1405/08/25");
    expect(formatJalali(d, "long")).toContain("آبان ۱۴۰۵");
    expect(formatJalali(null)).toBe("—");
  });
  it("فاصله روزها و برچسب نسبی", () => {
    const a = fromJalali(1405, 1, 1, 23, 50), b = fromJalali(1405, 1, 2, 0, 10);
    expect(diffTehranDays(a, b)).toBe(1);
    expect(relativeDay(b, a)).toBe("فردا");
    expect(relativeDay(fromJalali(1404, 12, 28), a)).toBe("۲ روز پیش"); // اسفند ۱۴۰۴ بیست‌ونه‌روزه است
  });
  it("ماتریس ماه و جابه‌جایی ماه", () => {
    const m = monthMatrix(1404, 1); // ۱ فروردین ۱۴۰۴ جمعه است
    expect(m[0]).toEqual([null, null, null, null, null, null, 1]);
    expect(m.flat().filter(Boolean)).toHaveLength(31);
    expect(shiftMonth(1404, 12, 1)).toEqual({ jy: 1405, jm: 1 });
    expect(shiftMonth(1404, 1, -1)).toEqual({ jy: 1403, jm: 12 });
  });
});
