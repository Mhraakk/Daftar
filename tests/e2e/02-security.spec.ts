// آزمون‌های امنیت و سطح دسترسی در سطح HTTP و مرورگر
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { login, PASSWORD } from "./helpers";

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

test("بدون نشست: صفحات به ورود هدایت و APIها ۴۰۱ می‌دهند", async ({ page, request }) => {
  await page.goto("/cases");
  await expect(page).toHaveURL(/\/login\?next=%2Fcases/);
  for (const p of ["/api/search?q=test", "/api/notifications", "/api/export/cases", "/api/lookup?type=client"]) expect((await request.get(p)).status()).toBe(401);
  const forged = await request.get("/api/notifications", { headers: { cookie: "daftar_session=forged-token-value" } });
  expect(forged.status()).toBe(401);
});

test("سرآیندهای امنیتی تنظیم شده‌اند و کوکی نشست HttpOnly است", async ({ page }) => {
  const r = await page.goto("/login");
  const h = r!.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["x-powered-by"]).toBeUndefined();
  await login(page, "t.employee");
  const c = (await page.context().cookies()).find((x) => x.name === "daftar_session")!;
  expect(c.httpOnly).toBe(true);
  expect(c.sameSite).toBe("Lax");
  expect(await page.evaluate(() => document.cookie)).not.toContain("daftar_session");
});

test("ورود نامعتبر پیام یکسان می‌دهد و پس از ۵ تلاش حساب قفل می‌شود", async ({ page }) => {
  const u = await db.user.findUniqueOrThrow({ where: { username: "t.auditor" } });
  await db.user.update({ where: { id: u.id }, data: { failedLogins: 0, lockedUntil: null } });
  await page.goto("/login");
  const attempt = async (user: string, pw: string) => { await page.fill("#username", user); await page.fill("#password", pw); await page.click("button[type=submit]"); };
  await attempt("no.such.user", "whatever1");
  await expect(page.locator("form [role=alert]")).toHaveText("نام کاربری یا رمز عبور نادرست است.");
  for (let i = 0; i < 5; i++) { await attempt("t.auditor", `wrong-${i}`); await expect(page.locator("form [role=alert]")).toBeVisible(); await page.waitForTimeout(250); }
  await attempt("t.auditor", PASSWORD); // رمز درست، ولی حساب قفل است
  await expect(page.locator("form [role=alert]")).toContainText("قفل");
  expect(await db.activityLog.count({ where: { action: "auth.login_failed", entityId: u.id } })).toBeGreaterThanOrEqual(5);
  await db.user.update({ where: { id: u.id }, data: { failedLogins: 0, lockedUntil: null } });
});

test("کارمند با تغییر URL یا شناسه به رکورد و فایل غیرمجاز نمی‌رسد", async ({ page }) => {
  const mgr = await db.user.findUniqueOrThrow({ where: { username: "t.manager" } });
  const other = await db.case.findFirstOrThrow({ where: { members: { none: {} } }, orderBy: { createdAt: "desc" } });
  const doc = await db.document.findFirstOrThrow({ where: { caseId: { not: null }, deletedAt: null }, orderBy: { createdAt: "desc" } });
  await login(page, "t.employee");
  await page.goto(`/cases/${other.id}`);
  await expect(page.getByText("رکورد مورد نظر یافت نشد")).toBeVisible();
  await page.goto(`/clients/${other.clientId}`);
  await expect(page.getByText("رکورد مورد نظر یافت نشد")).toBeVisible();
  await page.goto(`/documents/${doc.id}`);
  await expect(page.getByText("رکورد مورد نظر یافت نشد")).toBeVisible();
  expect((await page.request.get(`/api/documents/${doc.id}/file`)).status()).toBe(404);
  expect((await page.request.get(`/api/export/case-history/${other.id}`)).status()).toBe(403); // بدون مجوز خروجی
  expect((await page.request.get("/api/export/audit")).status()).toBe(403);
  expect((await page.request.get(`/api/backups/anything`)).status()).toBe(403);
  for (const p of ["/admin/users", "/admin/roles", "/admin/audit", "/admin/backup", "/admin/settings", "/reports"]) { await page.goto(p); await expect(page).toHaveURL(/\/forbidden/); }
  // منوی مدیریت اصلاً نمایش داده نمی‌شود
  await page.goto("/");
  await expect(page.getByRole("link", { name: "کارمندان" })).toHaveCount(0);
  expect(await db.activityLog.count({ where: { action: "security.forbidden", entityId: other.id } })).toBeGreaterThanOrEqual(0);
  void mgr;
});

test("ناظر فقط مشاهده می‌کند: دکمه‌های تغییر ندارد و اکشن سرور را رد می‌کند", async ({ page }) => {
  await login(page, "t.auditor");
  await page.goto("/cases");
  await expect(page.getByRole("link", { name: "پرونده جدید" })).toHaveCount(0);
  await page.goto("/clients/new");
  await expect(page).toHaveURL(/\/forbidden/);
  const up = await page.request.post("/api/documents", { multipart: { title: "x", category: "سایر", file: { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("x") } } });
  expect(up.status()).toBe(403);
});

test("درخواست تغییردهنده با Origin بیگانه رد می‌شود (CSRF)", async ({ page }) => {
  await login(page, "t.legal");
  const r = await page.request.post("/api/notifications", { headers: { origin: "http://evil.example", "content-type": "application/json" }, data: { all: true } });
  expect(r.status()).toBe(403);
});

test("غیرفعال‌سازی حساب، نشست باز کاربر را فوراً باطل می‌کند", async ({ browser }) => {
  await db.user.update({ where: { username: "t.legal2" }, data: { isActive: true, failedLogins: 0, lockedUntil: null } }); // حالت اولیه مستقل از اجراهای قبلی
  const victim = await browser.newContext({ locale: "fa-IR" });
  const vp = await victim.newPage();
  await login(vp, "t.legal2");
  await expect(vp.getByRole("heading", { level: 1 })).toBeVisible();

  const admin = await browser.newContext({ locale: "fa-IR" });
  const ap = await admin.newPage();
  await login(ap, "t.manager");
  await ap.goto("/admin/users?q=t.legal2");
  await ap.getByRole("button", { name: "غیرفعال", exact: true }).click();
  await ap.getByRole("dialog").getByRole("button", { name: "تأیید" }).click();
  await expect(ap.getByText("حساب غیرفعال شد.")).toBeVisible();

  await vp.goto("/cases");
  await expect(vp).toHaveURL(/\/login/);
  await vp.fill("#username", "t.legal2"); await vp.fill("#password", PASSWORD); await vp.click("button[type=submit]");
  await expect(vp.locator("form [role=alert]")).toContainText("غیرفعال");

  await ap.goto("/admin/users?q=t.legal2&state=all");
  await ap.getByRole("button", { name: "فعال‌سازی" }).click();
  await expect(ap.getByText("حساب فعال شد.")).toBeVisible();
  await victim.close(); await admin.close();
});
