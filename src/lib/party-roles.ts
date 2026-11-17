// سمت اصحاب پرونده: A سوی خواهان، B سوی خوانده، T ثالث؛ نقش‌های دیگر (شاهد، وکیل، کارشناس) سمت ندارند
export type Side = "A" | "B" | "T";

export const ROLE_SIDE: Record<string, Side> = {
  "خواهان": "A", "شاکی": "A", "تجدیدنظرخواه": "A",
  "خوانده": "B", "متهم / مشتکی‌عنه": "B", "تجدیدنظرخوانده": "B",
  "ثالث": "T",
};

export const sideOf = (role: string): Side | null => ROLE_SIDE[role.trim()] ?? null;

/** سمت مقابل؛ ثالث مقابل هیچ‌کدام شمرده نمی‌شود */
export const opposite = (s: Side | null): Side | null => (s === "A" || s === "B" ? ({ A: "B", B: "A" } as const)[s] : null);
