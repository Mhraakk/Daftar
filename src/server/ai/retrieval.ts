// بازیابی منابع برای «پرسش حقوقی از منابع دفتر»: BM25 روی متن نرمال‌شده فارسی (با تطبیق پیشوندی واژه‌های بلند، تا
// «تجدیدنظرخواهی» با «تجدیدنظر» جور شود)، برتری ماده‌ای که شماره‌اش در پرسش آمده، ادغام رتبه‌ها با Reciprocal Rank Fusion
// و تکه‌کردن متن‌های بلند. همه توابع خالص‌اند (بدون پایگاه داده یا شبکه) تا جداگانه آزمون شوند.
import { normalizeFa } from "@/lib/text";

/** کوتاه‌ترین واژه‌ای که سنجیده می‌شود */
const MIN_TOKEN = 2;
/** کوتاه‌ترین واژه‌ای که تطبیق پیشوندی می‌گیرد؛ واژه‌های کوتاه‌تر پیشوند واژه‌های بی‌ربط زیادی هستند */
const MIN_PREFIX = 4;
/** وزن تطبیق پیشوندی در برابر تطبیق کامل */
const PREFIX_WEIGHT = 0.5;
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const HALF = 0.5;
/** امتیاز افزوده ماده‌ای که شماره آن در پرسش آمده؛ بزرگ‌تر از هر امتیاز معمول BM25 تا آن ماده نخست بیاید */
const ARTICLE_BOOST = 1_000;
/** ثابت RRF؛ مقدار رایج در مقاله اصلی (Cormack و همکاران، ۲۰۰۹) */
export const RRF_K = 60;
export const CHUNK_SIZE = 1_200;
export const CHUNK_OVERLAP = 200;

/** واژه‌های پربسامد (به شکل نرمال‌شده: «آن» ← «ان») که در رتبه‌بندی اثری ندارند */
const STOP_WORDS = new Set([
  "و", "در", "به", "از", "که", "این", "ان", "با", "را", "برای", "یا", "تا", "بر", "هر", "است", "هست", "نیست", "بود", "باشد", "شود", "شد", "شده",
  "می", "نمی", "ها", "های", "یک", "اگر", "هم", "نیز", "باید", "چه", "چی", "چقدر", "چند", "چگونه", "کدام", "ایا", "ای", "او", "ما", "شما", "من",
  "دیگر", "پس", "اما", "ولی", "خود", "همه", "بی", "کرد", "کند", "کنند", "کنم", "دارد", "دارند", "داد", "دهد", "مورد", "طبق", "بین", "روی",
  "زیر", "چون", "نه", "اینکه", "انکه", "وقتی", "کسی", "چیزی", "جه", "لطفا",
]);

/**
 * ریشه‌یابی سبک و یکسان برای پرسش و منبع: «تجدیدنظرخواهی» ← «تجدیدنظر»، «دادگاهها» ← «دادگاه»، «قانونی» ← «قانون».
 * هر پسوند فقط وقتی برداشته می‌شود که باقی‌مانده دست‌کم به اندازه تعیین‌شده باشد («بدوی» و «تنها» دست نمی‌خورند و «واخواهی»
 * به «وا» کوتاه نمی‌شود). ریشه لازم نیست واژه درست فارسی باشد؛ کافی است پرسش و منبع یکسان ریشه‌یابی شوند.
 */
const MIN_REST_SHORT = 3;
const MIN_REST = 4;
const SUFFIXES: readonly (readonly [string, number])[] = [["خواهی", MIN_REST_SHORT], ["های", MIN_REST], ["ها", MIN_REST], ["ی", MIN_REST]];
export const stem = (token: string): string => {
  const rule = SUFFIXES.find(([suffix, rest]) => token.endsWith(suffix) && token.length - suffix.length >= rest);
  return rule ? token.slice(0, token.length - rule[0].length) : token;
};

/** واژه‌های معنادار متن، نرمال‌شده (ی/ک عربی، ارقام، نیم‌فاصله) و ریشه‌یابی‌شده */
export const tokenize = (text: string): string[] => normalizeFa(text).split(" ").filter((t) => t.length >= MIN_TOKEN && !STOP_WORDS.has(t)).map(stem);

// "ماده N" after normalisation (Latin digits): matches "ماده 336" and "ماده 5"; rejects "مواد 336" and "ماده سوم".
// https://regex101.com/?regex=%D9%85%D8%A7%D8%AF%D9%87%20%28%5Cd%2B%29&testString=%D9%85%D9%87%D9%84%D8%AA%20%D9%85%D8%A7%D8%AF%D9%87%20336&flavor=javascript&flags=g
const ARTICLE_REF = /ماده (\d+)/g;

/** شماره موادی که در متن نام برده شده است (مانند «ماده ۳۳۶») */
export const articleRefsIn = (text: string): string[] => [...new Set([...normalizeFa(text).matchAll(ARTICLE_REF)].map((m) => m[1]))];

export interface Passage { key: string; text: string; articleNo?: string | null }
export interface Ranked { key: string; score: number }

interface Prepared { key: string; articleNo: string | null; length: number; tf: Map<string, number> }

/** تطبیق کامل، یا پیشوندی در هر دو سو برای واژه‌های بلند */
const sameStem = (term: string, t: string): boolean => t === term
  || (term.length >= MIN_PREFIX && t.length >= MIN_PREFIX && (t.startsWith(term) || term.startsWith(t)));

const termFrequency = (tokens: string[]): Map<string, number> => tokens.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map<string, number>());

/** وزن یک واژه پرسش در یک متن: تطبیق کامل ۱ و تطبیق پیشوندی (هر دو سو، برای واژه‌های بلند) نیم */
const weightIn = (term: string, tf: Map<string, number>): number => {
  const exact = tf.get(term) ?? 0;
  if (term.length < MIN_PREFIX) return exact;
  const partial = [...tf.entries()].filter(([t]) => t !== term && sameStem(term, t)).reduce((s, [, n]) => s + n, 0);
  return exact + PREFIX_WEIGHT * partial;
};

/** کمترین تعداد واژه پرسش که یک متن باید داشته باشد تا نامزد شود (پرسش تک‌واژه‌ای: همان یک واژه) */
const MIN_MATCHED_TERMS = 2;

/**
 * رتبه‌بندی BM25 (k1=1.2، b=0.75)؛ فقط متن‌هایی که دست‌کم دو واژه پرسش را دارند، به ترتیب امتیاز. ماده‌ای که شماره‌اش در
 * پرسش آمده (مثلاً «ماده ۳۳۶») همیشه نامزد است و امتیاز افزوده می‌گیرد. پرسشی که با هیچ متنی دو واژه مشترک ندارد
 * (مثلاً «هزینه پرواز به کیش») نتیجه‌ای ندارد و مدل فراخوانی نمی‌شود.
 */
export function bm25(query: string, passages: readonly Passage[]): Ranked[] {
  const terms = [...new Set(tokenize(query))];
  const articles = new Set(articleRefsIn(query));
  if (!passages.length || (!terms.length && !articles.size)) return [];
  const docs: Prepared[] = passages.map((p) => {
    const tokens = tokenize(p.text);
    return { key: p.key, articleNo: p.articleNo ?? null, length: tokens.length, tf: termFrequency(tokens) };
  });
  const avgLength = docs.reduce((s, d) => s + d.length, 0) / docs.length || 1;
  const weights = docs.map((d) => terms.map((t) => weightIn(t, d.tf)));
  const idf = terms.map((_, i) => {
    const df = weights.filter((w) => w[i] > 0).length;
    return Math.log(1 + (docs.length - df + HALF) / (df + HALF));
  });
  const minMatched = Math.min(MIN_MATCHED_TERMS, terms.length);
  return docs
    .map((d, j) => {
      const norm = BM25_K1 * (1 - BM25_B + (BM25_B * d.length) / avgLength);
      const text = weights[j].reduce((s, tf, i) => s + (tf > 0 ? (idf[i] * tf * (BM25_K1 + 1)) / (tf + norm) : 0), 0);
      const named = !!d.articleNo && articles.has(d.articleNo);
      const matched = weights[j].filter((tf) => tf > 0).length;
      return { key: d.key, score: named || matched >= minMatched ? text + (named ? ARTICLE_BOOST : 0) : 0 };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** ادغام چند رتبه‌بندی با Reciprocal Rank Fusion: امتیاز هر کلید = Σ ۱/(k + رتبه) */
export function fuseRanks(rankings: readonly (readonly string[])[], k: number = RRF_K): string[] {
  const scores = rankings.reduce((m, list) => list.reduce((acc, key, rank) => acc.set(key, (acc.get(key) ?? 0) + 1 / (k + rank + 1)), m), new Map<string, number>());
  const firstSeen = [...new Set(rankings.flat())];
  return firstSeen.sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0) || firstSeen.indexOf(a) - firstSeen.indexOf(b));
}

/** شباهت کسینوسی؛ بردار صفر شباهت صفر دارد */
export function cosine(a: readonly number[], b: readonly number[]): number {
  const dot = a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
  const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0)) * Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  return norm ? dot / norm : 0;
}

// Whitespace after a sentence end (Latin or Persian punctuation): matches the space in "روز است. مهلت" and "؟ "; rejects "1405/06/20".
// https://regex101.com/?regex=%28%3F%3C%3D%5B.!%3F%D8%9F%D8%9B%5D%29%5Cs%2B&testString=%D8%B1%D9%88%D8%B2%20%D8%A7%D8%B3%D8%AA.%20%D9%85%D9%87%D9%84%D8%AA&flavor=javascript&flags=g
const SENTENCE_END = /(?<=[.!?؟؛])\s+/;

/** برش سخت متن بلندتر از اندازه، روی فاصله اگر ممکن باشد */
const hardSplit = (text: string, size: number): string[] => {
  if (text.length <= size) return [text];
  const cut = text.lastIndexOf(" ", size);
  const at = cut > size * HALF ? cut : size;
  return [text.slice(0, at).trim(), ...hardSplit(text.slice(at).trim(), size)];
};

/** چسباندن تکه‌های کوچک پشت سر هم تا اندازه */
const pack = (units: readonly string[], size: number, joiner: string): string[] => units.reduce<string[]>((acc, u) => {
  const last = acc.at(-1);
  return last !== undefined && last.length + joiner.length + u.length <= size ? [...acc.slice(0, -1), `${last}${joiner}${u}`] : [...acc, u];
}, []);

/** انتهای تکه قبلی (تا مرز واژه) برای هم‌پوشانی */
const tailOf = (text: string, overlap: number): string => {
  const t = text.slice(-overlap);
  const space = t.indexOf(" ");
  return t.length < text.length && space >= 0 ? t.slice(space + 1) : t;
};

/**
 * تکه‌کردن متن بلند (حدود ۱٬۲۰۰ نویسه) روی مرز بند و جمله، با هم‌پوشانی حدود ۲۰۰ نویسه تا جمله‌ای که روی مرز افتاده
 * در هر دو تکه دیده شود.
 */
export function chunkText(text: string, size: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
  const paragraphs = text.split("\n").map((p) => p.trim()).filter(Boolean);
  const units = paragraphs.flatMap((p) => (p.length <= size ? [p] : pack(p.split(SENTENCE_END).flatMap((s) => hardSplit(s, size)), size, " ")));
  const chunks = pack(units, size, "\n");
  return chunks.map((c, i) => (i === 0 || overlap <= 0 ? c : `${tailOf(chunks[i - 1], overlap)}\n${c}`));
}
