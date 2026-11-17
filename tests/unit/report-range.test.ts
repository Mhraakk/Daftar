/* eslint-disable ts-patterns/no-magic-numbers -- fixtures use literal Jalali dates and counts */
// بازه گزارش: دوره دلخواه شمسی (روز پایان شمرده می‌شود)، دوره‌های پیش‌ساخته، دوره هم‌طول قبل و دوره‌های هفتگی شنبه‌آغاز
import { describe, expect, it } from "vitest";
import { countBy, rangePeriods } from "@/lib/chart/time";
import { addDays, formatJalali, fromJalali, jParts } from "@/lib/jalali";
import { previousRange, resolveRange } from "@/server/reports";

const NOW = new Date("2026-11-17T08:00:00Z"); // سه‌شنبه ۲۶ آبان ۱۴۰۵
const DAY = 86_400_000;
const weekday = (d: Date) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Tehran" }).format(d);

describe("report ranges", () => {
  it("reads a custom Jalali range with the end day included", () => {
    const r = resolveRange({ from: "۱۴۰۵/۰۸/۰۱", to: "1405/08/10" }, NOW);
    expect(r.key).toBe("custom");
    expect(r.from).toEqual(fromJalali(1405, 8, 1));
    expect(r.to).toEqual(fromJalali(1405, 8, 11));
    expect(r.fromInput).toBe(formatJalali(fromJalali(1405, 8, 1), "date"));
    expect(r.toInput).toBe(formatJalali(fromJalali(1405, 8, 10), "date"));
  });

  it("falls back to the current month for an invalid or reversed custom range", () => {
    expect(resolveRange({ from: "1405/08/10", to: "1405/08/01" }, NOW).key).toBe("month");
    expect(resolveRange({ from: "nonsense", to: "1405/08/01" }, NOW).key).toBe("month");
    const m = resolveRange({}, NOW);
    expect(m.from).toEqual(fromJalali(1405, 8, 1));
    expect(jParts(addDays(m.to, -1)).jd).toBe(26);
  });

  it("builds the presets and an equal-length previous period", () => {
    const prev = resolveRange({ period: "prev" }, NOW);
    expect([prev.from, prev.to]).toEqual([fromJalali(1405, 7, 1), fromJalali(1405, 8, 1)]);
    expect(resolveRange({ period: "year" }, NOW).from).toEqual(fromJalali(1405, 1, 1));
    const ninety = resolveRange({ period: "90" }, NOW);
    expect(Math.round((ninety.to.getTime() - ninety.from.getTime()) / DAY)).toBe(90);
    const p = previousRange(ninety);
    expect(p.to).toEqual(ninety.from);
    expect(p.to.getTime() - p.from.getTime()).toBe(ninety.to.getTime() - ninety.from.getTime());
  });

  it("splits a range into Saturday-based weeks clipped to the range, and months for long ranges", () => {
    const r = resolveRange({ from: "1405/08/01", to: "1405/08/26" }, NOW);
    const weeks = rangePeriods("week", r.from, r.to);
    expect(weeks[0].start).toEqual(r.from);
    expect(weeks.at(-1)?.end).toEqual(r.to);
    expect(weeks.slice(1).map((w) => weekday(w.start))).toEqual(weeks.slice(1).map(() => "Sat"));
    expect(countBy(weeks, [r.from, addDays(r.from, 1), addDays(r.to, 2)]).reduce((a, b) => a + b, 0)).toBe(2);
    const months = rangePeriods("month", fromJalali(1405, 1, 1), fromJalali(1405, 9, 1));
    expect(months.map((m) => m.label)).toEqual(["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان"]);
  });
});
