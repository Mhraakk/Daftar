// تجزیه «فرم دادخواست خدمات قضایی» (Fk01/00): مرز ردیف‌ها از خط‌های چاپی جدول در تصویر خاکستری صفحه، متن هر خانه
// از برش pdftotext. توابع این فایل خالص‌اند تا بدون poppler آزموده شوند؛ اجرای ابزارها در import-form.ts است.
import { normalizeFa } from "@/lib/text";

export interface GrayImage { width: number; height: number; data: Uint8Array }
export interface Cell { label: string; value: string }
export interface ValueOption { label: string; checked: boolean }
export interface EvidenceItem { label: string; required: boolean | null }
export interface Blank { key: string; label: string }
export interface OptionalClause { condition: string; text: string }

export interface ParsedForm {
  title: string;
  category: string;
  court: string | null;
  courtBasis: string | null;
  eligible: string | null;
  defendant: string | null;
  valueType: "MALI" | "GHEIR_MALI" | "BY_SUBJECT" | null;
  valueOptions: ValueOption[];
  evidence: EvidenceItem[];
  evidenceInfo: string[];
  fees: string[];
  investigations: string[];
  ancillary: string[];
  bodyTemplate: string;
  blanks: Blank[];
  optionalClauses: OptionalClause[];
  notes: string | null;
  rules: { evidenceOptionalWithInvestigation: boolean };
  formCode: string | null;
  keywords: string[];
  extra: Cell[];
  warnings: string[];
}

// ───────── تصویر خاکستری و خط‌های جدول ─────────

const DARK = 128;
const RULE_FILL = 0.85;
const MERGE_GAP = 2;
const MAX_GRAY = 255;
const WHITESPACE = new Set([" ", "\t", "\n", "\r"].map((c) => c.charCodeAt(0)));
const HASH = "#".charCodeAt(0);
const NEWLINE = "\n".charCodeAt(0);
const HALF = 2;
const PAIR = 2;
const GAP_MARK = " ..... ";

/** نشانه بعدی سرآیند PGM (با پرش از فاصله و توضیح «#…») */
function pgmToken(buf: Buffer, pos: number): { token: string; next: number } {
  if (pos >= buf.length) return { token: "", next: pos };
  if (WHITESPACE.has(buf[pos])) return pgmToken(buf, pos + 1);
  if (buf[pos] === HASH) {
    const eol = buf.indexOf(NEWLINE, pos);
    return pgmToken(buf, eol < 0 ? buf.length : eol + 1);
  }
  const end = Array.from({ length: buf.length - pos }, (_, i) => pos + i).find((i) => WHITESPACE.has(buf[i])) ?? buf.length;
  return { token: buf.toString("latin1", pos, end), next: end };
}

/** خواندن PGM دودویی (P5) که pdftoppm -gray تولید می‌کند */
export function parsePgm(buf: Buffer): GrayImage {
  const magic = pgmToken(buf, 0);
  const w = pgmToken(buf, magic.next);
  const h = pgmToken(buf, w.next);
  const max = pgmToken(buf, h.next);
  if (magic.token !== "P5" || Number(max.token) !== MAX_GRAY) throw new Error("قالب تصویر صفحه پشتیبانی نمی‌شود.");
  const width = Number(w.token);
  const height = Number(h.token);
  const start = max.next + 1;
  return { width, height, data: new Uint8Array(buf.subarray(start, start + width * height)) };
}

const darkShare = (values: Uint8Array | number[]): number =>
  values.length ? Array.from(values).filter((b) => b < DARK).length / values.length : 0;

/** گروه‌بندی اندیس‌های پشت‌سرهم و برگرداندن میانه هر گروه */
function groupCenters(indexes: number[]): number[] {
  const groups = indexes.reduce<number[][]>((acc, i) => {
    const last = acc[acc.length - 1];
    return last && i - last[last.length - 1] <= MERGE_GAP ? [...acc.slice(0, -1), [...last, i]] : [...acc, [i]];
  }, []);
  return groups.map((g) => (g[0] + g[g.length - 1]) / HALF);
}

/** ردیف‌هایی از تصویر که در بازه افقی x0..x1 تقریباً کامل تیره‌اند (خط افقی جدول) */
export function horizontalRules(img: GrayImage, x0: number, x1: number): number[] {
  const rows = Array.from({ length: img.height }, (_, y) => y)
    .filter((y) => darkShare(img.data.subarray(y * img.width + x0, y * img.width + x1)) >= RULE_FILL);
  return groupCenters(rows);
}

/** ستون‌هایی که در بازه عمودی y0..y1 تقریباً کامل تیره‌اند (خط عمودی جدول) */
export function verticalRules(img: GrayImage, y0: number, y1: number): number[] {
  const height = Math.max(0, y1 - y0);
  const cols = Array.from({ length: img.width }, (_, x) => x)
    .filter((x) => darkShare(Array.from({ length: height }, (_, i) => img.data[(y0 + i) * img.width + x])) >= RULE_FILL);
  return groupCenters(cols);
}

// ───────── خطوط متن صفحه و خانه‌های جدول ─────────

export interface TextLine { text: string; x0: number; y0: number; x1: number; y1: number }
export interface Box { x0: number; y0: number; x1: number; y1: number }

const ROW_OVERLAP = 0.5;

const centerIn = (l: TextLine, b: Box): boolean => {
  const cx = (l.x0 + l.x1) / HALF;
  const cy = (l.y0 + l.y1) / HALF;
  return cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1;
};

const sameRow = (a: TextLine, b: TextLine): boolean =>
  Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > ROW_OVERLAP * Math.min(a.y1 - a.y0, b.y1 - b.y0);

/** متن یک خانه از خطوط صفحه: خطوط هم‌ردیف (تکه‌های یک سطر چاپی که با فاصله پهن جدا شده‌اند) از راست به چپ کنار هم
 *  می‌نشینند؛ با gaps=true هر فاصله میان تکه‌ها جای خالی («.....») حساب می‌شود. */
export function cellText(lines: TextLine[], box: Box, gaps: boolean): string {
  const inside = lines.filter((l) => centerIn(l, box)).sort((a, b) => a.y0 - b.y0);
  const rows = inside.reduce<TextLine[][]>((acc, l) => {
    const last = acc[acc.length - 1];
    return last && sameRow(last[0], l) ? [...acc.slice(0, -1), [...last, l]] : [...acc, [l]];
  }, []);
  return rows.map((row) => [...row].sort((a, b) => b.x1 - a.x1).map((l) => l.text.trim()).join(gaps ? GAP_MARK : " ")).join("\n");
}

// ───────── پاک‌سازی متن خانه‌ها ─────────

const BIDI_CONTROLS = new Set(["\u200e", "\u200f", "\u202a", "\u202b", "\u202c", "\u202d", "\u202e", "\u2066", "\u2067", "\u2068", "\u2069"]);
const CHAR_FIX: Record<string, string> = { "ي": "ی", "ى": "ی", "ك": "ک" };

// Parentheses come out mirrored from RTL extraction: matches ") منقول(" (→ "(منقول)"), rejects "(منقول)".
// https://regex101.com/?regex=%5C%29%5Cs*%28%5B%5E%28%29%5D*%3F%29%5Cs*%5C%28&testString=%D9%85%D8%A7%D9%84%20%29%20%D9%85%D9%86%D9%82%D9%88%D9%84%28
const MIRRORED_PARENS = /\)\s*([^()]*?)\s*\(/g;
// Tanvin lost as a double quote at a word end: matches 'احتراما"', rejects '"نقل"'.
// https://regex101.com/?regex=%D8%A7%22%28%3F%3D%5Cs%7C%24%29&testString=%D8%A7%D8%AD%D8%AA%D8%B1%D8%A7%D9%85%D8%A7%22
const LOST_TANVIN = /ا"(?=\s|$)/g;
// A digit glued to a Persian letter: matches "12مبنی", rejects "12 مبنی" and "12،".
// https://regex101.com/?regex=%28%5Cd%29%28%3F%3D%5B%5Cu0621-%5Cu064A%5Cu0671-%5Cu06D3%5D%29&testString=12%D9%85%D8%A8%D9%86%DB%8C
const GLUED_DIGIT = /(\d)(?=[ء-يٱ-ۓ])/g;
// Any run of whitespace: matches "  " and "\t", rejects "ب".
// https://regex101.com/?regex=%5Cs%2B&testString=%D8%A7%D9%84%D9%81%20%20%D8%A8
const WS_RUN = /\s+/;
// A letter glued to an opening parenthesis: matches "سند(", rejects "سند (".
// https://regex101.com/?regex=%28%5B%5Cu0621-%5Cu06D3%5D%29%5C%28&testString=%D8%B3%D9%86%D8%AF%28
const GLUED_PAREN = /([ء-ۓ])\(/g;

const PRIVATE_USE_FIRST = "\ue000";
const PRIVATE_USE_LAST = "\uf8ff";
const plainChar = (c: string): boolean => !BIDI_CONTROLS.has(c) && !(c >= PRIVATE_USE_FIRST && c <= PRIVATE_USE_LAST);

/** متن خام یک خانه → خطوط تمیز (جهت‌نماها و نویسه‌های خصوصی حذف، NFKC، ی/ک فارسی، پرانتز و تنوین درست، فاصله‌ها یکدست) */
export function cleanCellText(raw: string): string[] {
  const plain = [...raw].filter(plainChar).join("").normalize("NFKC");
  const persian = [...plain].map((c) => CHAR_FIX[c] ?? c).join("");
  return persian.split("\n")
    .map((line) => line
      .replace(MIRRORED_PARENS, (_m, inner: string) => `(${inner.trim()})`)
      .replace(LOST_TANVIN, "اً")
      .replace(GLUED_DIGIT, "$1 ")
      .replace(GLUED_PAREN, "$1 (")
      .split(WS_RUN).join(" ").trim())
    .filter((line) => line && line !== "\f");
}

// Punctuation preceded by a space and glued to the next word: matches " .لیکن", rejects ". لیکن".
// https://regex101.com/?regex=%5Cs%2B%28%5B.%D8%8C%3A%D8%9B!%D8%9F%5D%29%28%3F%3D%5CS%29&testString=%D9%86%D9%85%D9%88%D8%AF%D9%87%20.%D9%84%DB%8C%DA%A9%D9%86
const LOOSE_PUNCT = /\s+([.،:؛!؟])(?=\S)/g;
// Punctuation preceded by a space at the end of a line: matches " ." at the end, rejects "است.".
// https://regex101.com/?regex=%5Cs%2B%28%5B.%D8%8C%3A%D8%9B!%D8%9F%5D%29%24&testString=%D9%85%DB%8C%E2%80%8C%D9%86%D9%85%D8%A7%DB%8C%D8%AF%20.
const LOOSE_PUNCT_END = /\s+([.،:؛!؟])$/;
const TERMINAL = [".", "!", "؟", ":"];

/** شکستن خط‌های PDF برداشته و متن به بند (پاراگراف) پیوسته تبدیل می‌شود؛ پایان بند پس از نقطه/دونقطه */
export function reflow(lines: string[]): string[] {
  const paragraphs = lines.reduce<string[]>((acc, line) => {
    const last = acc[acc.length - 1];
    const ends = last === undefined || TERMINAL.some((t) => last.endsWith(t));
    return ends ? [...acc, line] : [...acc.slice(0, -1), `${last} ${line}`];
  }, []);
  return paragraphs.map((p) => p.replace(LOOSE_PUNCT, "$1 ").replace(LOOSE_PUNCT_END, "$1").split(WS_RUN).join(" ").trim());
}

// ───────── برچسب‌ها و فهرست‌ها ─────────

export type FieldKey = "subject" | "evidence" | "evidenceInfo" | "fees" | "investigations" | "ancillary" | "court" | "eligible" | "defendant" | "value" | "body" | "notes" | "footer";

const LABELS: Record<string, FieldKey> = {
  "موضوعخواسته": "subject", "دلایلومنضمات": "evidence", "اطلاعاتدلایلومنضمات": "evidenceInfo", "هزینهدادرسی": "fees",
  "تحقیقاتواقداماتموردتقاضا": "investigations", "خواستههایتبعی": "ancillary", "مرجعذیصلاح": "court", "افرادذیصلاح": "eligible",
  "خوانده": "defendant", "بهایخواسته": "value", "شرحخواسته": "body", "توضیحات": "notes", "تهیهکننده": "footer",
};

const labelKey = (label: string): string => normalizeFa(label).split(" ").join("");

export function fieldOf(label: string): FieldKey | null {
  return LABELS[labelKey(label)] ?? null;
}

// Item markers that number list entries, "-1" / "- 5" or (once, in the forms) "8-" glued to the next word:
// matches "-1هزینه" and " 8-اتیان", rejects "13" and "1403/05/01".
// https://regex101.com/?regex=-%5Cs*%5Cd%2B%5Cs*%7C%5Cs%5Cd%2B-%28%3F%3D%5B%5Cu0600-%5Cu06FF%5D%29&testString=-7%20%D8%B3%D8%A7%DB%8C%D8%B1%20%D9%85%D8%B3%D8%AA%D9%86%D8%AF%D8%A7%D8%AA%208-%D8%A7%D8%AA%DB%8C%D8%A7%D9%86&flavor=javascript
const ITEM_MARKER = /-\s*\d+\s*|\s\d+-(?=[\u0600-\u06FF])/;

/** فهرست شماره‌دار «-1… -2…» (ممکن است در چند خط شکسته شده باشد) → اقلام */
export function splitNumbered(lines: string[]): string[] {
  return lines.join(" ").split(ITEM_MARKER).map((s) => s.trim()).filter(Boolean);
}

// Separator inside a comma-joined list (the PDF puts the comma before the next word): matches " ،" and "، ", rejects " و ".
// https://regex101.com/?regex=%5Cs*%D8%8C%5Cs*&testString=%D8%AF%D8%B1%D8%AE%D9%88%D8%A7%D8%B3%D8%AA%20%D8%A7%D8%B3%D8%AA%D8%B9%D9%84%D8%A7%D9%85%20%D8%8C%D8%AA%D8%AD%D9%82%DB%8C%D9%82%D8%A7%D8%AA%20%D9%85%D8%AD%D9%84%DB%8C&flavor=javascript
const LIST_SEP = /\s*،\s*/;
/** اقدام‌هایی که در برخی فرم‌ها بی‌جداکننده پشت هم آمده‌اند («شماره پرونده استنادی شهادت شهود و مطلعین») */
const KNOWN_INVESTIGATIONS = ["شماره پرونده استنادی", "شهادت شهود و مطلعین", "تحقیقات محلی", "معاینه محلی", "درخواست استعلام", "جلب نظر کارشناس", "اتیان سوگند", "استعلام نظر پزشکی قانونی"];

function splitFused(item: string): string[] {
  const found = KNOWN_INVESTIGATIONS.filter((k) => item.includes(k));
  const rest = found.reduce((t, k) => t.replace(k, ""), item).trim();
  return found.length > 1 && !rest ? [...found].sort((a, b) => item.indexOf(a) - item.indexOf(b)) : [item];
}

/** تحقیقات و اقدامات: فهرست شماره‌دار یا جداشده با «،»؛ اقدام‌های شناخته‌شده چسبیده از هم جدا می‌شوند */
export function splitInvestigations(lines: string[]): string[] {
  return splitNumbered(lines).flatMap((s) => s.split(LIST_SEP)).map((s) => s.trim()).filter(Boolean).flatMap(splitFused);
}

// Separators between ancillary claims: matches " -" , "–" and "،", rejects "دستور موقت".
// https://regex101.com/?regex=%5Cs*%5B-%E2%80%93%D8%8C%5D%5Cs*&testString=%D8%AF%D8%B3%D8%AA%D9%88%D8%B1%20%D9%85%D9%88%D9%82%D8%AA%20-%D8%AA%D8%A3%D9%85%DB%8C%D9%86
const ANCILLARY_SEP = /\s*[-–،]\s*/;
const KNOWN_ANCILLARY = ["تأمین خواسته", "تامین خواسته", "دستور موقت", "دستور توقف اجرا", "خسارات دادرسی", "خسارت دادرسی", "خسارات وارده", "خسارت تأخیر تأدیه"];
const NONE_WORDS = new Set(["ندارد", "-"]);

/** خواسته‌های تبعی: ترکیب واژه‌های شناخته‌شده؛ در غیر این صورت جداسازی با خط تیره */
export function splitAncillary(lines: string[]): string[] {
  const text = lines.join(" ").trim();
  if (!text || NONE_WORDS.has(text)) return [];
  const known = KNOWN_ANCILLARY.filter((k) => text.includes(k)).filter((k, _i, all) => !all.some((o) => o !== k && o.includes(k)));
  if (known.length) return known.map((k) => k.replace("تامین", "تأمین"));
  return text.split(ANCILLARY_SEP).map((s) => s.trim()).filter(Boolean);
}

const REQUIRED_MARK = "(اجباری)";
const OPTIONAL_MARK = "(اختیاری)";
const REQUIREMENT: Record<string, boolean | null> = { required: true, optional: false, unknown: null };
const EVIDENCE_START = ["تصویر", "اصل", "رونوشت", "گواهی", "سند", "استشهادیه", "فهرست", "مدارک", "کپی"];

/** دلایل و منضمات: هر قلم با نشانه «(اجباری)» یا «(اختیاری)» */
export function parseEvidence(lines: string[]): EvidenceItem[] {
  const pieces = lines.flatMap((l) => l.split(ITEM_MARKER)).map((s) => s.trim()).filter(Boolean);
  const merged = pieces.reduce<string[]>((acc, p) => {
    const startsItem = EVIDENCE_START.some((w) => p.startsWith(w)) || !acc.length;
    return startsItem ? [...acc, p] : [...acc.slice(0, -1), `${acc[acc.length - 1]} ${p}`];
  }, []);
  return merged.map((p) => {
    const compact = p.split(" ").join("");
    const flag = [compact.includes(OPTIONAL_MARK) && "optional", compact.includes(REQUIRED_MARK) && "required"].find(Boolean) || "unknown";
    const label = [REQUIRED_MARK, OPTIONAL_MARK].reduce((t, mark) => t.split(mark).join(" "), p.split("( ").join("(").split(" )").join(")"));
    return { label: label.split(WS_RUN).join(" ").trim(), required: REQUIREMENT[flag] };
  });
}

const CHECKED = "■";
const UNCHECKED = "□";
// Split point right after a checkbox glyph: matches the gap after "■" in "مبلغ معین ■ مال منقول□", rejects plain text.
// https://regex101.com/?regex=%28%3F%3C%3D%5B%E2%96%A0%E2%96%A1%5D%29&testString=%D9%85%D8%A8%D9%84%D8%BA%20%E2%96%A0%20%D9%85%D8%A7%D9%84%E2%96%A1
const AFTER_CHECKBOX = /(?<=[■□])/;
// Checkbox glyphs and slashes to strip from option labels: matches "■", "□" and "/", rejects "م".
// https://regex101.com/?regex=%5B%E2%96%A0%E2%96%A1%2F%5D&testString=%D9%85%D8%A7%D9%84%E2%96%A1
const CHECKBOX_MARKS = /[■□/]/g;

/** بهای خواسته: گزینه‌های تیک‌دار (■ انتخاب‌شده، □ انتخاب‌نشده) و نوع مالی/غیرمالی */
export function parseValue(lines: string[]): { valueType: ParsedForm["valueType"]; options: ValueOption[] } {
  const text = lines.join(" / ").trim();
  const options = text.includes(CHECKED) || text.includes(UNCHECKED)
    ? text.split(AFTER_CHECKBOX).map((part) => ({ label: part.replace(CHECKBOX_MARKS, " ").split(WS_RUN).join(" ").trim(), checked: part.includes(CHECKED) })).filter((o) => o.label)
    : [];
  const norm = normalizeFa(text);
  const nonFinancial = norm.includes("غیر مالی") || norm.includes("غیرمالی");
  const financial = norm.replace("غیر مالی", "").replace("غیرمالی", "").includes("مال") || norm.includes("مبلغ");
  const both = nonFinancial && financial;
  const pick: Record<string, ParsedForm["valueType"]> = { both: "BY_SUBJECT", non: "GHEIR_MALI", fin: "MALI", none: null };
  const key = [both && "both", nonFinancial && "non", financial && "fin"].find(Boolean) || "none";
  return { valueType: pick[key], options };
}

// ───────── متن «شرح خواسته» با جاهای خالی ─────────

// Runs of dots or ellipses marking a blank to fill: matches "....." and "…", rejects "a.b".
// https://regex101.com/?regex=%28%3F%3A%5C.%5Cs*%29%7B3%2C%7D%7C%E2%80%A6%2B&testString=%D8%B4%D9%85%D8%A7%D8%B1%D9%87%20.....%20%D9%85%D9%88%D8%B1%D8%AE
const DOT_BLANK = /(?:\.\s*){3,}|…+/;
// A date placeholder: dot runs or gaps separated by two or more slashes, optionally with a printed "13"/"14" century,
// e.g. "..../..../....", "..... / ..... / ..... 13", "13 / /" and "/ ..... 13 /"; rejects a real date "1405/01/01" and "باطل /فسخ".
// https://regex101.com/?regex=%28%3F%3A1%5B34%5D%5Cs*%29%3F%5B.%5Cs%5D*%28%3F%3A%5C%2F%5B.%5Cs%5D*%28%3F%3A1%5B34%5D%28%3F!%5Cd%29%5B.%5Cs%5D*%29%3F%29%7B2%2C%7D%28%3F%3A1%5B34%5D%28%3F!%5Cd%29%29%3F&testString=%D9%85%D9%88%D8%B1%D8%AE%20.....%20%2F%20.....%20%2F%20.....%2013%20%D8%B5%D8%A7%D8%AF%D8%B1
const DATE_CLUSTER = /(?:1[34]\s*)?[.\s]*(?:\/[.\s]*(?:1[34](?!\d)[.\s]*)?){2,}(?:1[34](?!\d))?/g;
const DATE_TOKEN = "@@DATE@@";
const STOP_WORDS = new Set(["و", "به", "از", "در", "را", "که", "با", "این", "آن", "یا", "تا", "بر"]);
const CONTEXT_WORDS = 2;
const FALLBACK_LABEL = "جای خالی";

// Punctuation removed before picking context words for a blank's label: matches ".", ":", "،", "/" and "()", rejects "س".
// https://regex101.com/?regex=%5B.%3A%D8%8C%2F%28%29%5D&testString=%D8%B4%D9%85%D8%A7%D8%B1%D9%87%3A
const LABEL_PUNCT = /[.:،/()]/g;

const DATE_WORD = "تاریخ";
const DATED_WORD = "مورخ";

function labelFor(before: string, after: string): string {
  const prev = before.replace(LABEL_PUNCT, " ").split(WS_RUN).filter(Boolean);
  const trimmed = prev.slice(-CONTEXT_WORDS).filter((w) => !STOP_WORDS.has(w));
  const next = after.replace(LABEL_PUNCT, " ").split(WS_RUN).filter((w) => w && !STOP_WORDS.has(w)).slice(0, CONTEXT_WORDS);
  return (trimmed.join(" ") || next.join(" ") || FALLBACK_LABEL).trim();
}

/** برچسب جای خالی تاریخ: «تاریخ …» بی‌تکرار «تاریخ» یا «مورخ» */
function dateLabelFor(before: string): string {
  const ctx = labelFor(before, "").split(" ").filter((w) => w !== DATED_WORD && w !== FALLBACK_LABEL.split(" ")[0] && w !== FALLBACK_LABEL.split(" ")[1]).join(" ");
  if (ctx.includes(DATE_WORD)) return ctx;
  return ctx ? `${DATE_WORD} ${ctx}` : DATE_WORD;
}

// A blank (dot run) or a date placeholder token, captured so split() keeps it: matches "....." and "@@DATE@@", rejects "نام".
// https://regex101.com/?regex=%28%28%3F%3A%5C.%5Cs*%29%7B3%2C%7D%7C%E2%80%A6%2B%7C%40%40DATE%40%40%29&testString=%D8%B4%D9%85%D8%A7%D8%B1%D9%87%20.....
const BLANK_OR_DATE = new RegExp(`(${DOT_BLANK.source}|${DATE_TOKEN})`);

export interface BlankifyResult { text: string; blanks: Blank[]; used: ReadonlyMap<string, number> }

/** جایگزینی جاهای خالی یک خط با «{{برچسب}}»؛ برچسب از واژه‌های پیش از جای خالی ساخته و یکتا می‌شود */
export function blankify(line: string, used: ReadonlyMap<string, number> = new Map()): BlankifyResult {
  const prepared = line.replace(DATE_CLUSTER, ` ${DATE_TOKEN} `);
  const parts = prepared.split(BLANK_OR_DATE);
  const result = parts.reduce<BlankifyResult>((acc, part, i) => {
    if (i % PAIR !== 1) return { ...acc, text: acc.text + part };
    const base = part === DATE_TOKEN ? dateLabelFor(parts[i - 1] ?? "") : labelFor(parts[i - 1] ?? "", parts[i + 1] ?? "");
    const n = (acc.used.get(base) ?? 0) + 1;
    const label = n > 1 ? `${base} (${n})` : base;
    return { text: `${acc.text} {{${label}}} `, blanks: [...acc.blanks, { key: label, label }], used: new Map([...acc.used, [base, n]]) };
  }, { text: "", blanks: [], used });
  return { ...result, text: result.text.split(WS_RUN).join(" ").trim() };
}

// Dots or ellipses after the court name in the header: matches "....." and "…", rejects "دادگاه".
// https://regex101.com/?regex=%5B.%E2%80%A6%5D%2B&testString=%D8%AF%D8%A7%D8%AF%DA%AF%D8%A7%D9%87%20.....
const DOT_RUN = /[.…]+/g;
// Quote marks around an optional clause: matches '"', '«' and '»', rejects "ض".
// https://regex101.com/?regex=%5B%22%C2%AB%C2%BB%5D&testString=%C2%AB%D8%B6%D9%85%D9%86%D8%A7%C2%BB
const QUOTE_MARKS = /["«»]/g;
const BODY_START = "ریاست محترم";
const BODY_END = "تجدید احترام";
const CLOSING = "با تشکر";
const COURT_BLANK = "مرجع رسیدگی";
const CLAUSE_HINT = "این عبارت";
const CLAUSE_ADD = "اضافه شود";

/** پایان بند اختیاری: پیش از «با تشکر» اگر پس از آن آمده باشد، وگرنه پایان متن؛ بدون بند، -1 */
function clauseEndOf(hintIdx: number, closingIdx: number, length: number): number {
  if (hintIdx < 0) return hintIdx;
  return closingIdx > hintIdx ? closingIdx : length;
}

/** «شرح خواسته»: سرآیند دادگاه، متن با جاهای خالی، بندهای اختیاری («در صورتی که … این عبارت … اضافه شود "…"») */
export function parseBody(lines: string[]): { court: string | null; template: string; blanks: Blank[]; clauses: OptionalClause[] } {
  const startIdx = Math.max(0, lines.findIndex((l) => l.includes(BODY_START)));
  const endIdx = lines.findIndex((l) => l.includes(BODY_END));
  const body = lines.slice(startIdx, endIdx >= 0 ? endIdx + 1 : lines.length);
  const header = body[0] ?? "";
  const courtText = header.replace(BODY_START, "").replace(DOT_RUN, " ").trim();
  const court = courtText.startsWith("دادگاه") && courtText.length > "دادگاه".length ? courtText : null;
  const hintIdx = body.findIndex((l) => l.includes(CLAUSE_HINT) && body.slice(body.indexOf(l)).join(" ").includes(CLAUSE_ADD));
  const closingIdx = body.findIndex((l) => l.startsWith(CLOSING));
  const clauseEnd = clauseEndOf(hintIdx, closingIdx, body.length);
  const clauseText = body.slice(Math.max(hintIdx, 0), clauseEnd).join(" ");
  const quoted = clauseText.split('"').filter((_s, i) => i % PAIR === 1).join(" ").trim();
  const clauses = hintIdx >= 0 ? [{ condition: clauseText.split(CLAUSE_HINT)[0].trim(), text: quoted || clauseText.split(CLAUSE_ADD).slice(1).join(CLAUSE_ADD).replace(QUOTE_MARKS, "").trim() }] : [];
  const kept = body.filter((_l, i) => i !== 0 && !(hintIdx >= 0 && i >= hintIdx && i < clauseEnd));
  const closing = kept.findIndex((l) => l.startsWith(CLOSING));
  const main = reflow(closing >= 0 ? kept.slice(0, closing) : kept.filter((l) => !l.includes(BODY_END)));
  const filled = main.reduce<BlankifyResult[]>((acc, l) => [...acc, blankify(l, acc[acc.length - 1]?.used ?? new Map())], []);
  const text = [`${BODY_START} {{${COURT_BLANK}}}`, ...filled.map((f) => f.text), `${CLOSING} و ${BODY_END}`].join("\n");
  return { court, template: text, blanks: [{ key: COURT_BLANK, label: COURT_BLANK }, ...filled.flatMap((f) => f.blanks)], clauses };
}

// ───────── دسته‌بندی ─────────

const CATEGORY_RULES: [string, string[]][] = [
  ["خانواده", ["مهریه", "زوجیت", "ازدواج", "طلاق", "جهیزیه", "طفل", "نفقه", "حضانت"]],
  ["ثبت احوال", ["شناسنامه"]],
  ["کار و تأمین اجتماعی", ["حل اختلاف", "وزارت کار"]],
  ["داوری", ["داور"]],
  ["شرکت‌ها و تجارت", ["مجمع", "ورشکست", "شرکت"]],
  ["مالکیت فکری", ["اختراع", "علامت تجاری", "طرح صنعتی"]],
  ["املاک و ثبت", ["ثبت", "غیرمنقول", "غیر منقول", "مبایعه", "کمیسیون", "زمین", "تاریخ اسناد"]],
  ["اسناد، چک و تعهدات", ["چک", "اجرائیه", "سند", "ثمن", "صلح", "مال", "مالکیت"]],
];
const DEFAULT_CATEGORY = "سایر دعاوی حقوقی";

export function categoryOf(title: string): string {
  return CATEGORY_RULES.find(([, words]) => words.some((w) => title.includes(w)))?.[0] ?? DEFAULT_CATEGORY;
}

// A form code such as "Fk01/00": matches "Fk01/00", rejects "1402/01".
// https://regex101.com/?regex=%5BA-Za-z%5D%7B1%2C3%7D%5Cd%7B2%7D%5C%2F%5Cd%7B2%7D&testString=%DA%A9%D8%AF%20%D9%81%D8%B1%D9%85%20%3A%20Fk01%2F00
const FORM_CODE = /[A-Za-z]{1,3}\d{2}\/\d{2}/;
const KEYWORD_MIN = 3;
// Spacing around an opening parenthesis: matches "مال( " and "مال (", rejects "مال".
// https://regex101.com/?regex=%5Cs*%5C%28%5Cs*&testString=%D9%85%D8%A7%D9%84%28%20%D9%85%D9%86%D9%82%D9%88%D9%84
const PAREN_OPEN_SPACING = /\s*\(\s*/g;
// Spacing around a closing parenthesis: matches " )" and ")", rejects "مال".
// https://regex101.com/?regex=%5Cs*%5C%29%5Cs*&testString=%D9%85%D9%86%D9%82%D9%88%D9%84%20%29
const PAREN_CLOSE_SPACING = /\s*\)\s*/g;
const INVESTIGATION_HINT = "تحقیقات";
const OPTIONAL_HINT = "اختیاری";

/** خانه‌های یک فرم → ساختار نوع دادخواست */
export function parseForm(cells: Cell[]): ParsedForm {
  const lines = (c: Cell) => c.value.split("\n").map((l) => l.trim()).filter(Boolean);
  const fields = cells.reduce<Partial<Record<FieldKey, string[]>>>((acc, c) => {
    const key = fieldOf(c.label);
    return key ? { ...acc, [key]: [...(acc[key] ?? []), ...lines(c)] } : acc;
  }, {});
  const extra = cells.filter((c) => c.label && !fieldOf(c.label));
  const get = (k: FieldKey) => fields[k] ?? [];
  const one = (k: FieldKey) => get(k).join(" ").trim() || null;
  const title = (one("subject") ?? "").replace(PAREN_OPEN_SPACING, " (").replace(PAREN_CLOSE_SPACING, ") ").trim();
  const body = parseBody(get("body"));
  const value = parseValue(get("value"));
  const notes = get("notes").join(" ").trim() || null;
  const footer = get("footer").join(" ");
  const warnings = [
    !title && "موضوع خواسته پیدا نشد.",
    !get("body").length && "شرح خواسته پیدا نشد.",
    !value.valueType && "نوع بهای خواسته (مالی/غیرمالی) در فرم نیامده است.",
    !body.court && !one("court") && "مرجع رسیدگی در فرم مشخص نشده است.",
    ...extra.map((c) => `برچسب ناشناخته «${c.label}» به‌صورت فیلد اضافه نگه داشته شد.`),
  ].filter((w): w is string => !!w);
  return {
    title,
    category: categoryOf(title),
    court: body.court,
    courtBasis: one("court"),
    eligible: one("eligible"),
    defendant: one("defendant"),
    valueType: value.valueType,
    valueOptions: value.options,
    evidence: parseEvidence(get("evidence")),
    evidenceInfo: get("evidenceInfo").flatMap((l) => l.split(ITEM_MARKER)).map((s) => s.trim()).filter(Boolean),
    fees: splitNumbered(get("fees")),
    investigations: splitInvestigations(get("investigations")),
    ancillary: splitAncillary(get("ancillary")),
    bodyTemplate: body.template,
    blanks: body.blanks,
    optionalClauses: body.clauses,
    notes,
    rules: { evidenceOptionalWithInvestigation: !!notes && notes.includes(INVESTIGATION_HINT) && notes.includes(OPTIONAL_HINT) },
    formCode: footer.match(FORM_CODE)?.[0] ?? null,
    keywords: [...new Set(normalizeFa(title).split(" ").filter((w) => w.length >= KEYWORD_MIN))],
    extra,
    warnings,
  };
}
