// بارگذاری انواع دادخواست پایه: ۲۹ فرم نمونه دفتر (prisma/seed-data/petitions/forms.json) و انواع اعتراضی/طاری
// برگرفته از متن قانون. اجرای مکرر امن است؛ نوعی که دستی ویرایش شده (editedAt) بازنویسی نمی‌شود.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import { storage } from "@/lib/storage";
import type { ParsedForm } from "./form-parser";
import { formFileKey, petitionTypeData } from "./import-form";
import { LAW_PETITION_TYPES, type LawPetitionType } from "./law-types";

export const FORMS_JSON = path.resolve("prisma/seed-data/petitions/forms.json");
export const FORMS_DIR = path.resolve("prisma/seed-data/petitions/forms");
export const FORM_SOURCE_LABEL = "نمونه فرم ارائه‌شده دفتر (فرم دادخواست خدمات قضایی Fk01/00)";
export const LAW_SOURCE_LABEL = "برگرفته از متن قانون — تا دریافت فرم رسمی";

const KEYWORD_MIN = 3;

interface FormEntry { code: string; sha256: string; sourceFile: string; parsed: ParsedForm }

function lawTypeData(t: LawPetitionType): Omit<Prisma.PetitionTypeUncheckedCreateInput, "code" | "source" | "status"> {
  return {
    title: t.title, kind: t.kind, subKind: t.subKind, category: t.category, court: t.court, courtBasis: t.courtBasis,
    valueType: null, evidence: t.evidence, requirements: t.requirements as unknown as Prisma.InputJsonValue,
    ancillary: t.ancillary, investigations: t.investigations, bodyTemplate: t.bodyTemplate, notes: t.notes,
    lawCode: "ACP", articleRefs: t.articleRefs, deadlineRuleKey: t.deadlineRuleKey,
    keywords: t.title.split(" ").filter((w) => w.length >= KEYWORD_MIN), sourceLabel: LAW_SOURCE_LABEL,
  };
}

async function upsertType(db: PrismaClient, code: string, source: string, data: Omit<Prisma.PetitionTypeUncheckedCreateInput, "code" | "source" | "status">): Promise<"created" | "updated" | "kept"> {
  const prev = await db.petitionType.findUnique({ where: { code }, select: { id: true, editedAt: true } });
  if (!prev) {
    await db.petitionType.create({ data: { ...data, code, source, status: "PUBLISHED", publishedAt: new Date() } });
    return "created";
  }
  if (prev.editedAt) return "kept";
  await db.petitionType.update({ where: { code }, data: { ...data, source } });
  return "updated";
}

export async function seedPetitionTypes(db: PrismaClient): Promise<Record<string, number>> {
  const forms = existsSync(FORMS_JSON) ? (JSON.parse(await readFile(FORMS_JSON, "utf8")) as { forms: FormEntry[] }).forms : [];
  const formResults = await forms.reduce<Promise<string[]>>(async (done, f) => {
    const list = await done;
    const file = path.join(FORMS_DIR, `${f.code}.pdf`);
    const key = formFileKey(f.sha256);
    if (existsSync(file) && !(await storage.exists(key))) await storage.put(key, await readFile(file));
    const data = { ...petitionTypeData(f.parsed), sourceLabel: FORM_SOURCE_LABEL, sourceFileKey: key, sourceFileName: f.sourceFile, sourceSha256: f.sha256 };
    return [...list, await upsertType(db, f.code, "FORM", data)];
  }, Promise.resolve([]));
  const lawResults = await LAW_PETITION_TYPES.reduce<Promise<string[]>>(async (done, t) => [...(await done), await upsertType(db, t.code, "LAW", lawTypeData(t))], Promise.resolve([]));
  const all = [...formResults, ...lawResults];
  return { forms: forms.length, law: LAW_PETITION_TYPES.length, created: all.filter((r) => r === "created").length, updated: all.filter((r) => r === "updated").length, kept: all.filter((r) => r === "kept").length };
}
