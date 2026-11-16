import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { db } from "@/lib/db";
import { toEnDigits } from "@/lib/text";
import { caseScope, clientScope } from "@/server/access";

// فهرست‌های انتخاب (با رعایت دامنه دسترسی کاربر)
export const GET = apiHandler(null, async (req, user) => {
  const u = new URL(req.url);
  const type = u.searchParams.get("type");
  const q = (u.searchParams.get("q") ?? "").trim();
  const en = toEnDigits(q);
  if (type === "user") {
    const rows = await db.user.findMany({
      where: { isActive: true, ...(u.searchParams.get("perm") ? { role: { permissions: { some: { permissionKey: String(u.searchParams.get("perm")) } } } } : {}), ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { username: { contains: en, mode: "insensitive" } }] } : {}) },
      select: { id: true, fullName: true, title: true, role: { select: { name: true } }, department: { select: { name: true } } }, orderBy: { fullName: "asc" }, take: 20,
    });
    return NextResponse.json({ items: rows.map((r) => ({ id: r.id, label: r.fullName, sub: [r.title ?? r.role.name, r.department?.name].filter(Boolean).join(" · ") })) });
  }
  if (type === "client") {
    if (!user.permissions.has("client.view")) return NextResponse.json({ items: [] });
    const rows = await db.client.findMany({
      where: { archivedAt: null, AND: [clientScope(user), q ? { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { nationalId: { contains: en } }, { mobile: { contains: en } }, { code: { contains: en, mode: "insensitive" } }] } : {}] },
      select: { id: true, displayName: true, code: true, nationalId: true }, orderBy: { updatedAt: "desc" }, take: 20,
    });
    return NextResponse.json({ items: rows.map((r) => ({ id: r.id, label: r.displayName, sub: [r.code, r.nationalId].filter(Boolean).join(" · ") })) });
  }
  if (type === "case") {
    if (!user.permissions.has("case.view")) return NextResponse.json({ items: [] });
    const clientId = u.searchParams.get("clientId");
    const rows = await db.case.findMany({
      where: { status: { not: "ARCHIVED" }, ...(clientId ? { clientId } : {}), AND: [caseScope(user), q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { number: { contains: en, mode: "insensitive" } }, { client: { displayName: { contains: q, mode: "insensitive" } } }] } : {}] },
      select: { id: true, title: true, number: true, client: { select: { displayName: true } } }, orderBy: { updatedAt: "desc" }, take: 20,
    });
    return NextResponse.json({ items: rows.map((r) => ({ id: r.id, label: r.title, sub: `${r.number} · ${r.client.displayName}` })) });
  }
  if (type === "department") {
    const rows = await db.department.findMany({ where: q ? { name: { contains: q, mode: "insensitive" } } : {}, orderBy: { name: "asc" }, take: 20 });
    return NextResponse.json({ items: rows.map((r) => ({ id: r.id, label: r.name })) });
  }
  return NextResponse.json({ items: [] });
});
