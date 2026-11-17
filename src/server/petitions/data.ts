// داده ساخت‌یافته دادخواست (LegalDraft.petitionData) و نمای نوع دادخواست برای اعتبارسنجی و ساخت برگ.
// طرفین به ترتیب ماده ۵۱ ق.آ.د.م، خواسته و بها، دلایل و گواهان، مرجع رسیدگی، رأی مورد اعتراض یا پرونده اصلی،
// و مقدار جاهای خالی شرح خواسته. این فایل فقط به zod وابسته است تا استودیوی دادخواست در مرورگر هم همین طرح را بخواند.
import { z } from "zod";
import type { Blank, EvidenceItem, OptionalClause, ValueOption } from "./form-parser";
import type { LawRequirement } from "./law-types";

const TINY = 40;
const SHORT = 200;
const LONG = 2000;
const BODY = 20_000;
const MAX_PARTIES = 30;
const MAX_ITEMS = 60;

const text = (max: number) => z.string().trim().max(max).default("");

export const PARTY_TYPES = ["PERSON", "LEGAL"] as const;
export const REPRESENTATIVE_KINDS = ["LAWYER", "AGENT", "GUARDIAN"] as const;
export const VALUE_TYPES = ["MALI", "GHEIR_MALI"] as const;
export const PETITION_KINDS = ["INITIAL", "OBJECTION", "INCIDENTAL"] as const;
export const PETITION_TYPE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export const petitionPartySchema = z.object({
  partyType: z.enum(PARTY_TYPES).default("PERSON"),
  firstName: text(SHORT),
  lastName: text(SHORT),
  /** نام شخص حقوقی (تبصره ۲ ماده ۵۱) */
  legalName: text(SHORT),
  fatherName: text(SHORT),
  age: text(TINY),
  nationalId: text(TINY),
  occupation: text(SHORT),
  /** اقامتگاه با تمام خصوصیات لازم برای ابلاغ (تبصره ۱ ماده ۵۱) */
  address: text(LONG),
  postalCode: text(TINY),
  phone: text(TINY),
  /** شناسه طرف پرونده یا مراجعه‌کننده‌ای که این ردیف از آن پر شده است */
  sourceId: z.string().max(TINY).optional(),
});

export const representativeSchema = z.object({
  kind: z.enum(REPRESENTATIVE_KINDS).default("LAWYER"),
  firstName: text(SHORT),
  lastName: text(SHORT),
  licenseNo: text(TINY),
  address: text(LONG),
  phone: text(TINY),
});

export const witnessSchema = z.object({ name: text(SHORT), details: text(SHORT), address: text(LONG) });
export const evidenceSchema = z.object({ label: text(LONG), detail: text(LONG), include: z.boolean().default(true) });

export const petitionDataSchema = z.object({
  plaintiffs: z.array(petitionPartySchema).max(MAX_PARTIES).default([]),
  defendants: z.array(petitionPartySchema).max(MAX_PARTIES).default([]),
  representatives: z.array(representativeSchema).max(MAX_PARTIES).default([]),
  claim: z.object({ subject: text(LONG), valueType: z.enum(VALUE_TYPES).nullable().default(null), valueBasis: text(SHORT), value: text(TINY) }).default({}),
  evidence: z.array(evidenceSchema).max(MAX_ITEMS).default([]),
  witnesses: z.array(witnessSchema).max(MAX_PARTIES).default([]),
  investigations: z.array(text(LONG)).max(MAX_ITEMS).default([]),
  ancillary: z.array(text(LONG)).max(MAX_ITEMS).default([]),
  court: z.object({ name: text(SHORT), branch: text(SHORT), city: text(SHORT) }).default({}),
  decision: z.object({ kind: text(TINY), number: text(TINY), date: text(TINY), court: text(SHORT), branch: text(SHORT), serviceDate: text(TINY) }).default({}),
  mainCase: z.object({ number: text(TINY), court: text(SHORT), branch: text(SHORT), plaintiff: text(SHORT), defendant: text(SHORT), subject: text(LONG) }).default({}),
  /** مقدار جاهای خالی شرح خواسته، با کلید همان برچسب {{...}} */
  blanks: z.record(z.string().max(BODY)).default({}),
  /** شرط بندهای اختیاری که در متن گنجانده می‌شوند */
  clauses: z.array(text(LONG)).max(MAX_ITEMS).default([]),
  /** دادخواست‌دهنده مقیم خارج از کشور است (برای محاسبه مهلت) */
  abroad: z.boolean().default(false),
});

export type PetitionParty = z.infer<typeof petitionPartySchema>;
export type Representative = z.infer<typeof representativeSchema>;
export type PetitionData = z.infer<typeof petitionDataSchema>;

export const emptyParty = (): PetitionParty => petitionPartySchema.parse({});
export const emptyPetitionData = (): PetitionData => petitionDataSchema.parse({});

export function partyName(p: Pick<PetitionParty, "partyType" | "firstName" | "lastName" | "legalName">): string {
  return p.partyType === "LEGAL" ? p.legalName : [p.firstName, p.lastName].filter(Boolean).join(" ");
}

// ── نمای نوع دادخواست: ستون‌های Json با طرح مشخص خوانده می‌شوند ──

const lawRequirementSchema = z.object({ label: z.string(), article: z.string(), anchor: z.string(), field: z.string().optional() });
const evidenceItemSchema = z.object({ label: z.string(), required: z.boolean().nullable() });
const valueOptionSchema = z.object({ label: z.string(), checked: z.boolean() });
const blankSchema = z.object({ key: z.string(), label: z.string() });
const clauseSchema = z.object({ condition: z.string(), text: z.string() });
const rulesSchema = z.object({ evidenceOptionalWithInvestigation: z.boolean().default(false) }).passthrough();

export type Requirement = { law: LawRequirement } | { evidence: EvidenceItem };

/** ستون‌هایی از PetitionType که برای اعتبارسنجی و ساخت برگ لازم است (ردیف Prisma همین شکل را دارد) */
export interface PetitionTypeRow {
  id: string;
  code: string;
  title: string;
  kind: string;
  subKind: string | null;
  category: string;
  court: string | null;
  courtBasis: string | null;
  eligible: string | null;
  defendant: string | null;
  valueType: string | null;
  valueOptions: unknown;
  evidence: string[];
  evidenceInfo: string[];
  fees: string[];
  investigations: string[];
  ancillary: string[];
  bodyTemplate: string;
  blanks: unknown;
  optionalClauses: unknown;
  requirements: unknown;
  rules: unknown;
  notes: string | null;
  source: string;
  sourceLabel: string | null;
  lawCode: string | null;
  articleRefs: string[];
  deadlineRuleKey: string | null;
  status: string;
}

export interface PetitionSpec extends Omit<PetitionTypeRow, "valueOptions" | "blanks" | "optionalClauses" | "requirements" | "rules"> {
  valueOptions: ValueOption[];
  blanks: Blank[];
  optionalClauses: OptionalClause[];
  requirements: Requirement[];
  rules: { evidenceOptionalWithInvestigation: boolean };
}

const listOf = <T>(schema: z.ZodType<T>, raw: unknown): T[] => (Array.isArray(raw) ? raw : []).flatMap((x) => {
  const r = schema.safeParse(x);
  return r.success ? [r.data] : [];
});

function requirementOf(raw: unknown): Requirement[] {
  const law = lawRequirementSchema.safeParse(raw);
  if (law.success) return [{ law: law.data }];
  const ev = evidenceItemSchema.safeParse(raw);
  return ev.success ? [{ evidence: ev.data }] : [];
}

export function toSpec(row: PetitionTypeRow): PetitionSpec {
  const rules = rulesSchema.safeParse(row.rules ?? {});
  return {
    ...row,
    valueOptions: listOf(valueOptionSchema, row.valueOptions),
    blanks: listOf(blankSchema, row.blanks),
    optionalClauses: listOf(clauseSchema, row.optionalClauses),
    requirements: (Array.isArray(row.requirements) ? row.requirements : []).flatMap(requirementOf),
    rules: { evidenceOptionalWithInvestigation: rules.success ? rules.data.evidenceOptionalWithInvestigation : false },
  };
}

const SPEC_KEYS = [
  "id", "code", "title", "kind", "subKind", "category", "court", "courtBasis", "eligible", "defendant", "valueType", "valueOptions", "evidence", "evidenceInfo",
  "fees", "investigations", "ancillary", "bodyTemplate", "blanks", "optionalClauses", "requirements", "rules", "notes", "source", "sourceLabel", "lawCode",
  "articleRefs", "deadlineRuleKey", "status",
] as const satisfies readonly (keyof PetitionSpec)[];

/** فقط ستون‌های طرح PetitionSpec (بدون تاریخ‌ها و ستون‌های داخلی ردیف Prisma) برای ارسال به استودیوی مرورگر */
export const plainSpec = (s: PetitionSpec): PetitionSpec => Object.fromEntries(SPEC_KEYS.map((k) => [k, s[k]])) as unknown as PetitionSpec;

/** الزام اجباری بودن هر مدرک (فرم‌ها: true/false/نامعلوم) */
export function evidenceRequired(spec: PetitionSpec, label: string): boolean | null {
  return spec.requirements.flatMap((r) => ("evidence" in r && r.evidence.label === label ? [r.evidence.required] : [])).at(0) ?? null;
}
