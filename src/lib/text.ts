// ابزارهای متن فارسی: نرمال‌سازی برای جست‌وجو و تبدیل ارقام

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toEnDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

export function toFaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

const FA_NUMBER = new Intl.NumberFormat("fa-IR");

/** عدد با ارقام فارسی و جداکننده هزارگان «٬» (U+066C) و ممیز «٫» (U+066B)، مانند ۱٬۲۳۴٬۵۶۷٫۵ */
export function faNum(n: number | bigint): string {
  return FA_NUMBER.format(n);
}

/**
 * نرمال‌سازی متن فارسی برای نمایه‌سازی و جست‌وجو:
 * یکسان‌سازی ی/ک عربی، حذف اعراب و کشیده، تبدیل نیم‌فاصله به فاصله،
 * یکسان‌سازی همزه‌ها و ارقام، حروف کوچک لاتین.
 */
export function normalizeFa(input: string | null | undefined): string {
  if (!input) return "";
  let s = input.normalize("NFKC");
  s = s
    .replace(/[ً-ٰٟۖ-ۭ]/g, "") // اعراب
    .replace(/ـ/g, "") // کشیده
    .replace(/[يى]/g, "ی")
    .replace(/ئ/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[أإٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/آ/g, "ا")
    .replace(/[‌‍‎‏­]/g, " "); // نیم‌فاصله و نشانه‌های جهت
  s = toEnDigits(s).toLowerCase();
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return s;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** اعتبارسنجی کد ملی ایران (الگوریتم رقم کنترل) */
export function isValidNationalId(raw: string): boolean {
  const code = toEnDigits(raw).trim();
  if (!/^\d{10}$/.test(code)) return false;
  if (/^(\d)\1{9}$/.test(code)) return false;
  const check = Number(code[9]);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(code[i]) * (10 - i);
  const r = sum % 11;
  return r < 2 ? check === r : check === 11 - r;
}

/** شناسه ملی اشخاص حقوقی (۱۱ رقم) */
export function isValidLegalId(raw: string): boolean {
  const code = toEnDigits(raw).trim();
  if (!/^\d{11}$/.test(code)) return false;
  const d = code.split("").map(Number);
  const c = [29, 27, 23, 19, 17, 29, 27, 23, 19, 17];
  const tens = d[9] + 2;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (d[i] + tens) * c[i];
  let r = sum % 11;
  if (r === 10) r = 0;
  return r === d[10];
}

export function isValidMobile(raw: string): boolean {
  return /^09\d{9}$/.test(toEnDigits(raw).trim());
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${toFaDigits(n)} بایت`;
  if (n < 1024 * 1024) return `${toFaDigits((n / 1024).toFixed(1))} کیلوبایت`;
  return `${toFaDigits((n / 1024 / 1024).toFixed(1))} مگابایت`;
}
