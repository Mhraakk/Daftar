// مرتب‌سازی جدول‌ها از روی نشانی صفحه (?sort=…&dir=…): فقط کلیدهای مجاز پذیرفته می‌شوند و پیوند هر سرستون
// جهت را برعکس می‌کند؛ بقیه پارامترهای صفحه (جست‌وجو، پالایه) حفظ و شماره صفحه به ۱ برمی‌گردد.

export type SortDir = "asc" | "desc";
export interface SortState { key: string; dir: SortDir }

const isDir = (v: unknown): v is SortDir => v === "asc" || v === "desc";
const FLIP: Record<SortDir, SortDir> = { asc: "desc", desc: "asc" };

export function sortFrom(sp: { sort?: string; dir?: string }, keys: readonly string[], fallback: SortState): SortState {
  if (!sp.sort || !keys.includes(sp.sort)) return fallback;
  return { key: sp.sort, dir: isDir(sp.dir) ? sp.dir : "asc" };
}

/** نشانی مرتب‌سازی بر حسب key: بار نخست صعودی (عددها و تاریخ‌ها نزولی)، سپس برعکس */
export function sortHref(path: string, params: Record<string, string | undefined>, key: string, current: SortState, firstDir: SortDir = "asc"): string {
  const dir: SortDir = current.key === key ? FLIP[current.dir] : firstDir;
  const next = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1] && e[0] !== "page"));
  next.set("sort", key);
  next.set("dir", dir);
  return `${path}?${next.toString()}`;
}

export const ariaSort = (key: string, current: SortState): "ascending" | "descending" | "none" => {
  if (current.key !== key) return "none";
  return current.dir === "asc" ? "ascending" : "descending";
};
