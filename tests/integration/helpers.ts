import { PrismaClient } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/guard";

export const prisma = new PrismaClient();

export async function asUser(username: string): Promise<SessionUser> {
  const u = await prisma.user.findUniqueOrThrow({ where: { username }, include: { role: { include: { permissions: true } }, department: true } });
  return { id: u.id, username: u.username, fullName: u.fullName, title: u.title, roleKey: u.role.key, roleName: u.role.name, departmentId: u.departmentId, departmentName: u.department?.name ?? null, mustChangePassword: false, permissions: new Set(u.role.permissions.map((p) => p.permissionKey)) };
}

export function nationalId(): string {
  for (;;) {
    const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
    if (new Set(d).size < 3) continue;
    const r = d.reduce((a, x, i) => a + x * (10 - i), 0) % 11;
    return d.join("") + String(r < 2 ? r : 11 - r);
  }
}
export const tag = () => Math.random().toString(36).slice(2, 8);
