// نسبت کنتراست WCAG 2.x بین دو رنگ hex و فهرست جفت‌های متن/زمینه‌ای که هر پوسته باید رعایت کند.
// متن عادی ۴٫۵:۱ و مرز کنترل‌ها و حلقه تمرکز ۳:۱ (WCAG 1.4.3 و 1.4.11).
import type { ColorToken, SkinTokens } from "./skins";

const HEX_PAIR = 2;
const HEX_RADIX = 16;
const MAX = 255;
const LINEAR_KNEE = 0.04045;
const LINEAR_DIV = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_DIV = 1.055;
const GAMMA = 2.4;
const R_WEIGHT = 0.2126;
const G_WEIGHT = 0.7152;
const B_WEIGHT = 0.0722;
const FLARE = 0.05;
const RED_AT = 0;
const GREEN_AT = 2;
const BLUE_AT = 4;
const CHANNELS = [RED_AT, GREEN_AT, BLUE_AT];

export const TEXT_MIN = 4.5;
export const UI_MIN = 3;

function channel(v: number): number {
  const s = v / MAX;
  return s <= LINEAR_KNEE ? s / LINEAR_DIV : ((s + GAMMA_OFFSET) / GAMMA_DIV) ** GAMMA;
}

export function luminance(hex: string): number {
  const [r, g, b] = CHANNELS.map((i) => channel(parseInt(hex.slice(i, i + HEX_PAIR), HEX_RADIX)));
  return R_WEIGHT * r + G_WEIGHT * g + B_WEIGHT * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + FLARE) / (lo + FLARE);
}

export interface Pair { fg: ColorToken; bg: ColorToken; min: number; use: string }

export const PAIRS: Pair[] = [
  ...(["paper", "surface", "surface-2"] as const).flatMap((bg) => (["ink", "ink-2", "ink-3"] as const).map((fg) => ({ fg, bg, min: TEXT_MIN, use: "متن" }))),
  ...(["lapis", "firuze", "mohr", "zafaran", "sabz"] as const).map((fg) => ({ fg, bg: "surface" as const, min: TEXT_MIN, use: "متن رنگی روی پنل" })),
  { fg: "lapis", bg: "paper", min: TEXT_MIN, use: "پیوند روی بوم" },
  { fg: "lapis", bg: "lapis-50", min: TEXT_MIN, use: "مُهر اطلاعات" },
  { fg: "firuze", bg: "firuze-50", min: TEXT_MIN, use: "مُهر تأکید" },
  { fg: "mohr", bg: "mohr-50", min: TEXT_MIN, use: "مُهر خطر" },
  { fg: "zafaran", bg: "zafaran-50", min: TEXT_MIN, use: "مُهر هشدار" },
  { fg: "sabz", bg: "sabz-50", min: TEXT_MIN, use: "مُهر موفقیت" },
  { fg: "ink", bg: "lapis-50", min: TEXT_MIN, use: "متن روی زمینه انتخاب" },
  { fg: "on-lapis", bg: "lapis", min: TEXT_MIN, use: "دکمه اصلی" },
  { fg: "on-firuze", bg: "firuze", min: TEXT_MIN, use: "دکمه تأکید" },
  { fg: "on-mohr", bg: "mohr", min: TEXT_MIN, use: "دکمه و نشان خطر" },
  { fg: "on-night", bg: "night", min: TEXT_MIN, use: "پرکننده پررنگ" },
  { fg: "chrome-ink", bg: "chrome", min: TEXT_MIN, use: "متن ناوبری" },
  { fg: "chrome-ink-2", bg: "chrome", min: TEXT_MIN, use: "متن کم‌رنگ ناوبری" },
  { fg: "chrome-active-ink", bg: "chrome-active", min: TEXT_MIN, use: "بخش فعال ناوبری" },
  { fg: "line-strong", bg: "surface", min: UI_MIN, use: "مرز کنترل‌ها" },
  { fg: "firuze", bg: "surface", min: UI_MIN, use: "حلقه تمرکز" },
  { fg: "chart-axis", bg: "surface", min: TEXT_MIN, use: "برچسب محور نمودار" },
  ...(["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6", "chart-actual", "chart-prev", "chart-pos", "chart-neg"] as const).map((fg) => ({ fg, bg: "surface" as const, min: UI_MIN, use: "نشانه نمودار" })),
];

export interface Failure { pair: Pair; ratio: number }

export function contrastFailures(skin: SkinTokens): Failure[] {
  return PAIRS.map((pair) => ({ pair, ratio: contrast(skin.colors[pair.fg], skin.colors[pair.bg]) })).filter((f) => f.ratio < f.pair.min);
}
