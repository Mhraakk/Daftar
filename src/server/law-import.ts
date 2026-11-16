// ورود قانونِ استخراج‌شده (خروجی scripts/acp/extract_acp.py) به کتابخانه حقوقی دفتر.
// اجرای مکرر امن است: ماده بی‌تغییر دست نمی‌خورد؛ تغییر متن یا وضعیت یک ماده، تأیید آن ماده و تأیید نسخه قانون را باطل می‌کند.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import { audit } from "@/lib/audit";
import { SOURCE_STATUS } from "@/lib/labels";
import { sha256, storage } from "@/lib/storage";

export interface ExtractedArticle {
  no: number;
  heading: string[];
  status: string;
  statusNote: string | null;
  text: string;
  notes: number;
  pages: number[];
}

export interface ExtractedLaw {
  source: { title: string; shortTitle: string; approvedAt: string; file: string; sha256: string; pages: number; extractedAt: string; note: string };
  headings: { level: string; title: string; page: number; firstArticle: number | null }[];
  articles: ExtractedArticle[];
  closing: string;
}

export interface ImportResult { lawCode: string; created: number; updated: number; unchanged: number; verificationReset: number; keptManualEdits: number; sourceStored: boolean }

export const ACP_IMPORT = {
  code: "ACP",
  jsonPath: path.resolve("prisma/seed-data/acp/articles.json"),
  pdfPath: path.resolve("prisma/seed-data/acp/source.pdf"),
};

export const LAW_SOURCE_NAME = "PDF ارائه‌شده دفتر (ناشر خصوصی؛ نه روزنامه رسمی)";
const TAG_LEVELS = 2;
const SHA_PREFIX = 12;

export function validateExtractedLaw(data: ExtractedLaw): string[] {
  const problems: string[] = [];
  const numbers = data.articles.map((a) => a.no);
  const unique = new Set(numbers);
  if (!data.articles.length) problems.push("هیچ ماده‌ای در فایل نیست.");
  if (unique.size !== numbers.length) problems.push("شماره ماده تکراری در فایل هست.");
  const max = Math.max(...numbers);
  const missing = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !unique.has(n));
  if (missing.length) problems.push(`مواد ناموجود: ${missing.join("، ")}`);
  data.articles.filter((a) => !a.text.trim()).forEach((a) => problems.push(`متن ماده ${a.no} خالی است.`));
  data.articles.filter((a) => !(a.status in SOURCE_STATUS)).forEach((a) => problems.push(`وضعیت ناشناخته در ماده ${a.no}: ${a.status}`));
  return problems;
}

function articleData(law: ExtractedLaw, code: string, a: ExtractedArticle): Prisma.LegalSourceUncheckedCreateInput {
  return {
    kind: "LAW",
    title: `ماده ${a.no} ${law.source.shortTitle}`,
    reference: law.source.title,
    articleNo: String(a.no),
    text: a.text,
    sourceName: LAW_SOURCE_NAME,
    retrievedAt: new Date(law.source.extractedAt),
    tags: [law.source.shortTitle, ...a.heading.slice(-TAG_LEVELS)],
    lawCode: code,
    orderNo: a.no,
    status: a.status,
    statusNote: a.statusNote,
    headingPath: a.heading,
    sourcePages: a.pages,
  };
}

async function storeSource(pdfPath: string | undefined, code: string): Promise<{ key: string; sha: string } | null> {
  if (!pdfPath || !existsSync(pdfPath)) return null;
  const bytes = await readFile(pdfPath);
  const sha = sha256(bytes);
  const key = `library/laws/${code}-${sha.slice(0, SHA_PREFIX)}.pdf`;
  if (!(await storage.exists(key))) await storage.put(key, bytes);
  return { key, sha };
}

type Outcome = "created" | "updated" | "reset" | "unchanged" | "kept";
type ExistingArticle = Awaited<ReturnType<PrismaClient["legalSource"]["findMany"]>>[number];

async function upsertArticle(db: PrismaClient, row: Prisma.LegalSourceUncheckedCreateInput, prev: ExistingArticle | undefined, actorId: string | null): Promise<Outcome> {
  if (!prev) {
    await db.legalSource.create({ data: { ...row, createdById: actorId } });
    return "created";
  }
  const contentChanged = prev.text !== row.text || prev.status !== row.status;
  if (contentChanged && prev.editedAt) return "kept";
  const metaChanged = prev.headingPath.join("|") !== (row.headingPath as string[]).join("|")
    || prev.sourcePages.join(",") !== (row.sourcePages as number[]).join(",") || prev.statusNote !== row.statusNote;
  if (!contentChanged && !metaChanged) return "unchanged";
  await db.legalSource.update({ where: { id: prev.id }, data: { ...row, ...(contentChanged ? { verified: false, verifiedAt: null, verifiedById: null } : {}) } });
  return contentChanged && prev.verified ? "reset" : "updated";
}

/** ورود یا به‌روزرسانی یک قانون کامل؛ db را از بیرون می‌گیرد تا در seed و سرور هر دو قابل استفاده باشد. */
export async function importLaw(db: PrismaClient, opts: { code: string; jsonPath: string; pdfPath?: string; actorId?: string | null }): Promise<ImportResult> {
  const data = JSON.parse(await readFile(opts.jsonPath, "utf8")) as ExtractedLaw;
  const problems = validateExtractedLaw(data);
  if (problems.length) throw new Error(`فایل قانون معتبر نیست: ${problems.join(" | ")}`);
  const source = await storeSource(opts.pdfPath, opts.code);
  if (source && source.sha !== data.source.sha256) throw new Error("فایل PDF با فایلی که متن از آن استخراج شده یکی نیست (sha256 متفاوت).");

  const lawFields = {
    title: data.source.title, shortTitle: data.source.shortTitle, approvedAt: data.source.approvedAt, sourceName: LAW_SOURCE_NAME,
    sourceSha256: data.source.sha256, sourceFileKey: source?.key ?? null, headings: data.headings as unknown as Prisma.InputJsonValue,
    closing: data.closing, articleCount: data.articles.length, importedAt: new Date(),
  };
  const before = await db.law.findUnique({ where: { code: opts.code } });
  await db.law.upsert({ where: { code: opts.code }, create: { code: opts.code, ...lawFields }, update: lawFields });

  const existing = new Map((await db.legalSource.findMany({ where: { lawCode: opts.code } })).map((r) => [r.articleNo, r]));
  const outcomes = await data.articles.reduce<Promise<Outcome[]>>(async (done, a) => {
    const list = await done;
    list.push(await upsertArticle(db, articleData(data, opts.code, a), existing.get(String(a.no)), opts.actorId ?? null));
    return list;
  }, Promise.resolve([]));
  const tally = {
    created: outcomes.filter((o) => o === "created").length,
    updated: outcomes.filter((o) => o === "updated" || o === "reset").length,
    unchanged: outcomes.filter((o) => o === "unchanged").length,
    verificationReset: outcomes.filter((o) => o === "reset").length,
    keptManualEdits: outcomes.filter((o) => o === "kept").length,
  };
  const sourceChanged = !!before && before.sourceSha256 !== data.source.sha256;
  if (tally.verificationReset || sourceChanged || tally.created) await db.law.update({ where: { code: opts.code }, data: { verifiedAt: null, verifiedById: null } });
  await audit({ actorId: opts.actorId ?? null, action: "law.imported", entityType: "Law", entityId: opts.code, entityLabel: data.source.title, meta: { ...tally, sha256: data.source.sha256 } });
  return { lawCode: opts.code, ...tally, sourceStored: !!source };
}
