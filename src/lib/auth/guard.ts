import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ForbiddenError, UnauthorizedError } from "../errors";
import type { PermissionKey } from "../permissions";
import { resolveSession, SESSION_COOKIE } from "./session";

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  title: string | null;
  roleKey: string;
  roleName: string;
  departmentId: string | null;
  departmentName: string | null;
  mustChangePassword: boolean;
  permissions: Set<string>;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = await resolveSession(token);
  if (!s) return null;
  const u = s.user;
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    title: u.title,
    roleKey: u.role.key,
    roleName: u.role.name,
    departmentId: u.departmentId,
    departmentName: u.department?.name ?? null,
    mustChangePassword: u.mustChangePassword,
    permissions: new Set(u.role.permissions.map((p) => p.permissionKey)),
  };
});

/** برای صفحات: در نبود نشست به صفحه ورود هدایت می‌کند. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

/** برای اکشن‌ها و APIها: خطا پرتاب می‌کند. */
export async function requireUserStrict(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new UnauthorizedError();
  return u;
}

export function can(user: SessionUser, perm: PermissionKey): boolean {
  return user.permissions.has(perm);
}

export function assertCan(user: SessionUser, perm: PermissionKey): void {
  if (!can(user, perm)) throw new ForbiddenError();
}

/** برای صفحات: نبود مجوز → صفحه «دسترسی غیرمجاز». */
export async function requirePagePerm(perm: PermissionKey): Promise<SessionUser> {
  const u = await requireUser();
  if (!can(u, perm)) redirect("/forbidden");
  return u;
}
