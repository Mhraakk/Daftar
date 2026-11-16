// اسناد حقوقی: ساخت از قالب با اطلاعات پرونده، ویرایش و ذخیره خودکار، بررسی، اصلاح، تأیید، خروجی Word/PDF و نهایی‌سازی
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import { login, pick, toast, uniq } from "./helpers";

const db = new PrismaClient();
const tag = uniq();
const title = `نامه آزمون ${tag}`;
let caseId = "", draftUrl = "";
test.describe.configure({ mode: "serial" });
test.afterAll(() => db.$disconnect());

test.beforeAll(async () => {
  const [legal, mgr] = await Promise.all([db.user.findUniqueOrThrow({ where: { username: "t.legal" } }), db.user.findUniqueOrThrow({ where: { username: "t.manager" } })]);
  const client = await db.client.create({ data: { code: `M-E2E-${tag}`, type: "PERSON", firstName: "پروین", lastName: `سندی ${tag}`, displayName: `پروین سندی ${tag}`, createdById: mgr.id, assignedToId: legal.id } });
  const c = await db.case.create({ data: { number: `P-E2E-${tag}`, title: `پرونده سند ${tag}`, category: "حقوقی", clientId: client.id, responsibleId: legal.id, createdById: mgr.id, status: "OPEN", courtName: "دادگاه عمومی حقوقی تهران" } });
  caseId = c.id;
});

test("کارمند حقوقی از قالب «نامه اداری» سند می‌سازد، ویرایش و نسخه ثبت می‌کند و برای بررسی می‌فرستد", async ({ page }) => {
  await login(page, "t.legal");
  await page.goto(`/drafts/new?caseId=${caseId}`);
  await page.getByPlaceholder("جست‌وجوی قالب…").fill("نامه اداری");
  await page.getByRole("radio", { name: /نامه اداری/ }).click();
  await expect(page.getByLabel("موضوع نامه")).toBeVisible();
  await page.getByLabel("عنوان سند").fill(title);
  for (const [k, v] of [["شماره نامه", "۱۴۰۵/۷۷"], ["پیوست", "ندارد"], ["عنوان و نام گیرنده", "مدیر محترم دفتر شعبه ۱۲"], ["موضوع نامه", `پیگیری پرونده ${tag}`], ["متن نامه", "احتراماً درخواست تعیین وقت رسیدگی دارد."]]) {
    await page.getByLabel(k, { exact: true }).fill(v);
  }
  await page.getByRole("button", { name: "ایجاد سند و ورود به ویرایشگر" }).click();
  await page.waitForURL(/\/drafts\/c[a-z0-9]+$/);
  draftUrl = new URL(page.url()).pathname;
  await expect(page.locator(".mono-code").first()).toHaveText(/^L-14\d\d-\d{5}$/);
  await expect(page.getByTestId("unfilled")).toHaveCount(0); // همه فیلدها پر شده‌اند
  const editor = page.getByRole("textbox", { name: "متن سند" });
  await expect(editor).toContainText("مدیر محترم دفتر شعبه ۱۲");
  await expect(editor).toContainText("علی رضایی"); // user.fullName خودکار

  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" بند الحاقی آزمون");
  await expect(page.locator("[data-save-state=saved]")).toBeVisible({ timeout: 20_000 }); // ذخیره خودکار
  await page.keyboard.press("Control+s");
  await toast(page, "نسخه ۲ ثبت شد.");

  await page.getByRole("button", { name: "ارسال برای بررسی" }).click();
  const dlg = page.getByRole("dialog");
  await pick(page, "بررسی‌کننده", "حسین موسوی", dlg);
  await dlg.getByRole("button", { name: "ارسال", exact: true }).click();
  await toast(page, "سند برای بررسی ارسال شد.");
  await expect(page.getByText("در حال بررسی؛ ویرایش تا پایان بررسی قفل است.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "متن سند" })).toHaveCount(0);
});

test("بررسی‌کننده درخواست اصلاح می‌دهد و تنظیم‌کننده اصلاح و دوباره ارسال می‌کند", async ({ page }) => {
  await login(page, "t.reviewer");
  await page.goto("/drafts?view=review");
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("button", { name: "درخواست اصلاح" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByRole("button", { name: "ارسال درخواست اصلاح" })).toBeDisabled();
  await dlg.getByRole("textbox").fill("شماره پرونده قضایی در متن ذکر شود.");
  await dlg.getByRole("button", { name: "ارسال درخواست اصلاح" }).click();
  await toast(page, "درخواست اصلاح ارسال شد.");

  await page.context().clearCookies();
  await login(page, "t.legal");
  await page.goto(draftUrl);
  await expect(page.getByText("شماره پرونده قضایی در متن ذکر شود.").first()).toBeVisible();
  const editor = page.getByRole("textbox", { name: "متن سند" });
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" کلاسه ۱۴۰۵۰۹۹۸۱۲۳۴۵۶۷۸");
  await expect(page.locator("[data-save-state=saved]")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "ارسال برای بررسی" }).click();
  const d2 = page.getByRole("dialog");
  await pick(page, "بررسی‌کننده", "حسین موسوی", d2);
  await d2.getByRole("button", { name: "ارسال", exact: true }).click();
  await toast(page, "سند برای بررسی ارسال شد.");
});

test("بررسی‌کننده تأیید، خروجی Word/PDF و نهایی‌سازی می‌کند؛ نسخه نهایی در پرونده بایگانی می‌شود", async ({ page }) => {
  await login(page, "t.reviewer");
  await page.goto(draftUrl);
  await expect(page.getByRole("textbox", { name: "متن سند" })).toHaveCount(0);
  await expect(page.locator(".legal-doc")).toContainText("کلاسه ۱۴۰۵۰۹۹۸۱۲۳۴۵۶۷۸"); // آخرین تغییر پیش از ارسال ذخیره شده
  await page.getByRole("button", { name: "تأیید سند" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "تأیید", exact: true }).click();
  await toast(page, "سند تأیید شد.");

  const id = draftUrl.split("/").pop();
  const docx = await page.request.get(`/api/drafts/${id}/export?format=docx`);
  expect(docx.status()).toBe(200);
  expect((await docx.body()).subarray(0, 2).toString()).toBe("PK");
  const pdf = await page.request.get(`/api/drafts/${id}/export?format=pdf`);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await page.getByRole("button", { name: "نهایی‌سازی" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "نهایی‌سازی" }).click();
  await toast(page, "سند نهایی و در بایگانی ثبت شد.");
  await page.getByRole("link", { name: "مشاهده نسخه نهایی در بایگانی" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("(نسخه نهایی)");
  await expect(page.locator("table.tbl tbody tr")).toHaveCount(2); // Word + PDF

  await page.context().clearCookies();
  await login(page, "t.legal");
  await page.goto(`/cases/${caseId}?tab=documents`);
  await expect(page.getByRole("link", { name: new RegExp(`${title} \\(نسخه نهایی\\)`) })).toBeVisible();
  await page.goto(`${draftUrl}/compare?a=1`);
  await expect(page.getByText("بند الحاقی آزمون").first()).toBeVisible();
  await expect(page.locator(".bg-sabz-50").first()).toBeVisible(); // بند افزوده
  await page.goto(draftUrl);
  await expect(page.getByText("سند نهایی و قفل است.")).toBeVisible();
});

test("مدیر دفتر قالب را از فایل Word درون‌ریزی و از آن سند می‌سازد", async ({ page }) => {
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, children: [new TextRun({ text: `قرارداد نمونه ${tag}`, bold: true, rightToLeft: true })] }),
    new Paragraph({ bidirectional: true, children: [new TextRun({ text: "طرف اول: {{client.displayName}} — مبلغ: {{مبلغ قرارداد}}", rightToLeft: true })] }),
  ] }] });
  const buf = Buffer.from(await Packer.toBuffer(doc));
  await login(page, "t.manager");
  await page.goto("/templates/new");
  await page.setInputFiles('input[aria-label="فایل قالب"]', { name: `قرارداد-${tag}.docx`, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: buf });
  await toast(page, /درون‌ریزی شد/);
  await expect(page.getByRole("textbox", { name: "متن سند" })).toContainText(`قرارداد نمونه ${tag}`);
  await expect(page.getByRole("list", { name: "فیلدهای قالب" })).toContainText("مبلغ قرارداد");
  await page.getByLabel("نام قالب").fill(`قالب قرارداد ${tag}`);
  await page.getByRole("button", { name: "ذخیره قالب" }).click();
  await page.waitForURL(/\/templates\/c[a-z0-9]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`قالب قرارداد ${tag}`);
  await expect(page.getByText(`از قرارداد-${tag}.docx`).first()).toBeVisible();
  await page.getByRole("link", { name: "ساخت سند از این قالب" }).click();
  await expect(page.getByLabel("مبلغ قرارداد")).toBeVisible();
});
