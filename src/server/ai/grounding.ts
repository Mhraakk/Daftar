// سنجش اینکه عدد، تاریخ و مدت یک متن تولیدی در متن منبع آمده است یا نه (نگهبان «مبلغ، مهلت و تاریخ را حدس نزن»).
// در پیشنهاد شرح خواسته و پاسخ پرسش حقوقی به کار می‌رود. مدت‌ها («بیست روز»، «۲۰ روز»، «دو ماه») به شکل یکسان «20 روز»
// مقایسه می‌شوند تا پاسخی که مدت قانون را با رقم بنویسد رد نشود و مدتی که در منبع نیست پذیرفته نشود.
import { normalizeFa, toEnDigits } from "@/lib/text";
import { extractJalaliDates } from "../deadline-calc";

/** کوتاه‌ترین عددی که سنجیده می‌شود؛ عددهای کوتاه (مانند «۱۰ روز») جداگانه به‌صورت «مدت» سنجیده می‌شوند */
const MIN_DIGITS = 3;
// A number with optional thousands separators, after digit normalisation: matches "5,500,000,000" and "1405"; rejects "ریال".
// https://regex101.com/?regex=%5Cd%28%3F%3A%5B%5Cd%2C%D9%AC%5D*%5Cd%29%3F&testString=5%2C500%2C000%2C000%20%D8%B1%DB%8C%D8%A7%D9%84&flavor=javascript&flags=g
const NUMBER = /\d(?:[\d,٬]*\d)?/g;
// Thousands separators inside a number: matches "," and "٬"; rejects "5".
// https://regex101.com/?regex=%5B%2C%D9%AC%5D&testString=5%D9%AC500&flavor=javascript&flags=g
const SEPARATORS = /[,٬]/g;
// A whole token made of Latin digits: matches "20"; rejects "20روز" and "بیست".
// https://regex101.com/?regex=%5E%5Cd%2B%24&testString=20&flavor=javascript
const DIGITS = /^\d+$/;

/** عددهای سه‌رقمی و بلندتر، بی جداکننده هزارگان و با ارقام لاتین */
export const numbersIn = (text: string): string[] =>
  [...toEnDigits(text).matchAll(NUMBER)].map((m) => m[0].replace(SEPARATORS, "")).filter((n) => n.length >= MIN_DIGITS);

/** تاریخ‌های شمسی صریح به شکل «1405/6/20» */
export const datesIn = (text: string): string[] => extractJalaliDates(text).map((d) => `${d.jy}/${d.jm}/${d.jd}`);

// ───────── مدت‌ها ─────────

const TEN = 10;
const HUNDRED = 100;
/** «بیست» دومین دهگان است */
const TENS_START = 2;
const UNIT_WORDS = ["یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
const TEEN_WORDS = ["ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده"];
const TENS_WORDS = ["بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
const HUNDRED_WORDS = ["صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"];

/** عددهای نوشته‌شده با حروف (به شکل نرمال‌شده) */
const NUMBER_WORDS = new Map<string, number>([
  ...UNIT_WORDS.map((w, i): [string, number] => [w, i + 1]),
  ...TEEN_WORDS.map((w, i): [string, number] => [w, TEN + i]),
  ...TENS_WORDS.map((w, i): [string, number] => [w, (i + TENS_START) * TEN]),
  ...HUNDRED_WORDS.map((w, i): [string, number] => [w, (i + 1) * HUNDRED]),
  ["یکصد", HUNDRED],
  ["هیجده", TEN + TEEN_WORDS.indexOf("هجده")],
]);

/** واحدهای مدت (نرمال‌شده) و صورت پایه آن‌ها؛ «ده روزه» همان «ده روز» است */
const PERIOD_UNITS = new Map<string, string>([
  ["روز", "روز"], ["روزه", "روز"], ["هفته", "هفته"], ["ماه", "ماه"], ["ماهه", "ماه"], ["سال", "سال"], ["ساله", "سال"], ["ساعت", "ساعت"],
]);

/** فاصله واژه عددی پیشین در «بیست و یک»: یک «و» میان دو واژه */
const AND_STEP = 2;

/**
 * واژه‌های عددی پیش از جایگاه i؛ عدد مرکب فارسی همیشه با «و» ساخته می‌شود («بیست و یک»)، پس دو واژه عددی پشت سر هم
 * بی «و» دو عدد جدا هستند («هر دو بیست روز» یعنی بیست روز، نه بیست‌ودو).
 */
const numberWordsBefore = (tokens: readonly string[], i: number, acc: readonly string[]): string[] => {
  const t = tokens[i];
  if (t === undefined || !NUMBER_WORDS.has(t)) return [...acc];
  const words = [t, ...acc];
  const prev = tokens[i - AND_STEP];
  return tokens[i - 1] === "و" && prev !== undefined && NUMBER_WORDS.has(prev) ? numberWordsBefore(tokens, i - AND_STEP, words) : words;
};

const periodAt = (tokens: readonly string[], i: number): string | null => {
  const unit = PERIOD_UNITS.get(tokens[i]);
  if (!unit) return null;
  const prev = tokens[i - 1];
  if (prev !== undefined && DIGITS.test(prev)) return `${Number(prev)} ${unit}`;
  const words = numberWordsBefore(tokens, i - 1, []);
  return words.length ? `${words.reduce((s, w) => s + (NUMBER_WORDS.get(w) ?? 0), 0)} ${unit}` : null;
};

/** مدت‌های متن به شکل یکسان «20 روز»، «2 ماه» (با رقم یا با حروف) */
export function periodsIn(text: string): string[] {
  const tokens = normalizeFa(text).split(" ");
  return [...new Set(tokens.map((_, i) => periodAt(tokens, i)).filter((p): p is string => p !== null))];
}

/** عددها، تاریخ‌ها و مدت‌هایی از متن تولیدی که در متن منبع نیامده‌اند */
export function unsupportedFigures(generated: string, source: string): string[] {
  const numbers = new Set(numbersIn(source));
  const dates = new Set(datesIn(source));
  const periods = new Set(periodsIn(source));
  const missingDates = datesIn(generated).filter((d) => !dates.has(d));
  // اجزای تاریخِ پشتیبانی‌شده (مثلاً «1405») عدد جداگانه شمرده نمی‌شوند
  const dateParts = new Set(datesIn(generated).flatMap((d) => d.split("/")));
  const missingNumbers = numbersIn(generated).filter((n) => !numbers.has(n) && !dateParts.has(n));
  const missingPeriods = periodsIn(generated).filter((p) => !periods.has(p));
  return [...new Set([...missingDates, ...missingNumbers, ...missingPeriods])];
}
