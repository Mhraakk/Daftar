// سناریوی پذیرش اصلی MVP: از ثبت مراجعه‌کننده تا ایجاد پرونده، بارگذاری سند، ارجاع، انجام وظیفه، مهلت و بازیابی سوابق.
// همه گام‌ها روی برنامه واقعی و پایگاه داده واقعی اجرا می‌شوند.
import { expect, test } from "@playwright/test";
import { login, logout, nationalId, pick, toast, uniq } from "./helpers";

const tag = uniq();
const nid = nationalId();
const client = { first: "بهرام", last: `آزمون‌${tag}` };
const caseTitle = `مطالبه وجه چک ${tag}`;
const docMarker = `نشانگر-متن-سند-${tag}`;
let caseUrl = "";

test.describe.configure({ mode: "serial" });

test("۱. مسئول پذیرش مراجعه‌کننده را ثبت می‌کند و هشدار رکورد تکراری کار می‌کند", async ({ page }) => {
  await login(page, "t.intake");
  await page.goto("/clients/new");
  await page.getByLabel("نام", { exact: true }).fill(client.first);
  await page.getByLabel("نام خانوادگی").fill(client.last);
  await page.getByLabel("کد ملی / شناسه ملی").fill("1234567890");
  await page.getByRole("button", { name: "ثبت مراجعه‌کننده" }).click();
  await expect(page.getByText("کد ملی معتبر نیست.")).toBeVisible(); // اعتبارسنجی سمت سرور
  await page.getByLabel("کد ملی / شناسه ملی").fill(nid);
  await page.getByLabel("تلفن همراه").fill("09121234567");
  await page.getByLabel("نشانی").fill("تهران، خیابان آزمون، پلاک ۱");
  await page.getByRole("button", { name: "ثبت مراجعه‌کننده" }).click();
  await page.waitForURL(/\/clients\/c[a-z0-9]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(client.last);

  // ثبت دوباره با همان کد ملی: هشدار سوابق مشابه + رد سمت سرور
  await page.goto("/clients/new");
  await page.getByLabel("نام", { exact: true }).fill("تکراری");
  await page.getByLabel("نام خانوادگی").fill("آزمون");
  await page.getByLabel("کد ملی / شناسه ملی").fill(nid);
  await expect(page.getByText("سوابق مشابه یافت شد")).toBeVisible();
  await page.getByRole("button", { name: "ثبت مراجعه‌کننده" }).click();
  await expect(page.getByText(/قبلاً ثبت شده است/)).toBeVisible();
});

test("۲. مسئول پذیرش پرونده ایجاد و سند بارگذاری می‌کند", async ({ page }) => {
  await login(page, "t.intake");
  await page.goto("/cases/new");
  await page.getByLabel("عنوان پرونده").fill(caseTitle);
  await pick(page, "مراجعه‌کننده", client.last);
  await page.getByLabel("مرجع قضایی").fill("دادگاه عمومی حقوقی تهران");
  await page.getByRole("button", { name: "ایجاد پرونده" }).click();
  await page.waitForURL(/\/cases\/c[a-z0-9]+$/);
  caseUrl = new URL(page.url()).pathname;
  await expect(page.locator(".mono-code").first()).toHaveText(/^P-14\d\d-\d{5}$/);
  await expect(page.getByText("پذیرش اولیه").first()).toBeVisible();
  await expect(page.getByText("این پرونده هنوز مسئول ندارد.")).toBeVisible();

  await page.goto(`${caseUrl}?tab=documents`);
  await page.getByRole("link", { name: "بارگذاری سند" }).click();
  await page.setInputFiles('input[type="file"]', { name: `وکالت‌نامه-${tag}.txt`, mimeType: "text/plain", buffer: Buffer.from(`وکالت‌نامه رسمی\nموکل: ${client.first} ${client.last}\n${docMarker}\nتاریخ ابلاغ: 1405/09/10`, "utf8") });
  await page.locator("select").first().selectOption("وکالت‌نامه");
  await page.getByRole("button", { name: "بارگذاری و ثبت سند" }).click();
  await page.waitForURL(/\/documents\/c[a-z0-9]+$/);
  await expect(page.getByText("متن استخراج و نمایه شد")).toBeVisible();
  await expect(page.locator("pre").getByText(docMarker)).toBeVisible();

  // فایل با محتوای ناسازگار با پسوند رد می‌شود
  await page.goto(`/documents/new?caseId=${caseUrl.split("/").pop()}`);
  await page.setInputFiles('input[type="file"]', { name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ this is not a pdf") });
  await page.locator("select").first().selectOption("سایر");
  await page.getByRole("button", { name: "بارگذاری و ثبت سند" }).click();
  await expect(page.getByText("محتوای فایل با پسوند آن هم‌خوانی ندارد.")).toBeVisible();
});

test("۳. مدیر دفتر پرونده را ارجاع می‌دهد، وظیفه و مهلت ثبت می‌کند", async ({ page }) => {
  await login(page, "t.manager");
  await page.goto(caseUrl);
  await page.getByRole("button", { name: "ارجاع به کارمند" }).click();
  const dlg = page.getByRole("dialog");
  await pick(page, "کارمند مسئول", "علی رضایی", dlg);
  await dlg.getByLabel("دستور / توضیح").fill("جهت بررسی و تنظیم دادخواست");
  await dlg.getByRole("button", { name: "ارجاع", exact: true }).click();
  await toast(page, "پرونده ارجاع شد.");
  await expect(page.getByText("باز", { exact: true }).first()).toBeVisible(); // INTAKE → OPEN

  await page.goto(`${caseUrl}?tab=tasks`);
  await page.getByRole("button", { name: "وظیفه جدید" }).click();
  const t = page.getByRole("dialog");
  await t.getByLabel("عنوان وظیفه").fill(`تنظیم دادخواست ${tag}`);
  await pick(page, "مجری", "علی رضایی", t);
  await t.getByLabel("مهلت انجام").fill("1410/01/20");
  await t.getByRole("button", { name: "ثبت", exact: true }).click();
  await toast(page, "وظیفه ثبت شد.");
  await expect(page.getByRole("link", { name: `تنظیم دادخواست ${tag}` })).toBeVisible();

  await page.goto(`${caseUrl}?tab=deadlines`);
  await page.getByRole("button", { name: "مهلت جدید" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("عنوان مهلت").fill(`تقدیم دادخواست ${tag}`);
  await d.getByLabel("تاریخ سررسید").fill("1410/02/01");
  await pick(page, "مسئول پیگیری", "علی رضایی", d);
  await d.getByRole("button", { name: "ثبت", exact: true }).click();
  await toast(page, /مهلت ثبت/);
  await expect(page.getByText(`تقدیم دادخواست ${tag}`)).toBeVisible();
});

test("۴. کارمند حقوقی اعلان می‌گیرد، وظیفه را انجام می‌دهد و نتیجه ثبت می‌شود", async ({ page }) => {
  await login(page, "t.legal");
  await page.getByRole("button", { name: /اعلان‌ها/ }).click();
  await expect(page.getByText("پرونده به شما ارجاع شد").first()).toBeVisible();
  await expect(page.getByText("وظیفه جدید به شما ارجاع شد").first()).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/tasks?view=mine");
  await page.getByRole("link", { name: `تنظیم دادخواست ${tag}` }).click();
  await page.getByRole("button", { name: "شروع کار" }).click();
  await toast(page, "کار روی وظیفه آغاز شد.");
  await page.getByRole("button", { name: "تکمیل وظیفه" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "ثبت نتیجه" }).click();
  await expect(dlg.getByText("الزامی است.").first()).toBeVisible(); // نتیجه الزامی است
  await dlg.getByLabel("نتیجه اقدامات انجام‌شده").fill("دادخواست تنظیم و برای بررسی آماده شد.");
  await dlg.getByRole("button", { name: "ثبت نتیجه" }).click();
  await toast(page, "وظیفه تکمیل شد.");
  await expect(page.getByText("انجام‌شده").first()).toBeVisible();
  await expect(page.getByText("دادخواست تنظیم و برای بررسی آماده شد.").first()).toBeVisible();
});

test("۵. جست‌وجوی یکپارچه مراجعه‌کننده، پرونده و متن درون سند را پیدا می‌کند", async ({ page }) => {
  await login(page, "t.legal");
  await page.goto(`/search?q=${encodeURIComponent(client.last)}`);
  await expect(page.getByRole("link", { name: new RegExp(client.last) }).first()).toBeVisible();
  await page.goto(`/search?q=${encodeURIComponent(docMarker)}`);
  await expect(page.getByRole("link", { name: new RegExp(`وکالت‌نامه-${tag}`) })).toBeVisible();
  // نرمال‌سازی فارسی: «ي/ك» عربی و ارقام فارسی
  await page.goto(`/search?q=${encodeURIComponent(caseTitle.replace("چک", "چك"))}`);
  await expect(page.getByRole("link", { name: caseTitle }).first()).toBeVisible();
});

test("۶. سوابق کامل پرونده قابل بازیابی است و پس از خروج و ورود باقی می‌ماند", async ({ page }) => {
  await login(page, "t.manager");
  await page.goto(`${caseUrl}?tab=timeline`);
  for (const ev of ["ایجاد پرونده", "بارگذاری سند", "تغییر مسئول پرونده", "ایجاد وظیفه", "تکمیل وظیفه", "ثبت مهلت"]) {
    await expect(page.getByText(ev, { exact: true }).first()).toBeVisible();
  }
  await logout(page);
  await login(page, "t.manager");
  await page.goto(caseUrl);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(caseTitle);

  const pdf = await page.request.get(`/api/export/case-history/${caseUrl.split("/").pop()}`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const xlsx = await page.request.get("/api/export/cases");
  expect(xlsx.status()).toBe(200);
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");
});

test("۷. بستن پرونده با موارد باز نیازمند تأیید است و سپس بایگانی می‌شود", async ({ page }) => {
  await login(page, "t.manager");
  await page.goto(caseUrl);
  await page.getByRole("button", { name: "بستن پرونده" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByText(/مهلت باز دارد/)).toBeVisible();
  await dlg.getByLabel("نتیجه / دلیل مختومه‌شدن").fill("صلح و سازش طرفین");
  await dlg.getByRole("button", { name: "تأیید و بستن پرونده" }).click();
  await expect(dlg.getByText(/الزامی است/).first()).toBeVisible(); // تأیید موارد باز الزامی است
  await dlg.getByLabel(/وضعیت موارد باز را بررسی کرده‌ام/).check();
  await dlg.getByRole("button", { name: "تأیید و بستن پرونده" }).click();
  await toast(page, "پرونده مختومه شد.");
  await page.getByRole("button", { name: "انتقال به بایگانی" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "تأیید" }).click();
  await toast(page, "پرونده بایگانی شد.");
  await page.goto("/cases?status=ARCHIVED");
  await expect(page.getByRole("link", { name: caseTitle })).toBeVisible();
  await page.goto(`${caseUrl}?tab=timeline`); // سوابق پس از بایگانی قابل بازیابی است
  await expect(page.getByText("بایگانی پرونده", { exact: true }).first()).toBeVisible();
});
