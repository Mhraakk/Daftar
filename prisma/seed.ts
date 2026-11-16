// داده‌های پایه سامانه (ایمن برای اجرای مکرر). داده آزمایشی/نمایشی در scripts/seed-demo.ts جداست.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { DEFAULT_ROLES, PERMISSIONS } from "../src/lib/permissions";
import { DEADLINE_RULES } from "./seed-data/deadline-rules";
import { CONNECTORS } from "./seed-data/connectors";
import { seedTemplates } from "./seed-data/templates";

const db = new PrismaClient();

async function main() {
  // مجوزها
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

  // قواعد مهلت (پیشنهادی؛ تا تأیید مسئول حقوقی «تأییدنشده» می‌مانند)
  for (const r of DEADLINE_RULES) {
    await db.deadlineRule.upsert({ where: { key: r.key }, create: r, update: { title: r.title, description: r.description } });
  }

  // اتصال‌های بیرونی (همه غیرفعال تا پیکربندی)
  for (const c of CONNECTORS) {
    await db.connector.upsert({ where: { key: c.key }, create: c, update: { name: c.name, kind: c.kind } });
  }

  await seedTemplates(db);
  await db.setting.upsert({ where: { key: "office" }, create: { key: "office", value: { officeName: "دفتر خدمات الکترونیک قضایی" } }, update: {} });
  console.log("✔ داده‌های پایه آماده است.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
