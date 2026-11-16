import { audit } from "@/lib/audit";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/auth/password";
import { clientIp, createSession, destroySession, revokeUserSessions } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

const MAX_FAILS = 5;
const LOCK_MIN = 15;
// محدودسازی درخواست بر پایه IP (درون‌حافظه‌ای؛ برای استقرار تک‌سرور دفتر کافی است)
const ipHits = new Map<string, { n: number; reset: number }>();
function rateLimit(ip: string | null) {
  const key = ip ?? "unknown";
  const now = Date.now();
  const h = ipHits.get(key);
  if (!h || h.reset < now) { ipHits.set(key, { n: 1, reset: now + 10 * 60_000 }); return; }
  if (++h.n > 30) throw new AppError("تعداد تلاش‌های ورود بیش از حد مجاز است. چند دقیقه بعد دوباره تلاش کنید.", "RATE_LIMIT", 429);
}

const GENERIC = "نام کاربری یا رمز عبور نادرست است.";

export async function login(username: string, password: string): Promise<{ mustChangePassword: boolean }> {
  const ip = await clientIp();
  rateLimit(ip);
  const uname = username.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { username: uname } });
  if (!user) {
    // زمان پاسخ مشابه برای جلوگیری از افشای وجود نام کاربری
    await verifyPassword(password, "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==").catch(() => false);
    await audit({ action: "auth.login_failed", entityType: "User", entityLabel: uname.slice(0, 60), ip, meta: { reason: "unknown_user" } });
    throw new AppError(GENERIC, "INVALID_CREDENTIALS", 401);
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await audit({ actorId: user.id, action: "auth.login_failed", entityType: "User", entityId: user.id, entityLabel: user.fullName, ip, meta: { reason: "locked" } });
    throw new AppError("حساب به دلیل تلاش‌های ناموفق پیاپی موقتاً قفل شده است. بعداً تلاش کنید یا با مدیر سامانه تماس بگیرید.", "LOCKED", 423);
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok || !user.isActive) {
    const fails = ok ? user.failedLogins : user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: { failedLogins: fails >= MAX_FAILS ? 0 : fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60_000) : null },
    });
    await audit({ actorId: user.id, action: "auth.login_failed", entityType: "User", entityId: user.id, entityLabel: user.fullName, ip, meta: { reason: !user.isActive ? "inactive" : "bad_password", fails } });
    throw new AppError(!user.isActive && ok ? "حساب کاربری شما غیرفعال است." : GENERIC, "INVALID_CREDENTIALS", 401);
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession(user.id);
  await audit({ actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id, entityLabel: user.fullName, ip });
  return { mustChangePassword: user.mustChangePassword };
}

export async function logout(user: SessionUser | null) {
  if (user) await audit({ actorId: user.id, action: "auth.logout", entityType: "User", entityId: user.id, entityLabel: user.fullName, ip: await clientIp() });
  await destroySession();
}

export async function changeOwnPassword(user: SessionUser, current: string, next: string) {
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(current, row.passwordHash))) throw new AppError("رمز عبور فعلی نادرست است.", "VALIDATION", 400, { current: "نادرست است." });
  const weak = validatePasswordStrength(next);
  if (weak) throw new AppError(weak, "VALIDATION", 400, { next: weak });
  if (current === next) throw new AppError("رمز جدید باید با رمز فعلی متفاوت باشد.", "VALIDATION", 400, { next: "تکراری است." });
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
  // ابطال همه نشست‌ها و ایجاد نشست تازه
  await revokeUserSessions(user.id);
  await createSession(user.id);
  await audit({ actorId: user.id, action: "auth.password_changed", entityType: "User", entityId: user.id, entityLabel: user.fullName, ip: await clientIp() });
}
