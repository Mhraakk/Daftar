// بیرون کشیدن شیءهای JSON کامل از پاسخ مدل. پاسخ ممکن است درون متن یا قطعه کد بیاید، یا به سبب سقف توکن خروجی
// وسط آرایه بریده شده باشد (در آزمون زنده با مدل محلی رخ داد)؛ هر شیء کامل جداگانه تجزیه و شیء ناقص پایانی کنار
// گذاشته می‌شود تا یک بریدگی، همه موارد درست پیش از آن را از بین نبرد.

interface Scan { depth: number; inStr: boolean; esc: boolean; start: number; spans: readonly (readonly [number, number])[] }
const INITIAL: Scan = { depth: 0, inStr: false, esc: false, start: -1, spans: [] };

/** نویسه درون رشته JSON: فقط گریز (\) و پایان رشته اهمیت دارد */
const inString = (s: Scan, ch: string): Scan => {
  if (s.esc) return { ...s, esc: false };
  if (ch === "\\") return { ...s, esc: true };
  return ch === '"' ? { ...s, inStr: false } : s;
};

/** نویسه بیرون از رشته: رشته فقط درون شیء دنبال می‌شود تا گیومه‌های متن آزاد مدل حالت را به هم نزند */
const outside = (s: Scan, ch: string, i: number): Scan => {
  if (ch === '"' && s.depth > 0) return { ...s, inStr: true };
  if (ch === "{") return { ...s, depth: s.depth + 1, start: s.depth === 0 ? i : s.start };
  if (ch !== "}" || s.depth === 0) return s;
  const depth = s.depth - 1;
  return depth === 0 ? { ...s, depth, spans: [...s.spans, [s.start, i + 1] as const] } : { ...s, depth };
};

/** شیءهای سطح بالای کامل در متن، به ترتیب؛ آرایه‌ها و مقدارهای ساده نادیده گرفته می‌شوند */
export function jsonObjectsIn(text: string): Record<string, unknown>[] {
  const { spans } = text.split("").reduce<Scan>((s, ch, i) => (s.inStr ? inString(s, ch) : outside(s, ch, i)), INITIAL);
  return spans.flatMap(([from, to]) => {
    try {
      const value = JSON.parse(text.slice(from, to)) as unknown;
      return value && typeof value === "object" && !Array.isArray(value) ? [value as Record<string, unknown>] : [];
    } catch {
      return [];
    }
  });
}
