// کتابخانه حقوقی داخلی دفتر و سوابق پژوهش. متن هر منبع با نشانی و تاریخ بازیابی ثبت می‌شود و تا تطبیق با منبع
// رسمی توسط مسئول مجاز «تأییدنشده» می‌ماند؛ هر ویرایش متن، تأیید قبلی را باطل می‌کند. هیچ متن قانونی پیش‌فرضی ساخته نمی‌شود.
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { parseJalaliDateOnly } from "@/lib/jalali";
import { normalizeFa } from "@/lib/text";
import { assertCan, can, type SessionUser } from "@/lib/auth/guard";
import { assertCaseAccess, caseScope } from "@/server/access";

export const SOURCE_KINDS: Record<string, string> = {
  LAW: "قانون", REGULATION: "آیین‌نامه / مقررات", UNIFORM_PRECEDENT: "رأی وحدت رویه", ADVISORY_OPINION: "نظریه مشورتی",
  CIRCULAR: "بخشنامه / دستورالعمل", JUDGMENT: "رأی دادگاه", ARTICLE: "کتاب / مقاله", OTHER: "سایر",
};

const MAX_TITLE = 300;
const MAX_TEXT = 400_000;
const MAX_REF = 200;
const MAX_NOTE = 2_000;
const MAX_SNIPPET = 1_000;
const SEARCH_LIMIT = 30;
const SNIPPET_RADIUS = 160;
const SNIPPET_SPAN = 320;
const MIN_TITLE = 3;
const MIN_TEXT = 10;

export const legalSourceSchema = z.object({
  id: z.string().optional().transform((v) => v || null),
  kind: z.string().refine((v) => v in SOURCE_KINDS, "نوع منبع نامعتبر است."),
  title: z.string().trim().min(MIN_TITLE, "عنوان را وارد کنید.").max(MAX_TITLE),
  reference: z.string().trim().max(MAX_REF).optional().transform((v) => v || null),
  articleNo: z.string().trim().max(MAX_REF).optional().transform((v) => v || null),
  text: z.string().trim().min(MIN_TEXT, "متن منبع را وارد کنید.").max(MAX_TEXT),
  sourceName: z.string().trim().max(MAX_REF).optional().transform((v) => v || null),
  sourceUrl: z.string().trim().max(MAX_TITLE).optional().transform((v) => v || null).refine((v) => !v || v.startsWith("http"), "نشانی منبع معتبر نیست."),
  retrievedAt: z.string().trim().optional().transform((v) => v || null),
  tags: z.array(z.string().trim().max(MAX_REF)).default([]),
});

export async function saveLegalSource(input: z.infer<typeof legalSourceSchema>, user: SessionUser): Promise<{ id: string }> {
  assertCan(user, "legal_source.manage");
  const retrievedAt = input.retrievedAt ? parseJalaliDateOnly(input.retrievedAt) : null;
  if (input.retrievedAt && !retrievedAt) throw new AppError("تاریخ بازیابی معتبر نیست.", "VALIDATION", undefined, { retrievedAt: "تاریخ شمسی معتبر وارد کنید." });
  const data = {
    kind: input.kind, title: input.title, reference: input.reference, articleNo: input.articleNo, text: input.text,
    sourceName: input.sourceName, sourceUrl: input.sourceUrl, retrievedAt, tags: input.tags,
  };
  if (input.id) {
    const prev = await db.legalSource.findUnique({ where: { id: input.id } });
    if (!prev) throw new NotFoundError();
    const textChanged = prev.text !== input.text || prev.articleNo !== input.articleNo || prev.reference !== input.reference;
    await db.legalSource.update({ where: { id: input.id }, data: { ...data, ...(textChanged ? { verified: false, verifiedAt: null, verifiedById: null } : {}) } });
    await audit({ actorId: user.id, action: "legal_source.updated", entityType: "LegalSource", entityId: input.id, entityLabel: input.title, meta: { verificationReset: textChanged && prev.verified } });
    return { id: input.id };
  }
  const s = await db.legalSource.create({ data: { ...data, createdById: user.id } });
  await audit({ actorId: user.id, action: "legal_source.created", entityType: "LegalSource", entityId: s.id, entityLabel: s.title });
  return { id: s.id };
}

export async function verifyLegalSource(id: string, verified: boolean, user: SessionUser): Promise<void> {
  assertCan(user, "legal_source.manage");
  const s = await db.legalSource.findUnique({ where: { id } });
  if (!s) throw new NotFoundError();
  if (verified && (!s.sourceUrl && !s.sourceName)) throw new AppError("برای تأیید، نام یا نشانی منبع رسمی را ثبت کنید.");
  if (verified && !s.retrievedAt) throw new AppError("برای تأیید، تاریخ بازیابی متن از منبع رسمی را ثبت کنید.");
  await db.legalSource.update({ where: { id }, data: verified ? { verified: true, verifiedAt: new Date(), verifiedById: user.id } : { verified: false, verifiedAt: null, verifiedById: null } });
  await audit({ actorId: user.id, action: verified ? "legal_source.verified" : "legal_source.unverified", entityType: "LegalSource", entityId: id, entityLabel: s.title });
}

export async function deleteLegalSource(id: string, user: SessionUser): Promise<void> {
  assertCan(user, "legal_source.manage");
  const s = await db.legalSource.findUnique({ where: { id }, include: { _count: { select: { draftSources: true } } } });
  if (!s) throw new NotFoundError();
  if (s._count.draftSources) throw new AppError("این منبع در اسناد حقوقی استناد شده است و حذف نمی‌شود؛ می‌توانید تأیید آن را لغو کنید.");
  await db.legalSource.delete({ where: { id } });
  await audit({ actorId: user.id, action: "legal_source.deleted", entityType: "LegalSource", entityId: id, entityLabel: s.title });
}

/** بریده‌ای از متن پیرامون نخستین واژه یافت‌شده */
export function snippetAround(text: string, query: string): string {
  const norm = normalizeFa(text);
  const words = normalizeFa(query).split(" ").filter((w) => w.length > 1);
  const pos = words.map((w) => norm.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, pos - SNIPPET_RADIUS);
  return `${start > 0 ? "…" : ""}${text.slice(start, start + SNIPPET_SPAN).split("\n").join(" ")}${text.length > start + SNIPPET_SPAN ? "…" : ""}`;
}

export async function searchLibrary(query: string, opts: { kind?: string; verified?: boolean } = {}) {
  const q = query.trim();
  const words = q.split(" ").map((w) => w.trim()).filter((w) => w.length > 1);
  const where: Prisma.LegalSourceWhereInput = {
    ...(opts.kind ? { kind: opts.kind } : {}),
    ...(opts.verified !== undefined ? { verified: opts.verified } : {}),
    ...(words.length ? { AND: words.map((w) => ({ OR: [{ title: { contains: w, mode: "insensitive" as const } }, { text: { contains: w, mode: "insensitive" as const } }, { reference: { contains: w, mode: "insensitive" as const } }, { articleNo: { contains: w } }, { tags: { has: w } }] })) } : {}),
  };
  const rows = await db.legalSource.findMany({ where, orderBy: [{ verified: "desc" }, { updatedAt: "desc" }], take: SEARCH_LIMIT });
  return rows.map((r) => ({ ...r, snippet: snippetAround(r.text, q) }));
}

// ───────── سوابق پژوهش ─────────

export const researchSchema = z.object({
  query: z.string().trim().max(MAX_REF).default(""),
  caseId: z.string().min(1, "پرونده را انتخاب کنید."),
  title: z.string().trim().min(1).max(MAX_TITLE),
  snippet: z.string().trim().max(MAX_SNIPPET).optional().transform((v) => v || null),
  source: z.string().trim().min(1).max(MAX_REF),
  sourceUrl: z.string().trim().max(MAX_TITLE).optional().transform((v) => v || null),
  category: z.string().trim().max(MAX_REF).optional().transform((v) => v || null),
  note: z.string().trim().max(MAX_NOTE).optional().transform((v) => v || null),
  retrievedAt: z.string().optional().transform((v) => (v ? new Date(v) : new Date())),
});

export async function saveResearch(input: z.infer<typeof researchSchema>, user: SessionUser): Promise<{ id: string }> {
  assertCan(user, "research.use");
  const c = await assertCaseAccess(user, input.caseId);
  const r = await db.researchRecord.create({
    data: { userId: user.id, query: input.query, caseId: input.caseId, title: input.title, snippet: input.snippet, source: input.source, sourceUrl: input.sourceUrl, category: input.category, note: input.note, retrievedAt: Number.isNaN(input.retrievedAt.getTime()) ? new Date() : input.retrievedAt },
  });
  await audit({ actorId: user.id, action: "research.saved", entityType: "ResearchRecord", entityId: r.id, entityLabel: input.title, caseId: c.id, meta: { source: input.source } });
  return { id: r.id };
}

export async function deleteResearch(id: string, user: SessionUser): Promise<void> {
  const r = await db.researchRecord.findUnique({ where: { id } });
  if (!r) throw new NotFoundError();
  if (r.userId !== user.id && !can(user, "case.view_all")) throw new NotFoundError();
  await db.researchRecord.delete({ where: { id } });
  await audit({ actorId: user.id, action: "research.deleted", entityType: "ResearchRecord", entityId: id, entityLabel: r.title, caseId: r.caseId });
}

export async function listResearch(user: SessionUser, opts: { caseId?: string; q?: string; take: number }) {
  return db.researchRecord.findMany({
    where: {
      ...(opts.caseId ? { caseId: opts.caseId } : {}),
      AND: [
        { OR: [{ userId: user.id }, { case: caseScope(user) }] },
        ...(opts.q ? [{ OR: [{ title: { contains: opts.q, mode: "insensitive" as const } }, { snippet: { contains: opts.q, mode: "insensitive" as const } }, { query: { contains: opts.q, mode: "insensitive" as const } }] }] : []),
      ],
    },
    orderBy: { createdAt: "desc" }, take: opts.take,
    include: { case: { select: { id: true, number: true, title: true } } },
  });
}
