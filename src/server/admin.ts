import { z } from "zod";
import { audit } from "@/lib/audit";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { revokeUserSessions } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import { isValidMobile, isValidNationalId, toEnDigits } from "@/lib/text";

export const userSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9._-]{2,30}$/, "نام کاربری باید ۳ تا ۳۱ نویسه لاتین (حرف، رقم، نقطه، خط تیره) باشد و با حرف آغاز شود."),
  fullName: z.string().trim().min(3, "نام و نام خانوادگی الزامی است.").max(100),
  title: z.string().trim().max(100).optional().transform((v) => v || null),
  nationalId: z.string().trim().optional().transform((v) => (v ? toEnDigits(v) : null)).refine((v) => !v || isValidNationalId(v), "کد ملی معتبر نیست."),
  phone: z.string().trim().optional().transform((v) => (v ? toEnDigits(v) : null)).refine((v) => !v || isValidMobile(v), "شماره همراه معتبر نیست."),
  email: z.string().trim().optional().transform((v) => v || null).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "ایمیل معتبر نیست."),
  roleId: z.string().min(1, "نقش الزامی است."),
  departmentId: z.string().optional().transform((v) => v || null),
  password: z.string().optional().transform((v) => v || null),
});

async function assertNotLastAdmin(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (u?.role.key !== "admin") return;
  const others = await db.user.count({ where: { isActive: true, role: { key: "admin" }, NOT: { id: userId } } });
  if (others === 0) throw new AppError("دست‌کم یک مدیر سامانه فعال باید باقی بماند.");
}

export async function createUser(input: z.infer<typeof userSchema>, actor: SessionUser) {
  if (!input.password) throw new AppError("رمز عبور اولیه الزامی است.", "VALIDATION", 400, { password: "الزامی است." });
  const weak = validatePasswordStrength(input.password);
  if (weak) throw new AppError(weak, "VALIDATION", 400, { password: weak });
  if (await db.user.findUnique({ where: { username: input.username } })) throw new AppError("این نام کاربری قبلاً استفاده شده است.", "DUPLICATE", 409, { username: "تکراری است." });
  const role = await db.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw new AppError("نقش نامعتبر است.");
  if (role.key === "admin" && actor.roleKey !== "admin") throw new AppError("فقط مدیر سامانه می‌تواند مدیر سامانه دیگری تعریف کند.", "FORBIDDEN", 403);
  const u = await db.$transaction(async (tx) => {
    const row = await tx.user.create({
      data: {
        username: input.username, fullName: input.fullName, title: input.title, nationalId: input.nationalId, phone: input.phone, email: input.email,
        roleId: input.roleId, departmentId: input.departmentId, passwordHash: await hashPassword(input.password!), mustChangePassword: true,
      },
    });
    await audit({ actorId: actor.id, action: "user.created", entityType: "User", entityId: row.id, entityLabel: row.fullName, meta: { username: row.username, role: role.name } }, tx);
    return row;
  });
  return { id: u.id };
}

export async function updateUser(id: string, input: z.infer<typeof userSchema>, actor: SessionUser) {
  const before = await db.user.findUnique({ where: { id }, include: { role: true } });
  if (!before) throw new AppError("کاربر یافت نشد.");
  const role = await db.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw new AppError("نقش نامعتبر است.");
  if ((role.key === "admin" || before.role.key === "admin") && actor.roleKey !== "admin") throw new AppError("تغییر حساب مدیر سامانه فقط توسط مدیر سامانه ممکن است.", "FORBIDDEN", 403);
  if (before.role.key === "admin" && role.key !== "admin") await assertNotLastAdmin(id);
  if (input.username !== before.username && (await db.user.findUnique({ where: { username: input.username } }))) throw new AppError("این نام کاربری قبلاً استفاده شده است.", "DUPLICATE", 409, { username: "تکراری است." });
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { username: input.username, fullName: input.fullName, title: input.title, nationalId: input.nationalId, phone: input.phone, email: input.email, roleId: input.roleId, departmentId: input.departmentId } });
    await audit({ actorId: actor.id, action: "user.updated", entityType: "User", entityId: id, entityLabel: input.fullName, meta: { role: { from: before.role.name, to: role.name }, departmentId: { from: before.departmentId, to: input.departmentId } } }, tx);
  });
  // تغییر نقش باید بلافاصله اعمال شود
  if (before.roleId !== input.roleId) await revokeUserSessions(id);
}

export async function setUserActive(id: string, active: boolean, actor: SessionUser) {
  if (id === actor.id) throw new AppError("نمی‌توانید حساب خودتان را غیرفعال کنید.");
  const u = await db.user.findUnique({ where: { id }, include: { role: true } });
  if (!u) throw new AppError("کاربر یافت نشد.");
  if (u.role.key === "admin" && actor.roleKey !== "admin") throw new AppError("تغییر حساب مدیر سامانه فقط توسط مدیر سامانه ممکن است.", "FORBIDDEN", 403);
  if (!active) await assertNotLastAdmin(id);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { isActive: active, failedLogins: 0, lockedUntil: null } });
    await audit({ actorId: actor.id, action: active ? "user.activated" : "user.deactivated", entityType: "User", entityId: id, entityLabel: u.fullName }, tx);
  });
  // غیرفعال‌سازی فوری: همه نشست‌های باز کاربر باطل می‌شود
  if (!active) await revokeUserSessions(id);
}

export async function resetUserPassword(id: string, password: string, actor: SessionUser) {
  const weak = validatePasswordStrength(password);
  if (weak) throw new AppError(weak, "VALIDATION", 400, { password: weak });
  const u = await db.user.findUnique({ where: { id }, include: { role: true } });
  if (!u) throw new AppError("کاربر یافت نشد.");
  if (u.role.key === "admin" && actor.roleKey !== "admin") throw new AppError("تغییر حساب مدیر سامانه فقط توسط مدیر سامانه ممکن است.", "FORBIDDEN", 403);
  await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true, failedLogins: 0, lockedUntil: null } });
  await revokeUserSessions(id);
  await audit({ actorId: actor.id, action: "user.password_reset", entityType: "User", entityId: id, entityLabel: u.fullName });
}

const VALID_PERMS = new Set<string>(PERMISSIONS.map((p) => p[0]));

export async function setRolePermissions(roleId: string, keys: string[], actor: SessionUser) {
  const role = await db.role.findUnique({ where: { id: roleId }, include: { permissions: true } });
  if (!role) throw new AppError("نقش یافت نشد.");
  if (role.key === "admin") throw new AppError("مجوزهای نقش «مدیر سامانه» قابل تغییر نیست.");
  const next = [...new Set(keys)].filter((k) => VALID_PERMS.has(k));
  const prev = new Set(role.permissions.map((p) => p.permissionKey));
  const added = next.filter((k) => !prev.has(k));
  const removed = [...prev].filter((k) => !next.includes(k));
  await db.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    await tx.rolePermission.createMany({ data: next.map((permissionKey) => ({ roleId, permissionKey })) });
    await audit({ actorId: actor.id, action: "role.updated", entityType: "Role", entityId: roleId, entityLabel: role.name, meta: { added, removed } }, tx);
  });
}

export async function createRole(input: { name: string; description: string | null; copyFromId: string | null }, actor: SessionUser) {
  const key = `custom_${Date.now().toString(36)}`;
  const src = input.copyFromId ? await db.rolePermission.findMany({ where: { roleId: input.copyFromId, role: { key: { not: "admin" } } } }) : [];
  const r = await db.$transaction(async (tx) => {
    const role = await tx.role.create({ data: { key, name: input.name, description: input.description, permissions: { create: src.map((p) => ({ permissionKey: p.permissionKey })) } } });
    await audit({ actorId: actor.id, action: "role.created", entityType: "Role", entityId: role.id, entityLabel: role.name }, tx);
    return role;
  });
  return { id: r.id };
}

export async function saveDepartment(input: { id?: string | null; name: string; managerId: string | null }, actor: SessionUser) {
  const dup = await db.department.findFirst({ where: { name: input.name, NOT: input.id ? { id: input.id } : undefined } });
  if (dup) throw new AppError("واحدی با این نام وجود دارد.", "DUPLICATE", 409, { name: "تکراری است." });
  const d = input.id
    ? await db.department.update({ where: { id: input.id }, data: { name: input.name, managerId: input.managerId } })
    : await db.department.create({ data: { name: input.name, managerId: input.managerId } });
  await audit({ actorId: actor.id, action: input.id ? "department.updated" : "department.created", entityType: "Department", entityId: d.id, entityLabel: d.name });
  return { id: d.id };
}

// ───────── تنظیمات دفتر ─────────
export interface OfficeSettings {
  officeName: string; officeCode: string; address: string; phone: string; city: string;
  letterheadNote: string; workdayStart: string; workdayEnd: string;
}
export const DEFAULT_OFFICE: OfficeSettings = {
  officeName: "دفتر خدمات الکترونیک قضایی", officeCode: "", address: "", phone: "", city: "", letterheadNote: "", workdayStart: "08:00", workdayEnd: "16:00",
};

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.setting.findUnique({ where: { key } });
  return s ? ({ ...(fallback as object), ...(s.value as object) } as T) : fallback;
}
export async function setSetting(key: string, value: object, actor: SessionUser) {
  await db.setting.upsert({ where: { key }, create: { key, value, updatedById: actor.id }, update: { value, updatedById: actor.id } });
  await audit({ actorId: actor.id, action: "settings.updated", entityType: "Setting", entityId: key, entityLabel: key });
}
export const getOffice = () => getSetting<OfficeSettings>("office", DEFAULT_OFFICE);
