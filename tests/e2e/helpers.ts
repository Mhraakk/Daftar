import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.DEMO_PASSWORD ?? "Test@12345";

export async function login(page: Page, username: string, password = PASSWORD) {
  await page.goto("/login");
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "منوی کاربر" }).click();
  await page.getByText("خروج از سامانه").click();
  await page.waitForURL("**/login");
}

/** انتخاب از انتخابگر جست‌وجوپذیر (Lookup) */
export async function pick(page: Page, label: string, query: string, scope = page.locator("body")) {
  await scope.getByLabel(label, { exact: true }).click();
  const pop = page.locator("[data-radix-popper-content-wrapper]").last();
  await pop.getByPlaceholder("جست‌وجو…").fill(query);
  await pop.getByRole("option").filter({ hasText: query }).first().click();
}

/** کد ملی معتبر تصادفی (با رقم کنترل صحیح) */
export function nationalId(): string {
  for (;;) {
    const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
    if (new Set(d).size < 3) continue;
    const sum = d.reduce((a, x, i) => a + x * (10 - i), 0);
    const r = sum % 11;
    return d.join("") + String(r < 2 ? r : 11 - r);
  }
}

export async function toast(page: Page, text: string | RegExp) {
  await expect(page.getByRole("status").getByText(text).first()).toBeVisible();
}

export const uniq = () => Date.now().toString(36).slice(-6);
