// دادخواست از پرونده تا بایگانی: پیشنهاد نوع از پرونده، استودیو با طرفین پیش‌پرشده، تکمیل جاهای خالی، بررسی ماده ۵۱/۵۳،
// ارسال برای بررسی، تأیید، خروجی و نهایی‌سازی؛ نسخه نهایی در گروه «دادخواست» بایگانی می‌شود.
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { login, nationalId, pick, toast, uniq } from "./helpers";

const db = new PrismaClient();
const tag = uniq();
let caseId = "", draftUrl = "";
const SAVE_TIMEOUT_MS = 20_000;
const PDF_MAGIC = "%PDF-";
const PETITION_SUFFIX = "/petition";
test.describe.configure({ mode: "serial" });
test.afterAll(() => db.$disconnect());

test.beforeAll(async () => {
  const [legal, mgr] = await Promise.all([db.user.findUniqueOrThrow({ where: { username: "t.legal" } }), db.user.findUniqueOrThrow({ where: { username: "t.manager" } })]);
  const client = await db.client.create({
    data: {
      code: `M-PET-${tag}`, type: "PERSON", firstName: "سارا", lastName: `زوجیتی ${tag}`, displayName: `سارا زوجیتی ${tag}`, fatherName: "حسن", nationalId: nationalId(),
      birthDate: new Date("1990-03-21"), occupation: "معلم", address: "تهران، خیابان آزادی، کوچه پنجم، پلاک ۱۲، واحد ۳", createdById: mgr.id, assignedToId: legal.id,
    },
  });
  const c = await db.case.create({
    data: { number: `P-PET-${tag}`, title: `اثبات زوجیت ${tag}`, category: "خانواده", clientId: client.id, responsibleId: legal.id, createdById: mgr.id, status: "OPEN", courtName: "دادگاه خانواده تهران", courtBranch: "۵" },
  });
  caseId = c.id;
  await db.caseParty.createMany({
    data: [
      { caseId, clientId: client.id, role: "خواهان", name: client.displayName },
      { caseId, role: "خوانده", name: "رضا اکبری", fatherName: "محمد", occupation: "کارمند", address: "تهران، خیابان شریعتی، کوچه بهار، پلاک ۷" },
    ],
  });
});

test("کارمند حقوقی از پرونده دادخواست «اثبات زوجیت» می‌سازد، کامل می‌کند و برای بررسی می‌فرستد", async ({ page }) => {
  await login(page, "t.legal");
  await page.goto(`/petitions?caseId=${caseId}`);
  await expect(page.getByText(`پیشنهاد برای پرونده P-PET-${tag}`)).toBeVisible();
  await page.getByRole("link", { name: "اثبات زوجیت" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("اثبات زوجیت");
  await page.getByRole("button", { name: "تنظیم و ورود به استودیو" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/drafts/") && u.pathname.endsWith(PETITION_SUFFIX));
  draftUrl = page.url().slice(0, -PETITION_SUFFIX.length);

  // طرفین از پرونده و مراجعه‌کننده پر شده‌اند
  await expect(page.getByRole("article", { name: "خواهان ۱" })).toContainText(`سارا زوجیتی ${tag}`);
  await expect(page.getByRole("article", { name: "خوانده ۱" })).toContainText("رضا اکبری");

  await page.getByRole("button", { name: "خواسته و بها" }).first().click();
  await page.getByRole("radio", { name: "غیرمالی" }).click();

  await page.getByRole("button", { name: "شرح خواسته" }).first().click();
  await page.getByPlaceholder("مثلاً ۱۴۰۵/۰۸/۲۵").first().fill("۱۴۰۰/۰۵/۱۰");
  await page.getByPlaceholder("مثلاً ۱۴۰۵/۰۸/۲۵").first().press("Tab");
  await page.getByLabel("مهریه", { exact: true }).fill("یکصد عدد سکه تمام بهار آزادی");
  await expect(page.locator(".legal-doc")).toContainText("یکصد عدد سکه تمام بهار آزادی"); // پیش‌نمایش زنده

  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText("ذخیره شده", { exact: true })).toBeVisible({ timeout: SAVE_TIMEOUT_MS });
  await page.getByRole("button", { name: "بازبینی" }).first().click();
  await expect(page.getByText("الزام‌های شکلی کامل است").first()).toBeVisible();
  await expect(page.getByRole("table", { name: "سامانه ثبت دادخواست" })).toContainText("رضا اکبری");

  await page.getByRole("link", { name: "ارسال برای بررسی و نهایی‌سازی" }).click();
  await page.waitForURL(draftUrl);
  await expect(page.locator(".legal-doc")).toContainText("یکصد عدد سکه تمام بهار آزادی");
  await page.getByRole("button", { name: "ارسال برای بررسی" }).click();
  const dlg = page.getByRole("dialog");
  await pick(page, "بررسی‌کننده", "حسین موسوی", dlg);
  await dlg.getByRole("button", { name: "ارسال", exact: true }).click();
  await expect(page.getByText("در حال بررسی؛ ویرایش تا پایان بررسی قفل است.")).toBeVisible();
});

test("بررسی‌کننده تأیید و نهایی‌سازی می‌کند؛ نسخه نهایی در گروه «دادخواست» پرونده بایگانی می‌شود", async ({ page }) => {
  await login(page, "t.reviewer");
  await page.goto(draftUrl);
  await expect(page.getByText("الزام‌های شکلی کامل است")).toBeVisible(); // خلاصه دادخواست در صفحه سند
  await page.getByRole("button", { name: "تأیید سند" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "تأیید", exact: true }).click();
  await toast(page, "سند تأیید شد.");
  const id = draftUrl.split("/").pop();
  const pdf = await page.request.get(`/api/drafts/${id}/export?format=pdf`);
  expect((await pdf.body()).subarray(0, PDF_MAGIC.length).toString()).toBe(PDF_MAGIC);
  await page.getByRole("button", { name: "نهایی‌سازی" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "نهایی‌سازی" }).click();
  await page.getByRole("link", { name: "مشاهده نسخه نهایی در بایگانی" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/documents/"));
  await expect(page.getByRole("heading", { level: 1 }).first()).toContainText("(نسخه نهایی)"); // برگ دادخواست هم h1 خودش را دارد
  const doc = await db.document.findFirstOrThrow({ where: { caseId, title: { contains: "(نسخه نهایی)" } }, select: { category: true } });
  expect(doc.category).toBe("دادخواست");
});
