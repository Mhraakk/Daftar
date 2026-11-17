// هر عملیاتی که در تاریخچه فعالیت‌ها ثبت می‌شود باید برچسب فارسی داشته باشد (وگرنه کلید خام به کاربر نشان داده می‌شود)
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_LABELS } from "@/lib/labels";

const SOURCE_EXT = [".ts", ".tsx"];
/** اگر الگوها کمتر از این تعداد عملیات بیابند، خود آزمون خراب است */
const MIN_EXPECTED_ACTIONS = 50;
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const p = path.join(dir, name);
  if (statSync(p).isDirectory()) return files(p);
  return SOURCE_EXT.includes(path.extname(p)) ? [p] : [];
});

// The value of an `action:` property: matches `action: "draft.saved"` and `action: ok ? "law.verified" : "law.unverified"`, rejects `perm: "draft.create"`.
// https://regex101.com/?regex=action%3A%20(%5B%5E%2C%7D%5Cn%5D%2B)&testString=action%3A%20ok%20%3F%20%22law.verified%22%20%3A%20%22law.unverified%22&flavor=javascript
const ACTION_PROP = /action: ([^,}\n]+)/g;
// A lookup table of actions: matches `STATUS_ACTIONS: Record<K, string> = { A: "x.y" }`, rejects `const LABELS = { a: "x.y" }`.
// https://regex101.com/?regex=ACTIONS%3A%20Record%3C%5B%5E%3D%5D%2B%3D%20%5C%7B(%5B%5E%7D%5D%2B)%5C%7D&testString=STATUS_ACTIONS%3A%20Record%3CK%2C%20string%3E%20%3D%20%7B%20A%3A%20%22x.y%22%20%7D&flavor=javascript
const ACTION_MAP = /ACTIONS: Record<[^=]+= \{([^}]+)\}/g;
// A dotted action key: matches "draft.saved", rejects "draft" and "Draft.Saved".
// https://regex101.com/?regex=%22(%5Ba-z_%5D%2B%5C.%5Ba-z_.%5D%2B)%22&testString=%22draft.saved%22&flavor=javascript
const DOTTED = /"([a-z_]+\.[a-z_.]+)"/g;

const keysIn = (fragment: string): string[] => [...fragment.matchAll(DOTTED)].map((m) => m[1]);

describe("audit action labels", () => {
  it("labels every action the code writes to the activity log", () => {
    const sources = files("src").map((f) => readFileSync(f, "utf8"));
    const used = [...new Set(sources.flatMap((src) => [...src.matchAll(ACTION_PROP), ...src.matchAll(ACTION_MAP)].flatMap((m) => keysIn(m[1]))))];
    expect(used.length).toBeGreaterThan(MIN_EXPECTED_ACTIONS);
    expect(used.filter((a) => !(a in ACTION_LABELS))).toEqual([]);
  });
});
