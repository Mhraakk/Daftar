// مرتب‌سازی جدول از نشانی: فقط کلیدهای مجاز، جابه‌جایی جهت، حفظ پالایه‌ها و بازگشت به صفحه ۱
import { describe, expect, it } from "vitest";
import { ariaSort, sortFrom, sortHref } from "@/lib/table-sort";

const KEYS = ["number", "title", "updatedAt"] as const;
const FALLBACK = { key: "updatedAt", dir: "desc" as const };

describe("table sort from the URL", () => {
  it("accepts only whitelisted keys and directions", () => {
    expect(sortFrom({ sort: "title", dir: "desc" }, KEYS, FALLBACK)).toEqual({ key: "title", dir: "desc" });
    expect(sortFrom({ sort: "passwordHash", dir: "asc" }, KEYS, FALLBACK)).toEqual(FALLBACK);
    expect(sortFrom({ sort: "title", dir: "sideways" }, KEYS, FALLBACK)).toEqual({ key: "title", dir: "asc" });
    expect(sortFrom({}, KEYS, FALLBACK)).toEqual(FALLBACK);
  });

  it("toggles the current column, starts others at their first direction, keeps filters and resets the page", () => {
    const current = { key: "title", dir: "asc" as const };
    expect(sortHref("/cases", { q: "چک", page: "3" }, "title", current)).toBe(`/cases?q=${encodeURIComponent("چک")}&sort=title&dir=desc`);
    expect(sortHref("/cases", { q: undefined }, "updatedAt", current, "desc")).toBe("/cases?sort=updatedAt&dir=desc");
  });

  it("exposes aria-sort for the active column only", () => {
    expect(ariaSort("title", { key: "title", dir: "desc" })).toBe("descending");
    expect(ariaSort("number", { key: "title", dir: "desc" })).toBe("none");
  });
});
