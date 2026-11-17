// چیدمان پیشخوان: ادغام ترتیب ذخیره‌شده با ویجت‌های در دسترس، جابه‌جایی با کشیدن و با دکمه
import { describe, expect, it } from "vitest";
import { arrange, moveTo, shift, WIDGET_IDS, type WidgetId } from "@/lib/dashboard-widgets";

const personal: WidgetId[] = ["summary", "my-deadlines", "deadline-rings", "events", "activity"];

describe("dashboard layout", () => {
  it("keeps the saved order, drops unknown or unavailable widgets and slots new ones before their default successor", () => {
    const r = arrange(personal, { order: ["events", "bogus", "summary", "workload"], hidden: ["activity", "workload", "nope"] });
    // ویجت تازه پیش از نزدیک‌ترین ویجتی می‌آید که در ترتیب پیش‌فرض پس از آن است
    expect(r.order).toEqual(["my-deadlines", "deadline-rings", "events", "summary", "activity"]);
    expect(r.hidden).toEqual(["activity"]);
    expect(arrange(personal)).toEqual({ order: personal, hidden: [] });
  });

  it("moves a dragged widget to the target's place, before it when moving up and after it when moving down", () => {
    expect(moveTo(personal, "events", "summary")).toEqual(["events", "summary", "my-deadlines", "deadline-rings", "activity"]);
    expect(moveTo(personal, "summary", "events")).toEqual(["my-deadlines", "deadline-rings", "events", "summary", "activity"]);
    expect(moveTo(personal, "summary", "summary")).toEqual(personal);
  });

  it("shifts one step with the keyboard buttons and stops at the ends", () => {
    expect(shift(personal, "deadline-rings", -1)).toEqual(["summary", "deadline-rings", "my-deadlines", "events", "activity"]);
    expect(shift(personal, "deadline-rings", 1)).toEqual(["summary", "my-deadlines", "events", "deadline-rings", "activity"]);
    expect(shift(personal, "summary", -1)).toEqual(personal);
    expect(shift(personal, "activity", 1)).toEqual(personal);
  });

  it("declares every widget once", () => {
    expect(new Set(WIDGET_IDS).size).toBe(WIDGET_IDS.length);
  });
});
