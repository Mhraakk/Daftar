import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = apiHandler(null, async (_req, user) => {
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 15, select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true, important: true } }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return NextResponse.json({ items, unread });
});

export const POST = apiHandler(null, async (req, user) => {
  const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };
  // فقط اعلان‌های خود کاربر
  await db.notification.updateMany({ where: { userId: user.id, readAt: null, ...(body.all ? {} : { id: String(body.id ?? "") }) }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
});
