// ساخت برگ دادخواست (HTML قابل ویرایش، چاپ و تبدیل به Word/PDF) از نوع دادخواست و داده ساخت‌یافته:
// جدول طرفین به ترتیب ماده ۵۱ ق.آ.د.م، خواسته و بها، رأی مورد اعتراض یا پرونده اصلی، دلایل، گواهان، مرجع و شرح خواسته.
// هر ورودی کاربر escape می‌شود؛ خروجی پیش از ذخیره از sanitizeLegalHtml هم می‌گذرد. جای خالیِ پرنشده با
// «………… (برچسب)» نمایش داده می‌شود تا در برگ چاپی دیده شود و اعتبارسنجی آن را گزارش کند.
import { toEnDigits, toFaDigits } from "@/lib/text";
import { emptyParty, partyName, type PetitionData, type PetitionParty, type PetitionSpec, type Representative } from "./data";

// A template blank: matches "{{مرجع رسیدگی}}" (captures "مرجع رسیدگی"), rejects "{مرجع}" and "{{}}".
// https://regex101.com/?regex=%5C%7B%5C%7B%28%5B%5E%7B%7D%5D%2B%29%5C%7D%5C%7D&testString=%7B%7B%D9%85%D8%B1%D8%AC%D8%B9%20%D8%B1%D8%B3%DB%8C%D8%AF%DA%AF%DB%8C%7D%7D&flavor=javascript
const BLANK = /\{\{([^{}]+)\}\}/g;
// One HTML-special character: matches "<" in "<b>" and "&" in "a&b", rejects "abc".
// https://regex101.com/?regex=%5B%26%3C%3E%22%27%5D&testString=%3Cb%3E%20a%26b&flavor=javascript
const HTML_SPECIAL = /[&<>"']/g;
// Anything that is not a Latin digit: matches "٬" and " ریال" in "12٬000 ریال", rejects "12000".
// https://regex101.com/?regex=%5CD&testString=12%D9%AC000%20%D8%B1%DB%8C%D8%A7%D9%84&flavor=javascript
const NON_DIGIT = /\D/g;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const CLOSING = "با تشکر و تجدید احترام";
export const EMPTY_BLANK = "…………";
const BRANCH = "شعبه";
const FA_NUMBER = new Intl.NumberFormat("fa-IR");

const SIDES: Record<string, readonly [string, string]> = {
  APPEAL: ["تجدیدنظرخواه", "تجدیدنظرخوانده"],
  DEFAULT_OBJECTION: ["واخواه", "واخوانده"],
  CASSATION: ["فرجام‌خواه", "فرجام‌خوانده"],
  THIRD_PARTY_OBJECTION: ["معترض ثالث", "معترض‌علیه"],
  RETRIAL: ["خواهان اعاده دادرسی", "خوانده اعاده دادرسی"],
  THIRD_PARTY_ENTRY: ["وارد ثالث", "طرفین دعوای اصلی"],
  THIRD_PARTY_JOINDER: ["جالب ثالث", "مجلوب ثالث"],
  COUNTERCLAIM: ["خواهان دعوای متقابل", "خوانده دعوای متقابل"],
};
const DEFAULT_SIDES = ["خواهان", "خوانده"] as const;
/** درخواست‌هایی که برگ آن‌ها «درخواست» است نه «دادخواست» */
export const REQUEST_SUBKINDS = new Set(["ATTACHMENT", "INTERIM_ORDER"]);
const REPRESENTATIVE_LABELS: Record<Representative["kind"], string> = { LAWYER: "وکیل", AGENT: "نماینده قانونی", GUARDIAN: "ولی / قیم" };
const PARTY_COLUMNS = ["سمت", "نام", "نام خانوادگی", "نام پدر", "سن", "شغل", "کد / شناسه ملی", "اقامتگاه"];
/** ستون‌های میانی جدول طرفین که برای شخص حقوقی و نماینده در یک خانه ادغام می‌شوند */
const LEGAL_NAME_SPAN = 5;
const LICENSE_SPAN = 3;

export const sideLabels = (spec: Pick<PetitionSpec, "subKind">): readonly [string, string] => SIDES[spec.subKind ?? ""] ?? DEFAULT_SIDES;

const esc = (s: string): string => s.replace(HTML_SPECIAL, (c) => ESCAPES[c] ?? c);
/** ارقام فارسی برای متن نمایشی (ارقام عربی و لاتین هر دو) */
const fa = (s: string): string => toFaDigits(toEnDigits(s));
const show = (s: string): string => esc(fa(s.trim()));
const joinNames = (parties: PetitionParty[]): string => parties.map(partyName).filter(Boolean).join("، ");

function branchLabel(branch: string): string {
  const b = branch.trim();
  if (!b) return "";
  return b.startsWith(BRANCH) ? b : `${BRANCH} ${b}`;
}

/** «شعبه ۱۲ دادگاه عمومی حقوقی تهران» */
export function courtLabel(c: PetitionData["court"]): string {
  const city = c.city.trim() && !c.name.includes(c.city.trim()) ? c.city.trim() : "";
  return [branchLabel(c.branch), c.name.trim(), city].filter(Boolean).join(" ");
}

/** بهای خواسته با جداکننده هزارگان فارسی؛ ورودی بی‌رقم → رشته خالی */
export function formatAmount(raw: string): string {
  const digits = toEnDigits(raw).replace(NON_DIGIT, "");
  return digits ? FA_NUMBER.format(BigInt(digits)) : "";
}

export function amountOf(raw: string): bigint {
  const digits = toEnDigits(raw).replace(NON_DIGIT, "");
  return digits ? BigInt(digits) : BigInt(0);
}

/** جاهای خالی‌ای که از داده ساخت‌یافته پر می‌شوند و کاربر جداگانه وارد نمی‌کند */
export const BLANK_BINDINGS: Record<string, (d: PetitionData) => string> = {
  "مرجع رسیدگی": (d) => courtLabel(d.court),
  "نوع رأی (حکم/قرار)": (d) => d.decision.kind,
  "شماره دادنامه": (d) => d.decision.number,
  "تاریخ دادنامه": (d) => d.decision.date,
  "شعبه صادرکننده": (d) => d.decision.branch,
  "دادگاه صادرکننده": (d) => d.decision.court,
  "تاریخ ابلاغ رأی": (d) => d.decision.serviceDate,
  "کلاسه پرونده اصلی": (d) => d.mainCase.number,
  "شعبه رسیدگی‌کننده": (d) => d.mainCase.branch,
  "دادگاه رسیدگی‌کننده": (d) => d.mainCase.court,
  "خواهان دعوای اصلی": (d) => d.mainCase.plaintiff,
  "خوانده دعوای اصلی": (d) => d.mainCase.defendant,
  "خواسته دعوای اصلی": (d) => d.mainCase.subject,
  "نام خوانده": (d) => joinNames(d.defendants),
  "نام مجلوب ثالث": (d) => joinNames(d.defendants),
};

/** هر تکه با اندیس فرد در split با گروه گیرنده، برچسب جای خالی است */
const PART_STRIDE = 2;
/** تکه‌های یک سطر قالب به ترتیب: متن ساده یا برچسب جای خالی (برای نمایش برجسته در کاتالوگ و استودیو) */
export const templateParts = (line: string): { text: string; blank: boolean }[] =>
  line.split(BLANK).map((text, i) => ({ text, blank: i % PART_STRIDE === 1 })).filter((p) => p.text !== "");

export const blankKeys = (template: string): string[] => [...new Set([...template.matchAll(BLANK)].map((m) => m[1].trim()))];

/** جاهای خالی‌ای که کاربر باید خودش پر کند (متن اصلی و همه بندهای اختیاری) */
export function userBlanks(spec: Pick<PetitionSpec, "bodyTemplate" | "optionalClauses">): string[] {
  return blankKeys([spec.bodyTemplate, ...spec.optionalClauses.map((c) => c.text)].join("\n")).filter((k) => !(k in BLANK_BINDINGS));
}

function withClauses(template: string, clauses: string[]): string {
  if (!clauses.length) return template;
  const lines = template.split("\n");
  const at = lines.findIndex((l) => l.trim().startsWith(CLOSING));
  const pos = at < 0 ? lines.length : at;
  return [...lines.slice(0, pos), ...clauses, ...lines.slice(pos)].join("\n");
}

export interface FilledBody { text: string; lines: string[]; unfilled: string[] }

/** شرح خواسته: بندهای اختیاری انتخاب‌شده پیش از عبارت پایانی، جاهای خالی از داده یا مقدار کاربر */
export function fillBody(spec: Pick<PetitionSpec, "bodyTemplate" | "optionalClauses">, data: PetitionData): FilledBody {
  const clauses = spec.optionalClauses.filter((c) => data.clauses.includes(c.condition)).map((c) => c.text);
  const template = withClauses(spec.bodyTemplate, clauses);
  const valueOf = (key: string): string => (BLANK_BINDINGS[key]?.(data) || data.blanks[key] || "").trim();
  const unfilled = blankKeys(template).filter((k) => !valueOf(k));
  const text = template.replace(BLANK, (_m, raw: string) => valueOf(raw.trim()) || `${EMPTY_BLANK} (${raw.trim()})`);
  return { text, lines: text.split("\n").filter((l) => l.trim()), unfilled };
}

const td = (s: string, span = 1): string => (span > 1 ? `<td colspan="${span}">${s}</td>` : `<td>${s}</td>`);
const numbered = (role: string, i: number, n: number): string => (n > 1 ? `${role} ${toFaDigits(i + 1)}` : role);

function contactOf(p: { address: string; postalCode?: string; phone: string }): string {
  return [p.address.trim(), p.postalCode?.trim() ? `کد پستی ${p.postalCode.trim()}` : "", p.phone.trim() ? `تلفن ${p.phone.trim()}` : ""].filter(Boolean).join("، ");
}

function partyRow(role: string, p: PetitionParty): string {
  const middle = p.partyType === "LEGAL"
    ? td(`${show(p.legalName)} (شخص حقوقی)`, LEGAL_NAME_SPAN)
    : [p.firstName, p.lastName, p.fatherName, p.age, p.occupation].map((v) => td(show(v))).join("");
  return `<tr>${td(`<strong>${esc(role)}</strong>`)}${middle}${td(show(p.nationalId))}${td(show(contactOf(p)))}</tr>`;
}

function representativeRow(r: Representative): string {
  const license = r.licenseNo.trim() ? `شماره پروانه: ${show(r.licenseNo)}` : "";
  return `<tr>${td(`<strong>${esc(REPRESENTATIVE_LABELS[r.kind])}</strong>`)}${td(show(r.firstName))}${td(show(r.lastName))}${td(license, LICENSE_SPAN)}${td("")}${td(show(contactOf(r)))}</tr>`;
}

function sideRows(role: string, parties: PetitionParty[]): string[] {
  if (!parties.length) return [partyRow(role, emptyParty())];
  return parties.map((p, i) => partyRow(numbered(role, i, parties.length), p));
}

function partiesTable(spec: PetitionSpec, d: PetitionData): string {
  const [filer, opponent] = sideLabels(spec);
  const head = `<thead><tr>${PARTY_COLUMNS.map((c) => `<th>${c}</th>`).join("")}</tr></thead>`;
  const rows = [...sideRows(filer, d.plaintiffs), ...d.representatives.map(representativeRow), ...sideRows(opponent, d.defendants)];
  return `<table>${head}<tbody>${rows.join("")}</tbody></table>`;
}

function claimText(d: PetitionData): string {
  const subject = show(d.claim.subject);
  if (d.claim.valueType === "GHEIR_MALI") return `${subject} (غیرمالی)`;
  if (d.claim.valueType !== "MALI") return subject;
  const amount = formatAmount(d.claim.value);
  const basis = d.claim.valueBasis.trim() ? ` (${show(d.claim.valueBasis)})` : "";
  const value = amount ? `${amount} ریال${basis}` : `${EMPTY_BLANK}${basis}`;
  return `${subject} — بهای خواسته: ${value}`;
}

function decisionText(d: PetitionData): string {
  const x = d.decision;
  const parts = [
    x.kind.trim() ? show(x.kind) : "",
    x.number.trim() ? `شماره ${show(x.number)}` : "",
    x.date.trim() ? `مورخ ${show(x.date)}` : "",
    [branchLabel(x.branch), x.court.trim()].filter(Boolean).length ? `صادره از ${show([branchLabel(x.branch), x.court.trim()].filter(Boolean).join(" "))}` : "",
    x.serviceDate.trim() ? `— تاریخ ابلاغ: ${show(x.serviceDate)}` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

function mainCaseText(d: PetitionData): string {
  const m = d.mainCase;
  const where = [branchLabel(m.branch), m.court.trim()].filter(Boolean).join(" ");
  const sides = [m.plaintiff.trim() ? `خواهان: ${show(m.plaintiff)}` : "", m.defendant.trim() ? `خوانده: ${show(m.defendant)}` : ""].filter(Boolean).join("، ");
  return [m.number.trim() ? `کلاسه ${show(m.number)}` : "", where ? show(where) : "", sides, m.subject.trim() ? `خواسته: ${show(m.subject)}` : ""].filter(Boolean).join(" — ");
}

const listText = (items: string[]): string => items.map((x, i) => `${toFaDigits(i + 1)}- ${show(x)}`).join("<br>");

function detailRows(spec: PetitionSpec, d: PetitionData): [string, string][] {
  const decision = decisionText(d);
  const mainCase = mainCaseText(d);
  const evidence = d.evidence.filter((e) => e.include && e.label.trim()).map((e) => (e.detail.trim() ? `${e.label} (${e.detail})` : e.label));
  const witnesses = d.witnesses.filter((w) => w.name.trim()).map((w) => [w.name, w.details, w.address.trim() ? `نشانی: ${w.address}` : ""].filter((x) => x.trim()).join("، "));
  const rows: [string, string, boolean][] = [
    ["تعیین خواسته و بهای آن", claimText(d), true],
    ["رأی مورد اعتراض", decision, spec.kind === "OBJECTION" || !!decision],
    ["پرونده اصلی", mainCase, spec.kind === "INCIDENTAL" || !!mainCase],
    ["دلایل و منضمات دادخواست", listText(evidence), true],
    ["گواهان و مطلعین", listText(witnesses), witnesses.length > 0],
    ["تحقیقات و استعلامات درخواستی", d.investigations.filter((x) => x.trim()).map(show).join("، "), d.investigations.length > 0],
    ["خواسته‌های فرعی", d.ancillary.filter((x) => x.trim()).map(show).join("، "), d.ancillary.length > 0],
    ["مرجع رسیدگی", show(courtLabel(d.court)), true],
  ];
  return rows.filter(([, , visible]) => visible).map(([label, value]) => [label, value]);
}

/** برگ کامل دادخواست به HTML */
export function renderPetitionHtml(spec: PetitionSpec, d: PetitionData): string {
  const [filer] = sideLabels(spec);
  const heading = REQUEST_SUBKINDS.has(spec.subKind ?? "") ? "درخواست" : "دادخواست";
  const details = detailRows(spec, d).map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`).join("");
  const body = fillBody(spec, d).lines.map((l) => `<p>${show(l)}</p>`).join("");
  const signer = d.representatives.length ? `${filer} / ${REPRESENTATIVE_LABELS[d.representatives[0].kind]}` : filer;
  return [
    `<h1 style="text-align:center">${heading}</h1>`,
    `<p style="text-align:center"><strong>${show(spec.title)}</strong></p>`,
    partiesTable(spec, d),
    `<table><tbody>${details}</tbody></table>`,
    `<h3>شرح خواسته</h3>`,
    body,
    `<p style="text-align:left">نام و امضا یا اثر انگشت ${esc(signer)}</p>`,
  ].join("\n");
}
