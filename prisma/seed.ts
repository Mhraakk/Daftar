// داده‌های پایه سامانه (ایمن برای اجرای مکرر). داده آزمایشی/نمایشی در scripts/seed-demo.ts جداست.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { DEFAULT_ROLES, PERMISSIONS } from "../src/lib/permissions";
import { DEADLINE_RULES } from "./seed-data/deadline-rules";
import { CONNECTORS } from "./seed-data/connectors";
import { seedTemplates } from "./seed-data/templates";
import { ACP_IMPORT, importLaw } from "../src/server/law-import";
import { seedPetitionTypes } from "../src/server/petitions/seed";

const db = new PrismaClient();

async function main() {
  // مجوزها؛ کلیدهای تازه (در این اجرا اضافه‌شده) به نقش‌های سیستمی دارای آن در پیش‌فرض داده می‌شود
  const knownKeys = new Set((await db.permission.findMany({ select: { key: true } })).map((p) => p.key));
  const newKeys = knownKeys.size ? PERMISSIONS.map((p) => p[0]).filter((k) => !knownKeys.has(k)) : [];
  for (const [key, group, label] of PERMISSIONS) {
    await db.permission.upsert({ where: { key }, create: { key, group, label }, update: { group, label } });
  }
  await db.permission.deleteMany({ where: { key: { notIn: PERMISSIONS.map((p) => p[0]) } } });

  // نقش‌های پیش‌فرض: فقط هنگام ایجاد مقداردهی می‌شوند تا تنظیمات مدیر بازنویسی نشود (به‌جز admin که همیشه کامل است)
  for (const r of DEFAULT_ROLES) {
    const existing = await db.role.findUnique({ where: { key: r.key } });
    if (!existing) {
      await db.role.create({ data: { key: r.key, name: r.name, description: r.description, isSystem: true, permissions: { create: r.permissions.map((permissionKey) => ({ permissionKey })) } } });
    } else if (r.key === "admin") {
      await db.rolePermission.deleteMany({ where: { roleId: existing.id } });
      await db.rolePermission.createMany({ data: r.permissions.map((permissionKey) => ({ roleId: existing.id, permissionKey })) });
    } else {
      const grant = r.permissions.filter((k) => newKeys.includes(k));
      if (grant.length) await db.rolePermission.createMany({ data: grant.map((permissionKey) => ({ roleId: existing.id, permissionKey })), skipDuplicates: true });
    }
  }

  // واحدها
  for (const name of ["پذیرش", "امور حقوقی", "بایگانی و اداری"]) {
    await db.department.upsert({ where: { name }, create: { name }, update: {} });
  }

  // مدیر سامانه اولیه
  if ((await db.user.count()) === 0) {
    const username = (process.env.SEED_ADMIN_USERNAME ?? "admin").toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password || password.startsWith("CHANGE_ME")) throw new Error("SEED_ADMIN_PASSWORD را در فایل .env تنظیم کنید.");
    const admin = await db.role.findUniqueOrThrow({ where: { key: "admin" } });
    await db.user.create({ data: { username, fullName: "مدیر سامانه", title: "مدیر سامانه", roleId: admin.id, passwordHash: await hashPassword(password), mustChangePassword: process.env.SEED_KEEP_PASSWORD !== "1" } });
    console.log(`✔ حساب مدیر سامانه ساخته شد: ${username}`);
  }

  // قواعد مهلت (پیشنهادی؛ تا تأیید مسئول حقوقی «تأییدنشده» می‌مانند). مبنای قاعده تأییدشده بازنویسی نمی‌شود.
  for (const r of DEADLINE_RULES) {
    const prev = await db.deadlineRule.findUnique({ where: { key: r.key } });
    const basis = prev?.verified ? {} : { basis: r.basis, days: r.days, monthsAbroad: r.monthsAbroad, lawCode: r.lawCode, articleNos: r.articleNos };
    await db.deadlineRule.upsert({ where: { key: r.key }, create: r, update: { title: r.title, description: r.description, ...basis } });
  }

  // متن قانون آیین دادرسی مدنی (از PDF دفتر؛ همه مواد «تأییدنشده» تا تطبیق با متن رسمی)
  const acp = await importLaw(db, ACP_IMPORT);
  console.log(`✔ ق.آ.د.م: ${acp.created} ماده جدید، ${acp.updated} به‌روزرسانی، ${acp.unchanged} بدون تغییر.`);

  // انواع دادخواست: ۲۹ فرم نمونه دفتر و انواع اعتراضی/طاری برگرفته از متن قانون
  const pt = await seedPetitionTypes(db);
  console.log(`✔ انواع دادخواست: ${pt.forms} فرم + ${pt.law} نوع قانونی (${pt.created} جدید، ${pt.updated} به‌روزرسانی، ${pt.kept} ویرایش‌شده دستی).`);

  // اتصال‌های بیرونی (همه غیرفعال تا پیکربندی)
  for (const c of CONNECTORS) {
    await db.connector.upsert({ where: { key: c.key }, create: c, update: { name: c.name, kind: c.kind } });
  }

  await seedTemplates(db);
  await db.setting.upsert({ where: { key: "office" }, create: { key: "office", value: { officeName: "دفتر خدمات الکترونیک قضایی" } }, update: {} });
  console.log("✔ داده‌های پایه آماده است.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
