// کاتالوگ انواع دادخواست: جست‌وجو با نرمال‌سازی فارسی، پیشنهاد از روی پرونده، ویرایش و انتشار.
// کاربر عادی فقط انواع «منتشرشده» را می‌بیند؛ مدیر اسناد حقوقی (petition.manage) پیش‌نویس‌ها را هم می‌بیند و ویرایش می‌کند.
// ویرایش دستی editedAt را ثبت می‌کند تا seed بعدی آن را بازنویسی نکند.
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { assertCan, can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { normalizeFa } from "@/lib/text";
import { assertCaseAccess } from "../access";
import { evidenceRequired, PETITION_KINDS, PETITION_TYPE_STATUSES, toSpec } from "./data";
import { blankKeys } from "./render";

const MANAGE = "petition.manage";
const DEFAULT_TAKE = 60;
const MAX_TAKE = 200;
const SUGGEST_TAKE = 6;
const MIN_TOKEN = 2;
/** کمترین طول برای هم‌خوانی پیشوندی (مطالبه ↔ مطالبات) */
const PREFIX_MIN = 4;
const TITLE_WEIGHT = 3;
const KEYWORD_WEIGHT = 2;
const OTHER_WEIGHT = 1;
const TITLE_MIN = 3;
const TITLE_MAX = 200;
const CATEGORY_MIN = 2;
const CATEGORY_MAX = 100;
const TEXT_MAX = 4000;
const ITEM_MAX = 500;
const LIST_MAX = 60;
const BODY_MIN = 10;
const BODY_MAX = 20_000;

/** ترتیب نمایش: بدوی، اعتراضی، طاری */
const KIND_RANK: Record<string, number> = Object.fromEntries(PETITION_KINDS.map((k, i) => [k, i]));
const STOP_WORDS = new Set(["از", "به", "با", "در", "بر", "تا", "که", "را", "و", "یا", "این", "ان", "برای", "شده", "های", "می", "پرونده", "دعوی", "دعوا", "درخواست", "دادخواست", "علیه", "اقای", "خانم", "بابت", "موضوع", "مربوط", "حقوقی", "کیفری", "مالی", "غیرمالی"]);

export const CATALOG_SELECT = {
  id: true, code: true, title: true, kind: true, subKind: true, category: true, court: true, valueType: true, source: true, sourceLabel: true,
  status: true, keywords: true, deadlineRuleKey: true, articleRefs: true, formCode: true, editedAt: true, publishedAt: true, updatedAt: true,
} satisfies Prisma.PetitionTypeSelect;
export type CatalogRow = Prisma.PetitionTypeGetPayload<{ select: typeof CATALOG_SELECT }>;

export interface CatalogFilter { q?: string; kind?: string; category?: string; status?: string; take?: number }

const isStatus = (s: string | undefined): s is (typeof PETITION_TYPE_STATUSES)[number] => !!s && (PETITION_TYPE_STATUSES as readonly string[]).includes(s);

function visibleStatuses(user: SessionUser, status?: string): string[] {
  if (!can(user, MANAGE)) return ["PUBLISHED"];
  if (isStatus(status)) return [status];
  return ["PUBLISHED", "DRAFT"];
}

const tokensOf = (s: string): string[] => normalizeFa(s).split(" ").filter((t) => t.length >= MIN_TOKEN && !STOP_WORDS.has(t));
const byKindTitle = (a: CatalogRow, b: CatalogRow): number => (KIND_RANK[a.kind] ?? 0) - (KIND_RANK[b.kind] ?? 0) || a.title.localeCompare(b.title, "fa");

function scoreRow(row: CatalogRow, terms: string[]): number {
  const title = normalizeFa(row.title);
  const keywords = normalizeFa(row.keywords.join(" "));
  const other = normalizeFa(`${row.category} ${row.court ?? ""} ${row.code}`);
  const scores: number[] = terms.map((t) => (title.includes(t) ? TITLE_WEIGHT : 0) || (keywords.includes(t) ? KEYWORD_WEIGHT : 0) || (other.includes(t) ? OTHER_WEIGHT : 0));
  return scores.every((x) => x > 0) ? scores.reduce((a, b) => a + b, 0) : 0;
}

/** فهرست انواع دادخواست؛ با q همه واژه‌ها باید در عنوان، کلیدواژه‌ها یا دسته یافت شوند (ترتیب بر پایه هم‌خوانی عنوان) */
export async function listPetitionTypes(user: SessionUser, f: CatalogFilter = {}): Promise<CatalogRow[]> {
  const take = Math.min(f.take ?? DEFAULT_TAKE, MAX_TAKE);
  const rows = await db.petitionType.findMany({
    where: { status: { in: visibleStatuses(user, f.status) }, ...(f.kind ? { kind: f.kind } : {}), ...(f.category ? { category: f.category } : {}) },
    select: CATALOG_SELECT,
  });
  const terms = normalizeFa(f.q).split(" ").filter(Boolean);
  if (!terms.length) return [...rows].sort(byKindTitle).slice(0, take);
  return rows
    .map((row) => ({ row, score: scoreRow(row, terms) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || byKindTitle(a.row, b.row))
    .slice(0, take)
    .map((x) => x.row);
}

/** شمار انواع به تفکیک نوع (بدوی/اعتراضی/طاری) و دسته، برای زبانه‌ها و پالایه‌ها */
export async function catalogFacets(user: SessionUser): Promise<{ kinds: Record<string, number>; categories: { kind: string; category: string; count: number }[] }> {
  const groups = await db.petitionType.groupBy({ by: ["kind", "category"], where: { status: { in: visibleStatuses(user) } }, _count: { _all: true } });
  const categories = groups.map((g) => ({ kind: g.kind, category: g.category, count: g._count._all })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, "fa"));
  const kinds = Object.fromEntries(PETITION_KINDS.map((k) => [k, categories.filter((c) => c.kind === k).reduce((n, c) => n + c.count, 0)]));
  return { kinds, categories };
}

/** یک نوع دادخواست کامل؛ پیش‌نویس و بایگانی‌شده فقط برای مدیر */
export async function getPetitionType(id: string, user: SessionUser) {
  const row = await db.petitionType.findUnique({ where: { id } });
  if (!row || (row.status !== "PUBLISHED" && !can(user, MANAGE))) throw new NotFoundError("نوع دادخواست یافت نشد.");
  return row;
}

export interface Suggestion { row: CatalogRow; matched: string[]; score: number }

const tokenMatches = (caseTokens: string[], t: string): boolean =>
  caseTokens.includes(t) || (t.length >= PREFIX_MIN && caseTokens.some((c) => c.length >= PREFIX_MIN && (c.startsWith(t) || t.startsWith(c))));

/** پیشنهاد نوع دادخواست از روی عنوان، دسته و شرح پرونده (هم‌خوانی واژه‌های عنوان و کلیدواژه‌های هر نوع) */
export async function suggestPetitionTypes(user: SessionUser, caseId: string, take = SUGGEST_TAKE): Promise<Suggestion[]> {
  await assertCaseAccess(user, caseId);
  const c = await db.case.findUniqueOrThrow({ where: { id: caseId }, select: { title: true, category: true, description: true } });
  const caseTokens = [...new Set(tokensOf([c.title, c.category, c.description ?? ""].join(" ")))];
  const rows = await db.petitionType.findMany({ where: { status: "PUBLISHED" }, select: CATALOG_SELECT });
  return rows
    .map((row) => {
      const matched = [...new Set(tokensOf([row.title, ...row.keywords].join(" ")))].filter((t) => tokenMatches(caseTokens, t));
      return { row, matched, score: matched.length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || byKindTitle(a.row, b.row))
    .slice(0, take);
}

const optionalText = z.string().trim().max(TEXT_MAX).optional().transform((v) => v || null);
const list = z.array(z.string().trim().min(1).max(ITEM_MAX)).max(LIST_MAX).default([]);

export const petitionTypeUpdateSchema = z.object({
  version: z.number().int().min(1),
  title: z.string().trim().min(TITLE_MIN, "عنوان دست‌کم ۳ نویسه است.").max(TITLE_MAX),
  kind: z.enum(PETITION_KINDS),
  category: z.string().trim().min(CATEGORY_MIN).max(CATEGORY_MAX),
  court: optionalText,
  courtBasis: optionalText,
  eligible: optionalText,
  defendant: optionalText,
  notes: optionalText,
  // گزینه «بدون نوع» در فرم ویرایش رشته خالی می‌فرستد
  valueType: z.preprocess((v) => (v === "" ? null : v), z.enum(["MALI", "GHEIR_MALI", "BY_SUBJECT"]).nullable().default(null)),
  evidence: list,
  evidenceInfo: list,
  fees: list,
  investigations: list,
  ancillary: list,
  keywords: list,
  bodyTemplate: z.string().trim().min(BODY_MIN, "متن شرح خواسته خالی است.").max(BODY_MAX),
});

/** ویرایش دستی نوع دادخواست (قفل خوش‌بینانه با version)؛ جاهای خالی از روی متن جدید بازسازی می‌شوند */
export async function updatePetitionType(id: string, input: z.infer<typeof petitionTypeUpdateSchema>, user: SessionUser) {
  assertCan(user, MANAGE);
  const prev = await db.petitionType.findUnique({ where: { id } });
  if (!prev) throw new NotFoundError("نوع دادخواست یافت نشد.");
  const spec = toSpec(prev);
  const labels = new Map(spec.blanks.map((b) => [b.key, b.label]));
  const blanks = blankKeys(input.bodyTemplate).map((key) => ({ key, label: labels.get(key) ?? key }));
  const requirements = prev.source === "LAW" ? (prev.requirements as Prisma.InputJsonValue) : input.evidence.map((label) => ({ label, required: evidenceRequired(spec, label) }));
  const { version, ...fields } = input;
  const changed = Object.keys(fields).filter((k) => JSON.stringify(fields[k as keyof typeof fields]) !== JSON.stringify(prev[k as keyof typeof prev]));
  const r = await db.petitionType.updateMany({ where: { id, version }, data: { ...fields, blanks, requirements, editedAt: new Date(), version: { increment: 1 } } });
  if (!r.count) throw new ConflictError();
  await audit({ actorId: user.id, action: "petition_type.updated", entityType: "PetitionType", entityId: id, entityLabel: input.title, meta: { changed } });
  return { version: version + 1 };
}

const STATUS_ACTIONS: Record<(typeof PETITION_TYPE_STATUSES)[number], string> = { PUBLISHED: "petition_type.published", ARCHIVED: "petition_type.archived", DRAFT: "petition_type.unpublished" };

export async function setPetitionTypeStatus(id: string, status: (typeof PETITION_TYPE_STATUSES)[number], user: SessionUser) {
  assertCan(user, MANAGE);
  const prev = await db.petitionType.findUnique({ where: { id } });
  if (!prev) throw new NotFoundError("نوع دادخواست یافت نشد.");
  if (status === "PUBLISHED" && (!prev.title.trim() || !prev.bodyTemplate.trim() || !prev.category.trim())) throw new AppError("پیش از انتشار، عنوان، دسته و متن شرح خواسته را کامل کنید.");
  await db.petitionType.update({ where: { id }, data: { status, ...(status === "PUBLISHED" ? { publishedAt: new Date(), publishedById: user.id } : {}) } });
  await audit({ actorId: user.id, action: STATUS_ACTIONS[status], entityType: "PetitionType", entityId: id, entityLabel: prev.title, meta: { from: prev.status, to: status } });
}
