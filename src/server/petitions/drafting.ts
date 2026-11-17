// ساخت و به‌روزرسانی سند دادخواست از نوع دادخواست: پیش‌پرکردن طرفین از پرونده و مراجعه‌کننده (چند نفر در هر سمت)،
// ساخت برگ از داده ساخت‌یافته، گزارش بررسی ماده ۵۱/۵۳ و محاسبه مهلت اعتراض با قاعده مهلت پیوندخورده.
// سمت دادخواست‌دهنده همان سمت مراجعه‌کننده در پرونده است؛ در ورود و اعتراض ثالث هر دو سمت دعوای اصلی خوانده‌اند.
import type { CaseParty, Client, Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { ROLE_SIDE, type Side } from "@/lib/party-roles";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { diffTehranDays, parseJalali } from "@/lib/jalali";
import { toFaDigits } from "@/lib/text";
import { assertDraftAccess } from "../access";
import { suggestFromRule } from "../deadlines";
import { assertEditor, insertDraft, reindex, resolveDraftOwner } from "../drafts";
import { sanitizeLegalHtml } from "../sanitize";
import { emptyParty, evidenceRequired, partyName, petitionDataSchema, toSpec, type PetitionData, type PetitionParty, type PetitionSpec } from "./data";
import { renderPetitionHtml } from "./render";
import { validatePetition, type PetitionValidation } from "./validate";

const ID_MAX = 40;
const TITLE_MAX = 200;
const MANAGE = "petition.manage";
/** نام و نام خانوادگی دست‌کم دو واژه است */
const MIN_NAME_PARTS = 2;

/** سمت هر نقش طرف پرونده (labels.PARTY_ROLES): A خواهان‌گونه، B خوانده‌گونه، T ثالث */
const WITNESS_ROLE = "شاهد";
/** نوع‌هایی که طرف آن‌ها هر دو سمت دعوای اصلی است */
const BOTH_SIDES_AS_DEFENDANTS = new Set(["THIRD_PARTY_ENTRY", "THIRD_PARTY_OBJECTION"]);
/** نوع‌هایی که مرجع آن‌ها همان دادگاه صادرکننده رأی است */
const SAME_COURT = new Set(["DEFAULT_OBJECTION", "RETRIAL", "THIRD_PARTY_OBJECTION"]);
const DOC_TYPES: Record<string, string> = { APPEAL: "APPEAL", DEFAULT_OBJECTION: "OBJECTION", ATTACHMENT: "JUDICIAL_REQUEST", INTERIM_ORDER: "JUDICIAL_REQUEST" };
// A legal-person name: matches "شرکت آریا ترابر" and "بانک ملت", rejects "علی بانکی".
// https://regex101.com/?regex=%5E%28%D8%B4%D8%B1%DA%A9%D8%AA%7C%D8%A8%D8%A7%D9%86%DA%A9%7C%D9%85%D9%88%D8%B3%D8%B3%D9%87%29%20&testString=%D8%A8%D8%A7%D9%86%DA%A9%20%D9%85%D9%84%D8%AA&flavor=javascript
const LEGAL_NAME = /^(شرکت|بانک|موسسه|مؤسسه|سازمان|اداره|شهرداری|دانشگاه|وزارت|صندوق|تعاونی|اتحادیه|هیئت|هیات|اتاق) /;

const fa = (s: string | null | undefined): string => (s ? toFaDigits(s) : "");

/** سن به سال از تاریخ تولد (میلادی، تا امروز) */
function ageOf(birth: Date | null, now = new Date()): string {
  if (!birth) return "";
  const beforeBirthday = now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  return toFaDigits(now.getUTCFullYear() - birth.getUTCFullYear() - (beforeBirthday ? 1 : 0));
}

/** نام کامل طرف پرونده: واژه آخر نام خانوادگی فرض می‌شود و در استودیو قابل اصلاح است */
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(" ").filter(Boolean);
  if (parts.length < MIN_NAME_PARTS) return { firstName: "", lastName: parts[0] ?? "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) ?? "" };
}

function fromCaseParty(p: CaseParty): PetitionParty {
  const legal = p.partyType === "LEGAL" || LEGAL_NAME.test(p.name.trim());
  const names = legal ? { firstName: "", lastName: "", legalName: p.name.trim() } : { ...splitName(p.name), legalName: "" };
  return { ...emptyParty(), ...names, partyType: legal ? "LEGAL" : "PERSON", fatherName: p.fatherName ?? "", age: ageOf(p.birthDate), nationalId: fa(p.nationalId), occupation: p.occupation ?? "", address: p.address ?? "", postalCode: fa(p.postalCode), phone: fa(p.phone), sourceId: p.id };
}

/** مراجعه‌کننده با مشخصات پرونده‌ای او (اگر به‌عنوان طرف ثبت شده باشد) برای خانه‌های خالی */
function fromClient(c: Client, asParty: CaseParty | undefined): PetitionParty {
  const legal = c.type === "LEGAL";
  return {
    ...emptyParty(),
    partyType: legal ? "LEGAL" : "PERSON",
    firstName: legal ? "" : c.firstName ?? "",
    lastName: legal ? "" : c.lastName ?? "",
    legalName: legal ? c.companyName ?? c.displayName : "",
    fatherName: c.fatherName ?? asParty?.fatherName ?? "",
    age: ageOf(c.birthDate ?? asParty?.birthDate ?? null),
    nationalId: fa(c.nationalId ?? asParty?.nationalId),
    occupation: c.occupation ?? asParty?.occupation ?? "",
    address: c.address ?? asParty?.address ?? "",
    postalCode: fa(c.postalCode ?? asParty?.postalCode),
    phone: fa(c.mobile ?? c.phone ?? asParty?.phone),
    sourceId: c.id,
  };
}

const courtOf = (name: string | null | undefined, branch: string | null | undefined) => ({ name: name ?? "", branch: fa(branch), city: "" });

/** داده اولیه دادخواست از نوع، پرونده و مراجعه‌کننده */
export async function prefillPetition(spec: PetitionSpec, caseId: string | null, clientId: string | null): Promise<PetitionData> {
  const c = caseId ? await db.case.findUnique({ where: { id: caseId }, include: { parties: { orderBy: { createdAt: "asc" } }, client: true } }) : null;
  const client = c?.client ?? (clientId ? await db.client.findUnique({ where: { id: clientId } }) : null);
  const parties = c?.parties ?? [];
  const clientParty = client ? parties.find((p) => p.clientId === client.id) : undefined;
  const clientSide: Side = ROLE_SIDE[clientParty?.role ?? ""] ?? "A";
  const opposite: Side = clientSide === "B" ? "A" : "B";
  const onSide = (side: Side): PetitionParty[] => parties.filter((p) => ROLE_SIDE[p.role] === side && p.id !== clientParty?.id).map(fromCaseParty);
  const filer = client ? [fromClient(client, clientParty)] : [];
  const bothSides = BOTH_SIDES_AS_DEFENDANTS.has(spec.subKind ?? "");
  const plaintiffs = [...filer, ...onSide(bothSides ? "T" : clientSide)];
  const defendants = bothSides ? [...onSide("A"), ...onSide("B")] : onSide(spec.subKind === "THIRD_PARTY_JOINDER" ? "T" : opposite);
  const namesOf = (side: Side): string => [...(client && clientSide === side ? [client.displayName] : []), ...onSide(side).map(partyName)].filter(Boolean).join("، ");
  const caseCourt = courtOf(c?.courtName, c?.courtBranch);
  const objection = spec.kind === "OBJECTION";
  const typeCourt = { name: spec.court ?? "", branch: "", city: "" };
  const court = (objection && !SAME_COURT.has(spec.subKind ?? "")) || !c?.courtName ? typeCourt : caseCourt;
  const valueType = spec.valueType === "MALI" || spec.valueType === "GHEIR_MALI" ? spec.valueType : null;
  return petitionDataSchema.parse({
    plaintiffs,
    defendants,
    claim: { subject: spec.title, valueType, valueBasis: spec.valueOptions.find((o) => o.checked)?.label ?? "", value: "" },
    evidence: spec.evidence.map((label) => ({ label, detail: "", include: evidenceRequired(spec, label) !== false })),
    witnesses: parties.filter((p) => p.role === WITNESS_ROLE).map((p) => ({ name: p.name, details: p.nationalId ? `کد ملی ${fa(p.nationalId)}` : "", address: p.address ?? "" })),
    court: SAME_COURT.has(spec.subKind ?? "") && !c?.courtName ? { name: "", branch: "", city: "" } : court,
    decision: objection ? { court: caseCourt.name, branch: caseCourt.branch } : {},
    mainCase: spec.kind === "INCIDENTAL" ? { number: fa(c?.courtCaseNumber), court: caseCourt.name, branch: caseCourt.branch, plaintiff: namesOf("A"), defendant: namesOf("B"), subject: c?.title ?? "" } : {},
  });
}

async function usableType(id: string, user: SessionUser) {
  const row = await db.petitionType.findUnique({ where: { id } });
  if (!row || row.status === "ARCHIVED" || (row.status !== "PUBLISHED" && !can(user, MANAGE))) throw new NotFoundError("نوع دادخواست یافت نشد یا منتشر نشده است.");
  return row;
}

export const createPetitionSchema = z.object({
  petitionTypeId: z.string().min(1).max(ID_MAX),
  caseId: z.string().max(ID_MAX).optional().transform((v) => v || null),
  clientId: z.string().max(ID_MAX).optional().transform((v) => v || null),
  title: z.string().trim().max(TITLE_MAX).optional().transform((v) => v || null),
  data: petitionDataSchema.optional(),
});

/** سند دادخواست تازه: داده ورودی یا پیش‌پرشده از پرونده، برگ ساخته‌شده به‌عنوان نسخه ۱ */
export async function createPetitionDraft(input: z.infer<typeof createPetitionSchema>, user: SessionUser) {
  if (!can(user, "draft.create")) throw new ForbiddenError();
  const row = await usableType(input.petitionTypeId, user);
  const spec = toSpec(row);
  const owner = await resolveDraftOwner(user, input.caseId, input.clientId);
  const data = input.data ?? (await prefillPetition(spec, owner.caseId, owner.clientId));
  return insertDraft({
    title: input.title ?? spec.title, docType: DOC_TYPES[spec.subKind ?? ""] ?? "PETITION", caseId: owner.caseId, clientId: owner.clientId, templateId: null,
    html: sanitizeLegalHtml(renderPetitionHtml(spec, data)), aiAssisted: false, source: "PETITION", note: `ایجاد از نوع دادخواست «${spec.title}»`,
    petitionTypeId: row.id, petitionData: data as Prisma.InputJsonValue,
  }, user);
}

async function draftSpec(petitionTypeId: string | null): Promise<PetitionSpec> {
  if (!petitionTypeId) throw new AppError("این سند با استودیوی دادخواست ساخته نشده است.");
  const row = await db.petitionType.findUnique({ where: { id: petitionTypeId } });
  if (!row) throw new NotFoundError("نوع دادخواست این سند حذف شده است.");
  return toSpec(row);
}

/** ذخیره داده دادخواست و ساخت دوباره برگ؛ اگر برگ تغییر کند نسخه شماره‌دار تازه ثبت می‌شود */
export async function savePetition(id: string, version: number, raw: unknown, user: SessionUser) {
  const d = await assertDraftAccess(user, id);
  assertEditor(d, user);
  const spec = await draftSpec(d.petitionTypeId);
  const data = petitionDataSchema.parse(raw);
  const html = sanitizeLegalHtml(renderPetitionHtml(spec, data));
  const res = await db.$transaction(async (tx) => {
    const last = await tx.legalDraftVersion.findFirst({ where: { draftId: id }, orderBy: { versionNo: "desc" } });
    const changed = last?.contentHtml !== html;
    const versionNo = changed ? (last?.versionNo ?? 0) + 1 : d.currentVersion;
    if (changed) await tx.legalDraftVersion.create({ data: { draftId: id, versionNo, contentHtml: html, note: "به‌روزرسانی برگ دادخواست", source: "PETITION", authorId: user.id } });
    const r = await tx.legalDraft.updateMany({ where: { id, version }, data: { petitionData: data as Prisma.InputJsonValue, contentHtml: html, currentVersion: versionNo, version: { increment: 1 } } });
    if (!r.count) throw new ConflictError("این سند هم‌زمان در جای دیگری ویرایش شده است. صفحه را تازه‌سازی کنید.");
    await audit({ actorId: user.id, action: "draft.saved", entityType: "LegalDraft", entityId: id, entityLabel: `${d.title} (${d.code})`, caseId: d.caseId, clientId: d.clientId, meta: { versionNo, petition: true } }, tx);
    return { version: version + 1, versionNo };
  });
  await reindex(id);
  return res;
}

export type DeadlineStatus = "NO_RULE" | "NEED_DATE" | "INFO" | "OPEN" | "LAST_DAY" | "PASSED";
export interface PetitionDeadline {
  status: DeadlineStatus;
  ruleKey: string | null;
  triggerLabel: string | null;
  title: string | null;
  basis: string | null;
  verified: boolean;
  period: string | null;
  dueDate: string | null;
  dueDateLabel: string | null;
  daysLeft: number | null;
  explanation: string[];
  note: string | null;
}

/** تاریخ آغاز مهلت هر قاعده در داده دادخواست */
const TRIGGERS: Record<string, { label: string; value: (d: PetitionData) => string }> = {
  CIVIL_APPEAL: { label: "تاریخ ابلاغ رأی", value: (d) => d.decision.serviceDate },
  CIVIL_OBJECTION: { label: "تاریخ ابلاغ واقعی حکم غیابی", value: (d) => d.decision.serviceDate },
  CIVIL_CASSATION: { label: "تاریخ ابلاغ رأی", value: (d) => d.decision.serviceDate },
  CIVIL_RETRIAL: { label: "تاریخ ابلاغ رأی", value: (d) => d.decision.serviceDate },
  CIVIL_THIRD_PARTY_JOINDER: { label: "تاریخ جلسه اول دادرسی", value: (d) => d.blanks["تاریخ جلسه اول"] ?? "" },
};

function deadlineStatus(daysLeft: number | null): DeadlineStatus {
  if (daysLeft === null || daysLeft > 0) return "OPEN";
  return daysLeft === 0 ? "LAST_DAY" : "PASSED";
}

const EMPTY_DEADLINE: PetitionDeadline = { status: "NO_RULE", ruleKey: null, triggerLabel: null, title: null, basis: null, verified: false, period: null, dueDate: null, dueDateLabel: null, daysLeft: null, explanation: [], note: null };
const END_OF_DAY = "23:59";

/** مهلت تقدیم دادخواست اعتراضی/طاری با قاعده پیوندخورده؛ قاعده تأییدنشده با همان برچسب گزارش می‌شود */
export async function petitionDeadline(spec: Pick<PetitionSpec, "deadlineRuleKey">, d: PetitionData, now = new Date()): Promise<PetitionDeadline> {
  const key = spec.deadlineRuleKey;
  if (!key) return EMPTY_DEADLINE;
  const rule = await db.deadlineRule.findFirst({ where: { key, isActive: true } });
  if (!rule) return EMPTY_DEADLINE;
  const base = { ...EMPTY_DEADLINE, ruleKey: key, title: rule.title, basis: rule.basis, verified: rule.verified, note: rule.description };
  const trigger = TRIGGERS[key];
  if (!trigger) return { ...base, status: "INFO" };
  const date = trigger.value(d).trim();
  if (!date) return { ...base, status: "NEED_DATE", triggerLabel: trigger.label };
  const s = await suggestFromRule(key, date, d.abroad);
  const dueAt = parseJalali(s.dueDate, END_OF_DAY);
  const daysLeft = dueAt ? diffTehranDays(now, dueAt) : null;
  const status = deadlineStatus(daysLeft);
  return { ...base, status, triggerLabel: trigger.label, period: s.rule.period, dueDate: s.dueDate, dueDateLabel: s.dueDateLabel, daysLeft, explanation: s.explanation };
}

export interface PetitionReport { spec: PetitionSpec; data: PetitionData; validation: PetitionValidation; deadline: PetitionDeadline }

/** وضعیت دادخواست یک سند: داده، بررسی ماده ۵۱/۵۳ و مهلت */
export async function petitionReport(id: string, user: SessionUser): Promise<PetitionReport> {
  const d = await assertDraftAccess(user, id);
  const spec = await draftSpec(d.petitionTypeId);
  const data = petitionDataSchema.parse(d.petitionData ?? {});
  return { spec, data, validation: validatePetition(spec, data), deadline: await petitionDeadline(spec, data) };
}
