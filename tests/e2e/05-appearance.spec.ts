// ظاهر سامانه: انتخاب پوسته و چیدمان در حساب کاربری بی‌درنگ اعمال می‌شود، پس از بارگذاری دوباره از سرور با همان
// ظاهر می‌آید (بدون پرش)، از فرمان‌یاب هم قابل تغییر است و صفحه ورود ظاهر پیش‌فرض دفتر را دارد.
import { expect, test, type Page } from "@playwright/test";
import { login, logout } from "./helpers";

/** آغاز HTML صفحه (برچسب <html> و <head>) که ظاهر سرور در آن است */
const HEAD_CHARS = 600;
// The layout attribute the server put on <html>: matches 'data-layout="dock"', rejects 'data-layout="grid"'.
// https://regex101.com/?regex=data-layout%3D%22%28sidebar%7Cdock%7Ccolumns%7Ccommand%29%22&testString=data-layout%3D%22dock%22&flavor=javascript
const LAYOUT_ATTR = /data-layout="(sidebar|dock|columns|command)"/;
// The skin attribute the server put on <html>: matches 'data-skin="paper"', rejects 'data-skin="neon"'.
// https://regex101.com/?regex=data-skin%3D%22%28glass%7Cgraphite%7Cpaper%7Cfiruze%29%22&testString=data-skin%3D%22paper%22&flavor=javascript
const SKIN_ATTR = /data-skin="(glass|graphite|paper|firuze)"/;
const htmlAttr = (page: Page, name: string) => page.locator("html").getAttribute(name);
const initialHtml = async (page: Page, path: string) => (await (await page.request.get(path)).text()).slice(0, HEAD_CHARS);

test("ظاهر انتخابی بی‌درنگ اعمال، ذخیره و بدون پرش بارگذاری می‌شود", async ({ page }) => {
  await login(page, "t.legal2");
  await page.goto("/account");
  const picker = page.getByRole("group").filter({ hasText: "پوسته" }).first();
  await expect(picker).toBeVisible();

  await page.getByRole("button", { name: "شب", exact: false }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-skin", "graphite");
  await page.getByRole("button", { name: "داک", exact: false }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-layout", "dock");
  await expect(page.getByRole("navigation", { name: "داک بخش‌ها" })).toBeVisible();

  // سرور همان ظاهر را در HTML اولیه می‌فرستد → بدون پرش
  await expect.poll(() => initialHtml(page, "/account")).toContain('data-skin="graphite"');
  expect(await initialHtml(page, "/account")).toContain('data-layout="dock"');
  await page.reload();
  expect(await htmlAttr(page, "data-skin")).toBe("graphite");

  // فرمان‌یاب با Ctrl+K (کد فیزیکی کلید) و نوشتن نام پوسته
  await page.keyboard.press("Control+KeyK");
  const input = page.getByRole("combobox", { name: "جست‌وجو یا فرمان" });
  await expect(input).toBeVisible();
  await input.fill("پوسته کاغذ");
  await input.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-skin", "paper");

  // بازگشت به پیش‌فرض دفتر
  await page.goto("/account");
  await page.getByRole("button", { name: "پیش‌فرض دفتر" }).first().click();
  await page.getByRole("button", { name: "پیش‌فرض دفتر" }).first().click();
  await expect.poll(() => initialHtml(page, "/account")).not.toContain('data-skin="paper"');
});

test("صفحه ورود ظاهر پیش‌فرض دفتر را دارد", async ({ page }) => {
  await login(page, "t.legal2");
  await logout(page);
  const html = await initialHtml(page, "/login");
  expect(html).toMatch(LAYOUT_ATTR);
  expect(html).toMatch(SKIN_ATTR);
});
