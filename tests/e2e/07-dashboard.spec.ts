// پیشخوان شخصی‌سازی‌پذیر: پنهان کردن ویجت، جابه‌جایی با دکمه و با کشیدن، ماندگاری پس از بارگذاری دوباره و بازگشت به پیش‌فرض
import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const SAVE_WAIT_MS = 1_500;
const HALF = 0.5;
const DRAG_STEPS = 8;
const DEFAULT_HEAD = ["summary", "my-deadlines"];
const order = (page: Page) => page.locator("[data-widget]").evaluateAll((els) => els.map((e) => e.getAttribute("data-widget")));

test.describe.configure({ mode: "serial" });

test("کاربر ویجت‌ها را پنهان و جابه‌جا می‌کند و چیدمان پس از بارگذاری دوباره می‌ماند", async ({ page }) => {
  await login(page, "t.legal");
  await page.goto("/");
  const start = await order(page);
  expect(start.slice(0, DEFAULT_HEAD.length)).toEqual(DEFAULT_HEAD);

  await page.getByRole("button", { name: "شخصی‌سازی پیشخوان" }).click();
  await page.getByRole("button", { name: "پنهان کردن «اسناد اخیر»" }).click();
  await page.getByRole("button", { name: "جابه‌جایی «وظایف من» به جلو" }).click();
  const moved = await order(page);
  expect(moved.indexOf("my-tasks")).toBe(start.indexOf("my-tasks") - 1);

  // کشیدن «شمارش معکوس مهلت‌ها» روی «خلاصه کار من» (هر دو در دید)
  const handle = page.getByRole("button", { name: "کشیدن «شمارش معکوس مهلت‌ها»" });
  await page.evaluate(() => window.scrollTo(0, 0));
  const target = page.locator('[data-widget="summary"]');
  const h = await handle.boundingBox();
  const t = await target.boundingBox();
  if (!h || !t) throw new Error("widget not laid out");
  await page.mouse.move(h.x + h.width * HALF, h.y + h.height * HALF);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width * HALF, t.y + t.height * HALF, { steps: DRAG_STEPS });
  await page.mouse.up();
  expect((await order(page))[0]).toBe("deadline-rings");

  await page.waitForTimeout(SAVE_WAIT_MS);
  await page.getByRole("button", { name: "پایان شخصی‌سازی" }).click();
  await page.reload();
  const saved = await order(page);
  expect(saved[0]).toBe("deadline-rings");
  expect(saved).not.toContain("recent-docs");
  await expect(page.getByText("۱ ویجت پنهان")).toBeVisible();
});

test("بازگشت به چیدمان پیش‌فرض", async ({ page }) => {
  await login(page, "t.legal");
  await page.goto("/");
  await page.getByRole("button", { name: "شخصی‌سازی پیشخوان" }).click();
  await page.getByRole("button", { name: "چیدمان پیش‌فرض" }).click();
  await expect(page.getByRole("status").getByText("چیدمان پیش‌فرض بازگردانده شد.")).toBeVisible();
  await page.getByRole("button", { name: "پایان شخصی‌سازی" }).click();
  await page.reload();
  const list = await order(page);
  expect(list.slice(0, DEFAULT_HEAD.length)).toEqual(DEFAULT_HEAD);
  expect(list).toContain("recent-docs");
});
