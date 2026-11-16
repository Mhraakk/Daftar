// حساب‌های آزمایشی برای آزمون و آموزش (جدا از داده‌های عملیاتی). فقط در محیط آزمون اجرا شود:
//   npx tsx scripts/seed-demo.ts
// همه حساب‌ها با پیشوند «t.» ساخته می‌شوند تا به‌سادگی قابل شناسایی و غیرفعال‌سازی باشند.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const db = new PrismaClient();
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "Test@12345";
export const DEMO_USERS = [
  { username: "t.manager", fullName: "مریم احمدی", role: "office_manager", dept: "بایگانی و اداری", title: "مدیر دفتر" },
  { username: "t.legal", fullName: "علی رضایی", role: "legal_staff", dept: "امور حقوقی", title: "کارشناس حقوقی" },
  { username: "t.legal2", fullName: "نرگس کریمی", role: "legal_staff", dept: "امور حقوقی", title: "کارشناس حقوقی" },
  { username: "t.intake", fullName: "سارا محمدی", role: "intake", dept: "پذیرش", title: "مسئول پذیرش" },
  { username: "t.reviewer", fullName: "حسین موسوی", role: "reviewer", dept: "امور حقوقی", title: "مسئول بررسی اسناد" },
  { username: "t.employee", fullName: "رضا نوری", role: "employee", dept: "بایگانی و اداری", title: "کارمند" },
  { username: "t.auditor", fullName: "زهرا صادقی", role: "auditor", dept: null, title: "ناظر" },
];

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO !== "1") throw new Error("ساخت حساب آزمایشی در محیط عملیاتی مجاز نیست (ALLOW_DEMO=1).");
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const u of DEMO_USERS) {
    const role = await db.role.findUniqueOrThrow({ where: { key: u.role } });
    const dept = u.dept ? await db.department.findUnique({ where: { name: u.dept } }) : null;
    await db.user.upsert({
      where: { username: u.username },
      create: { username: u.username, fullName: u.fullName, title: u.title, roleId: role.id, departmentId: dept?.id, passwordHash, mustChangePassword: false },
      update: { roleId: role.id, departmentId: dept?.id ?? null, isActive: true, passwordHash, mustChangePassword: false, failedLogins: 0, lockedUntil: null },
    });
  }
  console.log(`✔ ${DEMO_USERS.length} حساب آزمایشی آماده شد (رمز: ${DEMO_PASSWORD})`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
