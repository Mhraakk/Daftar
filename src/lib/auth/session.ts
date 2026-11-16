import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "../db";

export const SESSION_COOKIE = "daftar_session";
const TTL_H = Number(process.env.SESSION_TTL_HOURS ?? 12);
const IDLE_MIN = Number(process.env.SESSION_IDLE_MINUTES ?? 60);

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const expiresAt = new Date(Date.now() + TTL_H * 3600_000);
  await db.session.create({
    data: { tokenHash: sha(token), userId, expiresAt, ip: await clientIp(), userAgent: h.get("user-agent")?.slice(0, 300) },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });
}

/** اعتبارسنجی نشست از روی توکن خام؛ انقضای مطلق و بی‌کاری را اعمال می‌کند. */
export async function resolveSession(token: string | undefined | null) {
  if (!token) return null;
  const s = await db.session.findUnique({
    where: { tokenHash: sha(token) },
    include: { user: { include: { role: { include: { permissions: true } }, department: true } } },
  });
  if (!s || s.revokedAt) return null;
  const now = Date.now();
  if (s.expiresAt.getTime() < now) return null;
  if (now - s.lastSeenAt.getTime() > IDLE_MIN * 60_000) {
    await db.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } }).catch(() => {});
    return null;
  }
  if (!s.user.isActive) return null;
  if (now - s.lastSeenAt.getTime() > 60_000) {
    await db.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return s;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({ where: { tokenHash: sha(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  jar.delete(SESSION_COOKIE);
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
