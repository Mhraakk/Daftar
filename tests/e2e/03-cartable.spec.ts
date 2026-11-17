// کارتابل: ثبت نامه وارده، ارجاع، بازگشت، اتمام اقدام و بایگانی + پیام داخلی
import { expect, test } from "@playwright/test";
import { login, pick, toast, uniq } from "./helpers";

const tag = uniq();
const subject = `استعلام ثبتی ${tag}`;
let url = "";
test.describe.configure({ mode: "serial" });

test("ثبت نامه وارده و ارجاع به کارمند", async ({ page }) => {
  await login(page, "t.manager");
  await page.goto("/cartable/new");
  await page.getByLabel("موضوع").fill(subject);
  await page.getByLabel("فرستنده / گیرنده بیرونی").fill("اداره ثبت اسناد");
  await page.getByLabel("شماره نامه").fill("۱۴۰۵/۱۲۳۴");
  await pick(page, "ارجاع به", "علی رضایی");
  await page.getByLabel("دستور ارجاع").fill("جهت بررسی و پاسخ");
  await page.getByRole("button", { name: "ثبت مکاتبه" }).click();
  await page.waitForURL(/\/cartable\/c[a-z0-9]+$/);
  url = new URL(page.url()).pathname;
  await expect(page.locator(".mono-code").first()).toHaveText(/^V-14\d\d-\d{5}$/);
  await expect(page.getByText("در گردش").first()).toBeVisible();
  await page.goto("/cartable?box=followup");
  await expect(page.getByRole("link", { name: subject })).toBeVisible();
});

test("گیرنده در کارتابل می‌بیند، بدون توضیح نمی‌تواند برگرداند، سپس برمی‌گرداند", async ({ page }) => {
  await login(page, "t.legal");
  await page.goto("/cartable");
  await expect(page.getByRole("link", { name: subject })).toBeVisible();
  await page.getByRole("link", { name: subject }).click();
  await expect(page.getByText("جهت بررسی و پاسخ").first()).toBeVisible();
  await page.getByRole("button", { name: "بازگشت", exact: true }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByRole("button", { name: "بازگشت", exact: true })).toBeDisabled();
  await dlg.getByRole("textbox").fill("مدارک پیوست ناقص است.");
  await dlg.getByRole("button", { name: "بازگشت", exact: true }).click();
  await toast(page, "بازگشت داده شد.");
  await expect(page.getByRole("button", { name: "اتمام اقدام" })).toHaveCount(0); // دیگر دارنده نیست
});

test("ارجاع‌دهنده بازگشتی را می‌بیند، اقدام را تمام و بایگانی می‌کند", async ({ page }) => {
  await login(page, "t.manager");
  await page.goto("/cartable?box=returned");
  await page.getByRole("link", { name: subject }).click();
  await expect(page.getByText("مدارک پیوست ناقص است.").first()).toBeVisible();
  await page.getByRole("button", { name: "اتمام اقدام" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("textbox").fill("پاسخ استعلام ارسال شد.");
  await dlg.getByRole("button", { name: "ثبت اتمام" }).click();
  await toast(page, "اقدام ثبت شد.");
  await page.getByRole("button", { name: "بایگانی" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "تأیید" }).click();
  await toast(page, "بایگانی شد.");
  await page.goto("/cartable?box=archive");
  await expect(page.getByRole("link", { name: subject })).toBeVisible();
  await page.goto(url);
  for (const ev of ["ثبت مکاتبه", "ارجاع مکاتبه", "بازگشت مکاتبه", "اتمام اقدام مکاتبه", "بایگانی مکاتبه"]) await expect(page.getByText(ev, { exact: true }).first()).toBeVisible();
});

test("پیام داخلی ارسال، خوانده و وضعیت خوانده‌شدن ثبت می‌شود", async ({ page }) => {
  const s = `هماهنگی جلسه ${tag}`;
  const body = `جلسه فردا ساعت ۱۰ برگزار می‌شود (${tag}).`;
  await login(page, "t.manager");
  await page.goto("/messages/new");
  await page.getByLabel(/علی رضایی/).check();
  await page.getByLabel("موضوع").fill(s);
  await page.getByLabel("متن").fill(body);
  await page.getByRole("button", { name: "ارسال" }).click();
  await page.waitForURL(/box=sent/);
  await expect(page.getByText(s).first()).toBeVisible();
  await expect(page.getByText("خوانده‌شده ۰/۱").first()).toBeVisible();

  await page.context().clearCookies();
  await login(page, "t.legal");
  await page.goto("/messages");
  await page.getByText(s).first().click();
  await page.waitForURL(/\/messages\/c[a-z0-9]+/);
  await expect(page.locator("main").getByText(body, { exact: true })).toBeVisible();
  await page.context().clearCookies();
  await login(page, "t.manager");
  await page.goto("/messages?box=sent");
  await expect(page.getByText("خوانده‌شده ۱/۱").first()).toBeVisible();
});
