import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit, diff } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError, ConflictError, ForbiddenError } from "@/lib/errors";
import { parseJalaliDateOnly } from "@/lib/jalali";
import { nextNumber } from "@/lib/numbering";
import { isValidLegalId, isValidMobile, isValidNationalId, normalizeFa, toEnDigits } from "@/lib/text";
import { assertClientAccess, clientScope } from "./access";
import { indexEntity } from "./search-index";

const opt = z.string().trim().max(500).optional().transform((v) => (v ? v : null));

export const clientSchema = z
  .object({
    type: z.enum(["PERSON", "LEGAL"]),
    firstName: opt, lastName: opt, companyName: opt, fatherName: opt,
    nationalId: z.string().trim().optional().transform((v) => (v ? toEnDigits(v) : null)),
    birthDate: z.string().trim().optional().transform((v) => v || null),
    mobile: z.string().trim().optional().transform((v) => (v ? toEnDigits(v) : null)),
    phone: z.string().trim().max(30).optional().transform((v) => (v ? toEnDigits(v) : null)),
    email: z.string().trim().optional().transform((v) => v || null),
    address: opt,
    postalCode: z.string().trim().optional().transform((v) => (v ? toEnDigits(v) : null)),
    notes: z.string().trim().max(4000).optional().transform((v) => v || null),
    assignedToId: z.string().optional().transform((v) => v || null),
  })
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (v.type === "PERSON") {
      if (!v.firstName) add("firstName", "نام الزامی است.");
      if (!v.lastName) add("lastName", "نام خانوادگی الزامی است.");
      if (v.nationalId && !isValidNationalId(v.nationalId)) add("nationalId", "کد ملی معتبر نیست.");
    } else {
      if (!v.companyName) add("companyName", "نام شخص حقوقی الزامی است.");
      if (v.nationalId && !isValidLegalId(v.nationalId)) add("nationalId", "شناسه ملی معتبر نیست.");
    }
    if (v.mobile && !isValidMobile(v.mobile)) add("mobile", "شماره همراه باید به شکل ۰۹xxxxxxxxx باشد.");
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) add("email", "نشانی ایمیل معتبر نیست.");
    if (v.postalCode && !/^\d{10}$/.test(v.postalCode)) add("postalCode", "کد پستی باید ۱۰ رقم باشد.");
    if (v.birthDate && !parseJalaliDateOnly(v.birthDate)) add("birthDate", "تاریخ تولد معتبر نیست.");
  });
export type ClientInput = z.infer<typeof clientSchema>;

const displayNameOf = (v: ClientInput) => (v.type === "PERSON" ? `${v.firstName} ${v.lastName}`.trim() : v.companyName!);

async function reindex(id: string) {
  const c = await db.client.findUnique({ where: { id } });
  if (!c) return;
  await indexEntity({
    entityType: "client", entityId: c.id, title: c.displayName,
    subtitle: [c.code, c.nationalId, c.mobile].filter(Boolean).join(" · "),
    body: [c.fatherName, c.phone, c.email, c.address, c.notes].filter(Boolean).join(" "),
    clientId: c.id, link: `/clients/${c.id}`,
  });
}

/** جست‌وجوی سوابق مشابه برای جلوگیری از ثبت تکراری */
export async function findSimilarClients(q: { nationalId?: string | null; mobile?: string | null; name?: string | null }, excludeId?: string) {
  const or: Prisma.ClientWhereInput[] = [];
  if (q.nationalId) or.push({ nationalId: toEnDigits(q.nationalId) });
  if (q.mobile) or.push({ mobile: toEnDigits(q.mobile) });
  if (q.name && q.name.trim().length >= 3) or.push({ displayName: { contains: q.name.trim(), mode: "insensitive" } });
  if (!or.length) return [];
  return db.client.findMany({
    where: { OR: or, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true, code: true, displayName: true, nationalId: true, mobile: true, archivedAt: true },
    take: 5,
  });
}

export async function createClient(input: ClientInput, user: SessionUser) {
  if (input.nationalId) {
    const dup = await db.client.findUnique({ where: { nationalId: input.nationalId }, select: { code: true, displayName: true } });
    if (dup) throw new AppError(`مراجعه‌کننده‌ای با این کد/شناسه ملی قبلاً ثبت شده است: ${dup.displayName} (${dup.code})`, "DUPLICATE", 409, { nationalId: "تکراری است." });
  }
  const client = await db.$transaction(async (tx) => {
    const code = await nextNumber("CLIENT", tx);
    const c = await tx.client.create({
      data: {
        code, type: input.type, firstName: input.firstName, lastName: input.lastName, companyName: input.companyName,
        displayName: displayNameOf(input), nationalId: input.nationalId, fatherName: input.fatherName,
        birthDate: input.birthDate ? parseJalaliDateOnly(input.birthDate) : null, mobile: input.mobile, phone: input.phone, email: input.email,
        address: input.address, postalCode: input.postalCode, notes: input.notes,
        assignedToId: input.assignedToId ?? user.id, createdById: user.id,
      },
    });
    await audit({ actorId: user.id, action: "client.created", entityType: "Client", entityId: c.id, entityLabel: `${c.displayName} (${c.code})`, clientId: c.id }, tx);
    return c;
  });
  await reindex(client.id);
  return { id: client.id, code: client.code };
}

export async function updateClient(id: string, version: number, input: ClientInput, user: SessionUser) {
  await assertClientAccess(user, id);
  const before = await db.client.findUniqueOrThrow({ where: { id } });
  if (before.archivedAt) throw new AppError("مراجعه‌کننده بایگانی‌شده قابل ویرایش نیست.");
  if (input.nationalId && input.nationalId !== before.nationalId) {
    const dup = await db.client.findUnique({ where: { nationalId: input.nationalId } });
    if (dup) throw new AppError("این کد/شناسه ملی برای مراجعه‌کننده دیگری ثبت شده است.", "DUPLICATE", 409, { nationalId: "تکراری است." });
  }
  const data = {
    type: input.type, firstName: input.firstName, lastName: input.lastName, companyName: input.companyName,
    displayName: displayNameOf(input), nationalId: input.nationalId, fatherName: input.fatherName,
    birthDate: input.birthDate ? parseJalaliDateOnly(input.birthDate) : null, mobile: input.mobile, phone: input.phone, email: input.email,
    address: input.address, postalCode: input.postalCode, notes: input.notes, assignedToId: input.assignedToId ?? before.assignedToId,
  };
  await db.$transaction(async (tx) => {
    const r = await tx.client.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
    if (r.count === 0) throw new ConflictError();
    await audit({
      actorId: user.id, action: "client.updated", entityType: "Client", entityId: id, entityLabel: `${data.displayName} (${before.code})`, clientId: id,
      meta: { changes: diff(before as never, data as never, Object.keys(data) as never) },
    }, tx);
  });
  await reindex(id);
}

export async function setClientArchived(id: string, archived: boolean, user: SessionUser) {
  if (!can(user, "client.archive")) throw new ForbiddenError();
  const c = await assertClientAccess(user, id);
  if (archived) {
    const open = await db.case.count({ where: { clientId: id, status: { notIn: ["CLOSED", "ARCHIVED"] } } });
    if (open > 0) throw new AppError("این مراجعه‌کننده پرونده باز دارد؛ ابتدا پرونده‌ها را مختومه کنید.");
  }
  await db.$transaction(async (tx) => {
    await tx.client.update({ where: { id }, data: { archivedAt: archived ? new Date() : null, version: { increment: 1 } } });
    await audit({ actorId: user.id, action: archived ? "client.archived" : "client.restored", entityType: "Client", entityId: id, entityLabel: `${c.displayName} (${c.code})`, clientId: id }, tx);
  });
}

export async function listClients(user: SessionUser, p: { q?: string; type?: string; state?: string; page: number; pageSize: number }) {
  const and: Prisma.ClientWhereInput[] = [clientScope(user)];
  and.push(p.state === "archived" ? { archivedAt: { not: null } } : p.state === "all" ? {} : { archivedAt: null });
  if (p.type === "PERSON" || p.type === "LEGAL") and.push({ type: p.type });
  if (p.q) {
    const q = p.q.trim();
    const en = toEnDigits(q);
    and.push({
      OR: [
        { displayName: { contains: q, mode: "insensitive" } },
        { nationalId: { contains: en } }, { mobile: { contains: en } }, { code: { contains: en, mode: "insensitive" } },
        { displayName: { contains: normalizeFa(q), mode: "insensitive" } },
      ],
    });
  }
  const where = { AND: and };
  const [total, rows] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize,
      include: { _count: { select: { cases: true, documents: true } } },
    }),
  ]);
  return { total, rows };
}
