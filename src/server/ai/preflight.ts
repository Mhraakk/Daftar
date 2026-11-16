// فهرست بررسی پیش از تحلیل قرارداد (گام ۱ مهارت contract-review: جاهای خالی، پیوست‌های ارجاع‌شده، وضعیت امضا،
// کامل بودن متن) و «پویش سریع نشانه‌های خطر» همان مهارت، به‌علاوه نشانه‌های رایج در قراردادهای فارسی.
// این بررسی قطعی و بدون هوش مصنوعی است؛ فقط محل‌هایی را نشان می‌دهد که بررسی انسانی می‌خواهند و درباره قانون حکمی نمی‌دهد.
import { toEnDigits } from "@/lib/text";

export interface Finding { line: number; excerpt: string }
export interface FlagResult { key: string; label: string; hits: Finding[] }
export interface ExhibitRef { label: string; firstLine: number; found: boolean }
export type SignatureStatus = "BLOCK_EMPTY" | "BLOCK_PRESENT" | "NO_BLOCK";

export interface PreflightResult {
  documentType: string | null;
  blanks: Finding[];
  exhibits: ExhibitRef[];
  signature: { status: SignatureStatus; evidence: Finding | null };
  completeness: string[];
  redFlags: FlagResult[];
  stats: { lines: number; words: number; chars: number };
}

const RUN_LENGTH = 4;
const EXCERPT_MAX = 140;
const MAX_HITS_PER_FLAG = 6;
const MAX_BLANKS = 30;
const SIGNATURE_TAIL_LINES = 40;
const HEADING_MAX_CHARS = 90;
const ZWNJ = "\u200c";
/** فاصله واژه‌ها در الگوهای «پیوست شماره ۲» و «صفحه ۳ از ۱۰» نسبت به واژه کلیدی */
const OFFSET_NEXT = 1;
const OFFSET_AFTER_NEXT = 2;
const OFFSET_THIRD = 3;
const BULLET_CHARS = "#*-–•· \t";

/** یکسان‌سازی برای جست‌وجو: ارقام لاتین، ی و ک فارسی، حذف نیم‌فاصله، حروف کوچک */
export function normalizeForScan(text: string): string {
  return toEnDigits(text).split("ي").join("ی").split("ك").join("ک").split(ZWNJ).join(" ").toLowerCase();
}

const excerpt = (line: string): string => {
  const t = line.trim();
  return t.length > EXCERPT_MAX ? `${t.slice(0, EXCERPT_MAX)}…` : t;
};

// ───────── جاهای خالی ─────────
const RUN_CHARS = ["_", ".", "…", "-", "ـ", "*"];
const PLACEHOLDER_TOKENS = [
  "tbd", "tba", "$x", "[amount]", "[date]", "[name]", "[•]", "[*]", "{{", "xxx", "؟؟", "??", "[ ]", "( )",
  "درج شود", "تکمیل شود", "[مبلغ]", "[تاریخ]", "[نام]", "(مبلغ)", "(تاریخ)",
];

const isBlankLine = (norm: string): boolean =>
  RUN_CHARS.some((ch) => norm.includes(ch.repeat(RUN_LENGTH))) || PLACEHOLDER_TOKENS.some((tok) => norm.includes(tok));

// ───────── پیوست‌ها ─────────
const EXHIBIT_WORDS = ["exhibit", "schedule", "annex", "appendix", "attachment", "پیوست", "ضمیمه", "الحاقیه"];
const NUMBER_WORDS = new Set(["شماره", "no.", "no", "number", "#"]);

const cleanWord = (w: string): string => [...w].filter((ch) => !"()[]{}«»:,،؛;\"'".includes(ch)).join("");

function exhibitLabelsIn(norm: string): string[] {
  const words = norm.split(" ").map(cleanWord).filter(Boolean);
  return words.flatMap((w, i) => {
    if (!EXHIBIT_WORDS.includes(w)) return [];
    const next = words[i + OFFSET_NEXT];
    if (!next) return [];
    const target = NUMBER_WORDS.has(next) ? words[i + OFFSET_AFTER_NEXT] : next;
    return target && target.length <= RUN_LENGTH ? [`${w} ${target}`] : [];
  });
}

const stripBullet = (s: string): string => {
  const t = s.trim();
  const skip = [...t].findIndex((ch) => !BULLET_CHARS.includes(ch));
  return skip < 0 ? "" : t.slice(skip);
};

function findExhibits(lines: string[]): ExhibitRef[] {
  const norm = lines.map(normalizeForScan);
  const refs = norm.flatMap((l, i) => exhibitLabelsIn(l).map((label) => ({ label, line: i + 1 })));
  const unique = [...new Map([...refs].reverse().map((r) => [r.label, r])).values()].sort((a, b) => a.line - b.line);
  return unique.map((r) => {
    const found = norm.some((l) => {
      const head = stripBullet(l);
      const words = head.split(" ").map(cleanWord).filter(Boolean);
      const compact = words.filter((w) => !NUMBER_WORDS.has(w)).join(" ");
      return head.length <= HEADING_MAX_CHARS && compact.startsWith(r.label);
    });
    return { label: r.label, firstLine: r.line, found };
  });
}

// ───────── امضا ─────────
const SIGNATURE_TERMS = ["امضا", "امضاء", "مهر و امضا", "signature", "signed by", "in witness whereof", "by:", "name:", "title:"];

function findSignature(lines: string[]): PreflightResult["signature"] {
  const start = Math.max(0, lines.length - SIGNATURE_TAIL_LINES);
  const tail = lines.slice(start).map((l, i) => ({ raw: l, norm: normalizeForScan(l), line: start + i + 1 }));
  const hit = tail.find((t) => SIGNATURE_TERMS.some((term) => t.norm.includes(term)));
  if (!hit) return { status: "NO_BLOCK", evidence: null };
  const afterHit = tail.filter((t) => t.line >= hit.line);
  const empty = afterHit.some((t) => isBlankLine(t.norm));
  return { status: empty ? "BLOCK_EMPTY" : "BLOCK_PRESENT", evidence: { line: hit.line, excerpt: excerpt(hit.raw) } };
}

// ───────── کامل بودن متن ─────────
const ARTICLE_WORDS = ["ماده", "article", "section"];
const PAGE_WORDS: [string, string][] = [["صفحه", "از"], ["page", "of"]];
const TERMINAL_CHARS = [".", "۔", "!", "?", "؟", ":", ")", "»", "\""];

const toInt = (w: string | undefined): number | null => {
  if (!w) return null;
  const digits = [...w].filter((ch) => ch >= "0" && ch <= "9").join("");
  return digits && digits.length === [...w].filter((ch) => ch !== "." && ch !== ")" && ch !== "-" && ch !== ":").length ? Number(digits) : null;
};

function articleNumbers(norm: string[]): number[] {
  return norm.flatMap((l) => {
    const words = stripBullet(l).split(" ").filter(Boolean);
    const n = ARTICLE_WORDS.includes(words[0] ?? "") ? toInt(words[1]) : null;
    return n === null ? [] : [n];
  });
}

function pageNumbers(norm: string[]): { seen: Set<number>; total: number } {
  const pairs = norm.flatMap((l) => {
    const words = l.split(" ").filter(Boolean);
    return words.flatMap((w, i) => PAGE_WORDS.flatMap(([page, of]) => {
      if (w !== page || words[i + OFFSET_AFTER_NEXT] !== of) return [];
      const n = toInt(words[i + OFFSET_NEXT]);
      const total = toInt(words[i + OFFSET_THIRD]);
      return n !== null && total !== null ? [{ n, total }] : [];
    }));
  });
  return { seen: new Set(pairs.map((p) => p.n)), total: pairs.reduce((m, p) => Math.max(m, p.total), 0) };
}

function findCompleteness(lines: string[], signature: SignatureStatus): string[] {
  const norm = lines.map(normalizeForScan);
  const articles = [...new Set(articleNumbers(norm))].sort((a, b) => a - b);
  const maxArticle = articles[articles.length - 1] ?? 0;
  const missingArticles = Array.from({ length: maxArticle }, (_, i) => i + 1).filter((n) => !articles.includes(n));
  const pages = pageNumbers(norm);
  const missingPages = Array.from({ length: pages.total }, (_, i) => i + 1).filter((n) => !pages.seen.has(n));
  const last = [...lines].reverse().find((l) => l.trim().length > 0)?.trim() ?? "";
  const abrupt = !!last && signature === "NO_BLOCK" && !TERMINAL_CHARS.some((ch) => last.endsWith(ch));
  return [
    ...(articles.length > 1 && missingArticles.length ? [`شماره ماده/بند در توالی متن یافت نشد: ${missingArticles.join("، ")}`] : []),
    ...(pages.total > 0 && missingPages.length ? [`شماره صفحه در متن استخراج‌شده یافت نشد: ${missingPages.join("، ")} از ${pages.total}`] : []),
    ...(abrupt ? [`متن بدون علامت پایان و بدون بخش امضا تمام می‌شود؛ ممکن است ناقص باشد: «${excerpt(last)}»`] : []),
  ];
}

// ───────── پویش سریع نشانه‌های خطر ─────────
interface FlagDef { key: string; label: string; terms: string[] }

/** نشانه‌های جدول «Red Flags Quick Scan» مهارت contract-review و چند نشانه رایج در قراردادهای فارسی */
const FLAGS: FlagDef[] = [
  { key: "liability_cap", label: "سقف مسئولیت — مقدار آن را با معیار ۱۲ ماه وجه قرارداد مقایسه کنید (کمتر از ۶ ماه: پرخطر)", terms: ["limitation of liability", "shall not exceed", "aggregate liability", "cap on liability", "سقف مسئولیت", "حداکثر مسئولیت"] },
  { key: "indemnity", label: "تعهد جبران خسارت — سقف‌دار بودن و دوطرفه بودن آن را بررسی کنید", terms: ["indemnif", "hold harmless", "جبران کلیه خسارات", "کلیه خسارات وارده", "بدون سقف"] },
  { key: "as_is", label: "سلب تضمین («به همان صورت که هست»)", terms: ["as is", "as-is", "without warranty", "بدون هیچ گونه تضمین", "بدون تضمین", "بدون ضمانت"] },
  { key: "suspension", label: "حق تعلیق خدمات/تعهدات — لزوم اخطار قبلی را بررسی کنید", terms: ["suspend", "suspension", "تعلیق"] },
  { key: "amendment", label: "حق تغییر یک‌جانبه شرایط", terms: ["amend these terms", "modify this agreement", "at any time without notice", "تغییر یک جانبه", "تغییر یکجانبه", "حق تغییر شرایط"] },
  { key: "termination", label: "شرایط فسخ — تقارن حق فسخ دو طرف و مهلت رفع نقض را بررسی کنید", terms: ["terminat", "فسخ"] },
  { key: "perpetual", label: "تعهد دائمی یا غیرقابل رجوع", terms: ["perpetual", "in perpetuity", "irrevocable", "دائمی", "غیرقابل فسخ", "غیر قابل فسخ", "غیرقابل رجوع"] },
  { key: "offshore", label: "صلاحیت یا قانون حاکم فراسرزمینی (offshore)", terms: ["british virgin islands", "cayman", " bvi", "seychelles"] },
  { key: "conflict_waiver", label: "اسقاط پیشاپیش تعارض منافع", terms: ["waive any conflict", "conflict waiver"] },
  { key: "sole_discretion", label: "«به تشخیص انحصاری» یک طرف (بدون معیار عینی)", terms: ["sole discretion", "absolute discretion", "به تشخیص خود", "به تشخیص انحصاری", "صرفا به تشخیص", "صرفاً به تشخیص"] },
  { key: "arbitration", label: "داوری اجباری یا اسقاط دعوای جمعی", terms: ["class action", "arbitration", "داوری", "داور مرضی"] },
  { key: "assignment", label: "واگذاری قرارداد — نامتقارن بودن حق انتقال را بررسی کنید", terms: ["may assign", "assignment", "واگذار", "انتقال به غیر"] },
  { key: "waiver_of_options", label: "اسقاط خیارات (از جمله خیار غبن) — اثر آن بر امکان فسخ را دقیق بررسی کنید", terms: ["اسقاط کافه خیارات", "اسقاط کلیه خیارات", "خیار غبن"] },
  { key: "penalty", label: "وجه التزام یا خسارت تأخیر — مبلغ و تناسب آن را بررسی کنید", terms: ["وجه التزام", "خسارت تاخیر", "خسارت تأخیر", "liquidated damages", "penalty"] },
  { key: "security", label: "چک، سفته یا ضمانت‌نامه تضمینی", terms: ["چک تضمین", "سفته", "ضمانت نامه", "promissory note"] },
  { key: "irrevocable_poa", label: "وکالت بلاعزل", terms: ["وکالت بلاعزل", "وکالت نامه بلاعزل", "وکالتنامه بلاعزل"] },
  { key: "jurisdiction", label: "قانون حاکم و مرجع حل اختلاف", terms: ["governing law", "jurisdiction", "مرجع حل اختلاف", "دادگاه صالح", "مرجع صالح"] },
];

function scanFlags(lines: string[]): FlagResult[] {
  const norm = lines.map(normalizeForScan);
  return FLAGS.map((f) => ({
    key: f.key,
    label: f.label,
    hits: norm.flatMap((l, i) => (f.terms.some((t) => l.includes(t)) ? [{ line: i + 1, excerpt: excerpt(lines[i] ?? "") }] : [])).slice(0, MAX_HITS_PER_FLAG),
  })).filter((f) => f.hits.length > 0);
}

// ───────── نوع سند ─────────
const DOC_TYPES: [string, string[]][] = [
  ["قرارداد عدم افشا (NDA)", ["non-disclosure", "nondisclosure", "عدم افشا", "محرمانگی اطلاعات"]],
  ["قرارداد اشتراک نرم‌افزار (SaaS)", ["saas", "subscription", "اشتراک نرم افزار"]],
  ["قرارداد کار", ["employment agreement", "قرارداد کار", "کارفرما و کارگر"]],
  ["اجاره‌نامه", ["lease agreement", "اجاره نامه", "قرارداد اجاره", "موجر", "مستاجر", "مستأجر"]],
  ["مبایعه‌نامه / قرارداد فروش", ["purchase agreement", "sale agreement", "مبایعه نامه", "بایع", "مشتری"]],
  ["قرارداد مشارکت", ["partnership", "joint venture", "مشارکت مدنی", "قرارداد مشارکت"]],
  ["قرارداد پیمانکاری", ["پیمانکار", "contractor agreement"]],
  ["صلح‌نامه", ["صلح نامه", "مصالح", "متصالح"]],
  ["قرارداد خدمات", ["services agreement", "master services", "قرارداد خدمات", "ارائه خدمات"]],
];

export function detectDocumentType(text: string): string | null {
  const norm = normalizeForScan(text);
  return DOC_TYPES.find(([, terms]) => terms.some((t) => norm.includes(t)))?.[0] ?? null;
}

export function contractPreflight(text: string): PreflightResult {
  const lines = text.split("\r\n").join("\n").split("\n");
  const norm = lines.map(normalizeForScan);
  const blanks = norm.flatMap((l, i) => (isBlankLine(l) ? [{ line: i + 1, excerpt: excerpt(lines[i] ?? "") }] : [])).slice(0, MAX_BLANKS);
  const signature = findSignature(lines);
  return {
    documentType: detectDocumentType(text),
    blanks,
    exhibits: findExhibits(lines),
    signature,
    completeness: findCompleteness(lines, signature.status),
    redFlags: scanFlags(lines),
    stats: { lines: lines.length, words: text.split(" ").filter((w) => w.trim()).length, chars: text.length },
  };
}

const SIGNATURE_LABELS: Record<SignatureStatus, string> = {
  BLOCK_EMPTY: "بخش امضا دارای جای خالی است — به احتمال زیاد پیش‌نویس امضانشده",
  BLOCK_PRESENT: "بخش امضا در متن هست؛ امضاشده بودن از روی متن قطعی نیست — نسخه امضاشده را ببینید",
  NO_BLOCK: "بخش امضا در متن یافت نشد",
};

const hitList = (hits: Finding[]): string => hits.map((h) => `  - سطر ${h.line}: «${h.excerpt}»`).join("\n");

/** گزارش فارسی برای نمایش و برای افزودن به ورودی مدل */
export function preflightMarkdown(r: PreflightResult, title: string): string {
  const missing = r.exhibits.filter((e) => !e.found);
  return [
    `### فهرست بررسی پیش از تحلیل — ${title}`,
    `*محاسبه‌شده توسط «دفتر» به‌صورت خودکار و بدون هوش مصنوعی؛ فقط محل‌های نیازمند بررسی را نشان می‌دهد.*`,
    "",
    `- **نوع احتمالی سند:** ${r.documentType ?? "تشخیص داده نشد"}`,
    `- **وضعیت امضا:** ${SIGNATURE_LABELS[r.signature.status]}${r.signature.evidence ? ` (سطر ${r.signature.evidence.line})` : ""}`,
    `- **جاهای خالی/عبارت‌های تکمیل‌نشده:** ${r.blanks.length ? `${r.blanks.length} مورد` : "یافت نشد"}`,
    ...(r.blanks.length ? [hitList(r.blanks)] : []),
    `- **پیوست‌های ارجاع‌شده:** ${r.exhibits.length ? r.exhibits.map((e) => `${e.label}${e.found ? " ✓" : " ⚠️ در متن یافت نشد"}`).join("، ") : "ارجاعی یافت نشد"}`,
    ...(missing.length ? [`  - ⚠️ ${missing.length} پیوست ارجاع‌شده در متن پیدا نشد.`] : []),
    `- **کامل بودن متن:** ${r.completeness.length ? "" : "نشانه‌ای از ناقص بودن دیده نشد"}`,
    ...r.completeness.map((c) => `  - ⚠️ ${c}`),
    "",
    "#### نشانه‌های خطر (پویش سریع)",
    ...(r.redFlags.length ? r.redFlags.map((f) => `- **${f.label}**\n${hitList(f.hits)}`) : ["- نشانه‌ای از فهرست پویش سریع در متن یافت نشد."]),
  ].join("\n");
}
