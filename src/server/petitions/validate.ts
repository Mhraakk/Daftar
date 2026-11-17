// بررسی دادخواست با ماده ۵۱ و ۵۳ ق.آ.د.م (به‌علاوه ماده ۴۸ برای مرجع و الزام‌های ماده‌ای هر نوع اعتراضی/طاری).
// هر بررسی به ماده، بند و عبارتی دقیق از متن همان ماده پیوند دارد؛ tests/unit/petitions.test.ts وجود هر عبارت را در
// متن واردشده قانون می‌سنجد. «defect53» یعنی کمبود از بندهای ۲ تا ۶ ماده ۵۱ است که ماده ۵۳ برای آن تکمیل دادخواست را
// لازم می‌داند. نتیجه راهنمای تنظیم است و جای بررسی حقوقی را نمی‌گیرد.
import { normalizeFa, toFaDigits } from "@/lib/text";
import { partyName, type PetitionData, type PetitionParty, type PetitionSpec } from "./data";
import { amountOf, fillBody } from "./render";

export type CheckStatus = "ok" | "missing" | "warning" | "info";

export interface Anchor { article: string; band: string | null; text: string }

export interface PetitionCheck {
  id: string;
  label: string;
  status: CheckStatus;
  article: string;
  band: string | null;
  anchor: string;
  field: string | null;
  message: string | null;
  defect53: boolean;
}

export interface PetitionValidation { checks: PetitionCheck[]; required: number; ok: number; missing: number; warnings: number }

/** عبارت‌های دقیق متن قانون که هر بررسی به آن استناد می‌کند */
export const ANCHORS = {
  plaintiff: { article: "51", band: "بند ۱", text: "نام، نام خانوادگی، نام پدر، سن، اقامتگاه و حتی المکان شغل خواهان" },
  lawyer: { article: "51", band: "تبصره بند ۱", text: "در صورتی که دادخواست توسط وکیل تقدیم شود مشخصات وکیل نیز باید درج گردد" },
  defendant: { article: "51", band: "بند ۲", text: "نام، نام خانوادگی، اقامتگاه و شغل خوانده" },
  claim: { article: "51", band: "بند ۳", text: "تعیین خواسته و بهای آن مگر آن که تعیین بهاء ممکن نبوده و یا خواسته، مالی نباشد" },
  grounds: { article: "51", band: "بند ۴", text: "تعهدات و جهاتی که به موجب آن خواهان خود را مستحق مطالبه می‌داند به طوری که مقصود واضح و روشن باشد" },
  request: { article: "51", band: "بند ۵", text: "آنچه که خواهان از دادگاه درخواست دارد" },
  evidence: { article: "51", band: "بند ۶", text: "ذکر ادله و وسایلی که خواهان برای اثبات ادعای خود دارد" },
  witnesses: { article: "51", band: "بند ۶", text: "اگر دلیل، گواهی گواه باشد، خواهان باید اسامی و مشخصات و محل اقامت آنان را به طور صحیح معین کند" },
  signature: { article: "51", band: "بند ۷", text: "امضای دادخواست دهنده و در صورت عجز از امضاء، اثر انگشت او" },
  address: { article: "51", band: "تبصره ۱", text: "اقامتگاه باید با تمام خصوصیات از قبیل شهر و روستا و دهستان و خیابان به نحوی نوشته شود که ابلاغ به سهولت ممکن باشد" },
  legalPerson: { article: "51", band: "تبصره ۲", text: "چنانچه خواهان یا خوانده شخص حقوقی باشد، در دادخواست نام و اقامتگاه شخص حقوقی، نوشته خواهد شد" },
  fees: { article: "53", band: "بند ۱", text: "در صورتی که به دادخواست و پیوستهای آن برابر قانون تمبر الصاق نشده یا هزینه یاد شده تادیه نشده باشد" },
  defect: { article: "53", band: "بند ۲", text: "وقتی که بندهای (2، 3، 4، 5 و 6) ماده (51) این قانون رعایت نشده باشد" },
  court: { article: "48", band: null, text: "دادخواست به دفتر دادگاه صالح" },
} as const satisfies Record<string, Anchor>;

/** نشانی کوتاه‌تر از این (نویسه) برای ابلاغ کافی به نظر نمی‌رسد (تبصره ۱) */
const MIN_ADDRESS = 15;
const UNKNOWN_VALUE = "نامعین";
// Witness testimony in an evidence or investigation label: matches "شهادت شهود و مطلعین" and "گواهی گواه",
// rejects "گواهی پزشکی قانونی" (a certificate) and "استشهادیه محلی" (a written statement).
// https://regex101.com/?regex=%D8%B4%D9%87%D8%A7%D8%AF%D8%AA%7C%D8%B4%D9%87%D9%88%D8%AF%7C%DA%AF%D9%88%D8%A7%D9%87%D8%A7%D9%86%7C%DA%AF%D9%88%D8%A7%D9%87%28%3F!%DB%8C%29&testString=%DA%AF%D9%88%D8%A7%D9%87%DB%8C%20%DA%AF%D9%88%D8%A7%D9%87&flavor=javascript
const WITNESS_EVIDENCE = /شهادت|شهود|گواهان|گواه(?!ی)/;
// A request to the court in the body: matches "مورد استدعاست", "مستدعی است" and "تقاضای صدور حکم", rejects "با تشکر".
// https://regex101.com/?regex=%D8%A7%D8%B3%D8%AA%D8%AF%D8%B9%D8%A7%7C%D9%85%D8%B3%D8%AA%D8%AF%D8%B9%DB%8C%7C%D8%AA%D9%82%D8%A7%D8%B6%D8%A7%7C%D8%AF%D8%B1%D8%AE%D9%88%D8%A7%D8%B3%D8%AA%7C%D8%AE%D9%88%D8%A7%D9%87%D8%B4%D9%85%D9%86%D8%AF&testString=%D9%85%D8%B3%D8%AA%D8%AF%D8%B9%DB%8C%20%D8%A7%D8%B3%D8%AA&flavor=javascript
const REQUEST_WORDS = /استدعا|مستدعی|تقاضا|درخواست|خواهشمند/;

type Field = keyof Pick<PetitionParty, "firstName" | "lastName" | "legalName" | "fatherName" | "age" | "address" | "occupation">;
const PLAINTIFF_FIELDS: [Field, string][] = [["firstName", "نام"], ["lastName", "نام خانوادگی"], ["fatherName", "نام پدر"], ["age", "سن"], ["address", "اقامتگاه"]];
const DEFENDANT_FIELDS: [Field, string][] = [["firstName", "نام"], ["lastName", "نام خانوادگی"], ["address", "اقامتگاه"], ["occupation", "شغل"]];
const LEGAL_FIELDS: [Field, string][] = [["legalName", "نام شخص حقوقی"], ["address", "اقامتگاه"]];

interface CheckInput { id: string; label: string; status: CheckStatus; field?: string | null; message?: string | null; defect53?: boolean }

const make = (a: Anchor, c: CheckInput): PetitionCheck => ({
  id: c.id, label: c.label, status: c.status, article: a.article, band: a.band, anchor: a.text,
  field: c.field ?? null, message: c.message ?? null, defect53: c.defect53 ?? false,
});
const filled = (s: string): boolean => s.trim().length > 0;
const missingOf = (p: PetitionParty, fields: [Field, string][]): string[] => fields.filter(([k]) => !filled(p[k])).map(([, l]) => l);
const statusOf = (ok: boolean): CheckStatus => (ok ? "ok" : "missing");
const listMessage = (prefix: string, items: string[]): string | null => (items.length ? `${prefix}: ${items.join("، ")}` : null);

interface SideRule { key: "plaintiffs" | "defendants"; label: string; anchor: Anchor; fields: [Field, string][]; defect53: boolean; occupationOptional: boolean }

function partyChecks(rule: SideRule, parties: PetitionParty[]): PetitionCheck[] {
  if (!parties.length) return [make(rule.anchor, { id: rule.key, label: rule.label, status: "missing", field: rule.key, message: `دست‌کم یک ${rule.label} لازم است.`, defect53: rule.defect53 })];
  return parties.flatMap((p, i) => {
    const legal = p.partyType === "LEGAL";
    const name = partyName(p);
    const who = `${rule.label}${parties.length > 1 ? ` ${toFaDigits(i + 1)}` : ""}${name ? ` (${name})` : ""}`;
    const missing = missingOf(p, legal ? LEGAL_FIELDS : rule.fields);
    const main = make(legal ? ANCHORS.legalPerson : rule.anchor, { id: `${rule.key}.${i}`, label: `مشخصات ${who}`, status: statusOf(!missing.length), field: `${rule.key}.${i}`, message: listMessage("ناقص", missing), defect53: rule.defect53 });
    const occupation = !legal && rule.occupationOptional && !filled(p.occupation)
      ? [make(rule.anchor, { id: `${rule.key}.${i}.occupation`, label: `شغل ${who}`, status: "warning", field: `${rule.key}.${i}.occupation`, message: "شغل خواهان «حتی‌المکان» درج می‌شود." })]
      : [];
    const shortAddress = filled(p.address) && p.address.trim().length < MIN_ADDRESS
      ? [make(ANCHORS.address, { id: `${rule.key}.${i}.address`, label: `اقامتگاه ${who}`, status: "warning", field: `${rule.key}.${i}.address`, message: "نشانی کوتاه است؛ شهر، خیابان و جزئیات لازم برای ابلاغ را کامل کنید." })]
      : [];
    return [main, ...occupation, ...shortAddress];
  });
}

function representativeChecks(d: PetitionData): PetitionCheck[] {
  return d.representatives.flatMap((r, i) => {
    const missing = [filled(r.firstName) ? "" : "نام", filled(r.lastName) ? "" : "نام خانوادگی"].filter(Boolean);
    const main = make(ANCHORS.lawyer, { id: `representatives.${i}`, label: `مشخصات وکیل یا نماینده ${toFaDigits(i + 1)}`, status: statusOf(!missing.length), field: `representatives.${i}`, message: listMessage("ناقص", missing) });
    const license = r.kind === "LAWYER" && !filled(r.licenseNo)
      ? [make(ANCHORS.lawyer, { id: `representatives.${i}.licenseNo`, label: "شماره پروانه وکالت", status: "warning", field: `representatives.${i}.licenseNo`, message: "شماره پروانه وکیل درج نشده است." })]
      : [];
    return [main, ...license];
  });
}

function valueCheck(spec: PetitionSpec, d: PetitionData): PetitionCheck[] {
  if (!spec.valueType) return [];
  const base = { id: "claim.value", label: "بهای خواسته", field: "claim.value", defect53: true };
  if (!d.claim.valueType) return [make(ANCHORS.claim, { ...base, id: "claim.valueType", label: "مالی یا غیرمالی بودن خواسته", field: "claim.valueType", status: "missing", message: "مالی یا غیرمالی بودن خواسته را تعیین کنید." })];
  if (d.claim.valueType === "GHEIR_MALI") return [make(ANCHORS.claim, { ...base, status: "ok", message: "خواسته مالی نیست؛ تعیین بها لازم نیست." })];
  if (amountOf(d.claim.value) > BigInt(0)) return [make(ANCHORS.claim, { ...base, status: "ok" })];
  if (d.claim.valueBasis.includes(UNKNOWN_VALUE)) return [make(ANCHORS.claim, { ...base, status: "warning", message: "بها «نامعین» اعلام شده است؛ بند ۳ فقط وقتی تعیین بها را لازم نمی‌داند که «ممکن نبوده» باشد." })];
  return [make(ANCHORS.claim, { ...base, status: "missing", message: "بهای خواسته (به ریال) را وارد کنید." })];
}

function bodyChecks(spec: PetitionSpec, d: PetitionData): PetitionCheck[] {
  const body = fillBody(spec, d);
  return [
    make(ANCHORS.grounds, { id: "body.grounds", label: "جهات و شرح خواسته", status: statusOf(!body.unfilled.length), field: "blanks", message: listMessage("جاهای خالی", body.unfilled), defect53: true }),
    make(ANCHORS.request, { id: "body.request", label: "درخواست از دادگاه", status: statusOf(REQUEST_WORDS.test(body.text)), field: "blanks", message: REQUEST_WORDS.test(body.text) ? null : "درخواست از دادگاه در شرح خواسته دیده نمی‌شود.", defect53: true }),
  ];
}

function evidenceChecks(spec: PetitionSpec, d: PetitionData): PetitionCheck[] {
  const included = d.evidence.filter((e) => e.include && filled(e.label));
  const investigations = d.investigations.filter(filled);
  const has = new Set(included.map((e) => normalizeFa(e.label)));
  const requiredMissing = spec.requirements.flatMap((r) => ("evidence" in r && r.evidence.required === true && !has.has(normalizeFa(r.evidence.label)) ? [r.evidence.label] : []));
  const enough = included.length > 0 || (spec.rules.evidenceOptionalWithInvestigation && investigations.length > 0);
  const message = listMessage("مدرک اجباری انتخاب نشده", requiredMissing) ?? (enough ? null : "دست‌کم یک دلیل یا مدرک لازم است.");
  const main = make(ANCHORS.evidence, { id: "evidence", label: "دلایل و منضمات", status: statusOf(enough && !requiredMissing.length), field: "evidence", message, defect53: true });
  const testimony = [...included.flatMap((e) => [e.label, e.detail]), ...investigations].some((x) => WITNESS_EVIDENCE.test(x));
  if (!testimony && !d.witnesses.length) return [main];
  const named = d.witnesses.filter((w) => filled(w.name));
  const incomplete = named.filter((w) => !filled(w.address)).map((w) => w.name);
  const witnessMessage = named.length ? listMessage("محل اقامت درج نشده", incomplete) : "نام و محل اقامت گواهان را وارد کنید.";
  return [main, make(ANCHORS.witnesses, { id: "witnesses", label: "مشخصات گواهان", status: statusOf(named.length > 0 && !incomplete.length), field: "witnesses", message: witnessMessage, defect53: true })];
}

const FIELD_FILLED: Record<string, (d: PetitionData, unfilled: string[]) => boolean> = {
  plaintiffs: (d) => d.plaintiffs.length > 0,
  defendants: (d) => d.defendants.length > 0,
  body: (_d, unfilled) => unfilled.length === 0,
  "claim.subject": (d) => filled(d.claim.subject),
  "decision.number": (d) => filled(d.decision.number),
  "decision.court": (d) => filled(d.decision.court),
  "decision.serviceDate": (d) => filled(d.decision.serviceDate),
  "mainCase.number": (d) => filled(d.mainCase.number),
};

/** الزام‌های ماده‌ای نوع‌های اعتراضی و طاری (مثلاً ماده ۳۴۱ برای تجدیدنظر) */
function requirementChecks(spec: PetitionSpec, d: PetitionData): PetitionCheck[] {
  const unfilled = fillBody(spec, d).unfilled;
  return spec.requirements.flatMap((r, i) => {
    if (!("law" in r)) return [];
    const anchor = { article: r.law.article, band: null, text: r.law.anchor };
    const test = r.law.field ? FIELD_FILLED[r.law.field] : undefined;
    if (!test) return [make(anchor, { id: `law.${i}`, label: r.law.label, status: "info", message: "پیش از ثبت بررسی کنید." })];
    return [make(anchor, { id: `law.${i}`, label: r.law.label, status: statusOf(test(d, unfilled)), field: r.law.field ?? null })];
  });
}

export function validatePetition(spec: PetitionSpec, d: PetitionData): PetitionValidation {
  const checks = [
    ...partyChecks({ key: "plaintiffs", label: "خواهان", anchor: ANCHORS.plaintiff, fields: PLAINTIFF_FIELDS, defect53: false, occupationOptional: true }, d.plaintiffs),
    ...representativeChecks(d),
    ...partyChecks({ key: "defendants", label: "خوانده", anchor: ANCHORS.defendant, fields: DEFENDANT_FIELDS, defect53: true, occupationOptional: false }, d.defendants),
    make(ANCHORS.claim, { id: "claim.subject", label: "تعیین خواسته", status: statusOf(filled(d.claim.subject)), field: "claim.subject", defect53: true }),
    ...valueCheck(spec, d),
    ...bodyChecks(spec, d),
    ...evidenceChecks(spec, d),
    ...requirementChecks(spec, d),
    make(ANCHORS.court, { id: "court", label: "مرجع رسیدگی", status: statusOf(filled(d.court.name)), field: "court.name" }),
    make(ANCHORS.signature, { id: "signature", label: "امضا یا اثر انگشت دادخواست‌دهنده", status: "info", message: "پس از چاپ یا هنگام ثبت در سامانه." }),
    make(ANCHORS.fees, { id: "fees", label: "هزینه دادرسی و تمبر", status: "info", message: "طبق تعرفه روز؛ سامانه آن را محاسبه نمی‌کند." }),
  ];
  const required = checks.filter((c) => c.status === "ok" || c.status === "missing");
  const ok = required.filter((c) => c.status === "ok").length;
  return { checks, required: required.length, ok, missing: required.length - ok, warnings: checks.filter((c) => c.status === "warning").length };
}
