// چهار پوسته و چهار چیدمان «دفتر» (ترکیب آزاد ۴×۴). هر پوسته مجموعه کامل توکن‌های رنگ، شیشه، شعاع، سایه و
// رنگ‌های نمودار است؛ نام‌های قدیمی (paper، lapis، firuze، mohr، …) نقش معنایی دارند تا صفحه‌ها بدون بازنویسی کار کنند:
// paper = بوم صفحه، lapis = رنگ اصلی کنش، firuze = تأکید و تمرکز، mohr = خطر، zafaran = هشدار، sabz = موفقیت،
// night = پرکننده خنثی پررنگ، chrome = نوار ناوبری. همه جفت‌های متن/زمینه در tests/unit/theme.test.ts با WCAG سنجیده می‌شوند.

export const SKIN_IDS = ["glass", "graphite", "paper", "firuze"] as const;
export const LAYOUT_IDS = ["sidebar", "dock", "columns", "command"] as const;
export type SkinId = (typeof SKIN_IDS)[number];
export type LayoutId = (typeof LAYOUT_IDS)[number];

export const DEFAULT_SKIN: SkinId = "glass";
export const DEFAULT_LAYOUT: LayoutId = "sidebar";

export const SKINS_META: Record<SkinId, { label: string; hint: string; scheme: "light" | "dark" }> = {
  glass: { label: "آینه", hint: "شیشه مات روی شفق رنگی؛ روشن و شفاف", scheme: "light" },
  graphite: { label: "شب", hint: "گرافیت تیره با کهربایی؛ آرام برای کار طولانی", scheme: "dark" },
  paper: { label: "کاغذ", hint: "کاغذ کرم و مرکب؛ خط‌کشی روزنامه‌ای", scheme: "light" },
  firuze: { label: "فیروزه", hint: "لاجورد شب با فیروزه و گره‌چینی", scheme: "dark" },
};

export const LAYOUTS_META: Record<LayoutId, { label: string; hint: string }> = {
  sidebar: { label: "کلاسیک", hint: "نوار کناری شناور و عنوان‌های بزرگ" },
  dock: { label: "داک", hint: "داک شناور پایین صفحه با بزرگ‌نمایی" },
  columns: { label: "ستون‌ها", hint: "ریل گروه‌ها و ستون بخش‌ها و پرونده‌های اخیر" },
  command: { label: "فرمان", hint: "نوار فرمان مرکزی و زبانه‌های بخش" },
};

export const COLOR_TOKENS = [
  "paper", "surface", "surface-2", "line", "line-strong", "ink", "ink-2", "ink-3",
  "lapis", "lapis-600", "lapis-50", "on-lapis", "firuze", "firuze-50", "on-firuze",
  "mohr", "mohr-50", "on-mohr", "zafaran", "zafaran-50", "sabz", "sabz-50", "night", "night-2", "on-night",
  "chrome", "chrome-2", "chrome-ink", "chrome-ink-2", "chrome-line", "chrome-active", "chrome-active-ink",
  "shadow", "glow-1", "glow-2", "glow-3",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6", "chart-actual", "chart-pos", "chart-neg", "chart-grid", "chart-axis", "chart-prev",
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

export interface SkinTokens {
  /** رنگ‌ها به صورت hex شش‌رقمی (بدون #) */
  colors: Record<ColorToken, string>;
  radiusCard: string;
  radiusCtl: string;
  /** شفافیت پنل‌ها و نوار ناوبری (۱ = مات) و شدت مات‌کردن پس‌زمینه */
  panelAlpha: string;
  chromeAlpha: string;
  blur: string;
  shadowAlpha: string;
  /** پس‌زمینه تزئینی بوم (شفق، گره‌چینی یا هیچ) */
  canvas: string;
}

const GIRIH = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Cg fill='none' stroke='%232dd4bf' stroke-opacity='.07' stroke-width='1'%3E%3Cpath d='M36 0 L72 36 L36 72 L0 36 Z'/%3E%3Cpath d='M36 16 L56 36 L36 56 L16 36 Z'/%3E%3Cpath d='M0 0 L16 16 M72 0 L56 16 M0 72 L16 56 M72 72 L56 56'/%3E%3C/g%3E%3C/svg%3E\")";

export const SKINS: Record<SkinId, SkinTokens> = {
  glass: {
    colors: {
      paper: "EEF2FA", surface: "FFFFFF", "surface-2": "F3F5FA", line: "E2E7F0", "line-strong": "858FA3", ink: "111827", "ink-2": "374151", "ink-3": "5B6678",
      lapis: "2563EB", "lapis-600": "1D4ED8", "lapis-50": "E8F0FF", "on-lapis": "FFFFFF", firuze: "0E7490", "firuze-50": "E0F6FA", "on-firuze": "FFFFFF",
      mohr: "C81E1E", "mohr-50": "FDECEC", "on-mohr": "FFFFFF", zafaran: "935A06", "zafaran-50": "FEF5DC", sabz: "15703A", "sabz-50": "E3F6EA",
      night: "111827", "night-2": "1F2937", "on-night": "FFFFFF",
      chrome: "FFFFFF", "chrome-2": "F3F5FA", "chrome-ink": "111827", "chrome-ink-2": "4B5565", "chrome-line": "E2E7F0", "chrome-active": "E8F0FF", "chrome-active-ink": "1D4ED8",
      shadow: "1E293B", "glow-1": "818CF8", "glow-2": "38BDF8", "glow-3": "F472B6",
      "chart-1": "2563EB", "chart-2": "E05A24", "chart-3": "13916A", "chart-4": "C47F00", "chart-5": "D0508A", "chart-6": "0F7A0F", "chart-actual": "1E293B",
      "chart-pos": "15803D", "chart-neg": "DC2626", "chart-grid": "E5E9F2", "chart-axis": "5B6678", "chart-prev": "7D879A",
    },
    radiusCard: "20px", radiusCtl: "12px", panelAlpha: "0.74", chromeAlpha: "0.62", blur: "24px", shadowAlpha: "0.10",
    canvas: "radial-gradient(55% 45% at 88% 0%, rgb(var(--glow-1) / .34), transparent 70%), radial-gradient(45% 40% at 8% 14%, rgb(var(--glow-2) / .28), transparent 70%), radial-gradient(60% 45% at 45% 100%, rgb(var(--glow-3) / .18), transparent 72%)",
  },
  graphite: {
    colors: {
      paper: "0B0B0D", surface: "17171B", "surface-2": "202026", line: "2C2C33", "line-strong": "6B6B78", ink: "F4F4F5", "ink-2": "C4C4CC", "ink-3": "9A9AA6",
      lapis: "F97316", "lapis-600": "EA580C", "lapis-50": "3A2416", "on-lapis": "140B05", firuze: "60A5FA", "firuze-50": "16253D", "on-firuze": "0A1120",
      mohr: "F87171", "mohr-50": "3D1A1C", "on-mohr": "1A0505", zafaran: "FBBF24", "zafaran-50": "3A2D0C", sabz: "4ADE80", "sabz-50": "12301F",
      night: "ECECF0", "night-2": "D4D4DA", "on-night": "111114",
      chrome: "1C1C21", "chrome-2": "26262C", "chrome-ink": "F4F4F5", "chrome-ink-2": "A6A6B2", "chrome-line": "34343C", "chrome-active": "F97316", "chrome-active-ink": "140B05",
      shadow: "000000", "glow-1": "F97316", "glow-2": "3B82F6", "glow-3": "A855F7",
      "chart-1": "D95926", "chart-2": "199E70", "chart-3": "C98500", "chart-4": "D55181", "chart-5": "0CA30C", "chart-6": "9085E9", "chart-actual": "E4E4E7",
      "chart-pos": "4ADE80", "chart-neg": "F87171", "chart-grid": "2A2A31", "chart-axis": "9A9AA6", "chart-prev": "7A7A87",
    },
    radiusCard: "18px", radiusCtl: "12px", panelAlpha: "1", chromeAlpha: "0.80", blur: "20px", shadowAlpha: "0.45",
    canvas: "radial-gradient(40% 32% at 100% 0%, rgb(var(--glow-1) / .10), transparent 70%), radial-gradient(35% 30% at 0% 100%, rgb(var(--glow-2) / .06), transparent 70%)",
  },
  paper: {
    colors: {
      paper: "F3EEE3", surface: "FAF7F0", "surface-2": "ECE6D9", line: "D9D0BE", "line-strong": "7A7163", ink: "171513", "ink-2": "433D37", "ink-3": "625A50",
      lapis: "171513", "lapis-600": "000000", "lapis-50": "E6E0D3", "on-lapis": "FAF7F0", firuze: "1E3A6B", "firuze-50": "E2E7F0", "on-firuze": "FAF7F0",
      mohr: "A3201B", "mohr-50": "F6E3DF", "on-mohr": "FAF7F0", zafaran: "8A5A06", "zafaran-50": "F5EACF", sabz: "2E6A3F", "sabz-50": "E1EEDF",
      night: "171513", "night-2": "2B2723", "on-night": "FAF7F0",
      chrome: "F3EEE3", "chrome-2": "ECE6D9", "chrome-ink": "171513", "chrome-ink-2": "4F483F", "chrome-line": "171513", "chrome-active": "171513", "chrome-active-ink": "FAF7F0",
      shadow: "171513", "glow-1": "A3201B", "glow-2": "1E3A6B", "glow-3": "8A5A06",
      "chart-1": "2F5FA8", "chart-2": "B4302A", "chart-3": "13866A", "chart-4": "B87700", "chart-5": "9B4A8C", "chart-6": "2F7D32", "chart-actual": "171513",
      "chart-pos": "2E6A3F", "chart-neg": "A3201B", "chart-grid": "DDD4C3", "chart-axis": "625A50", "chart-prev": "8F8677",
    },
    radiusCard: "3px", radiusCtl: "2px", panelAlpha: "1", chromeAlpha: "1", blur: "0px", shadowAlpha: "0",
    canvas: "none",
  },
  firuze: {
    colors: {
      paper: "06141F", surface: "0B1F2E", "surface-2": "10293B", line: "1C3A4E", "line-strong": "4F7A92", ink: "E6F1F5", "ink-2": "AFCBD6", "ink-3": "86A8B6",
      lapis: "2DD4BF", "lapis-600": "14B8A6", "lapis-50": "0F3A40", "on-lapis": "03201F", firuze: "7DA7F2", "firuze-50": "15284A", "on-firuze": "071226",
      mohr: "FB7185", "mohr-50": "3F1624", "on-mohr": "2A0610", zafaran: "FACC15", "zafaran-50": "3B300A", sabz: "34D399", "sabz-50": "0B3527",
      night: "D6EEF2", "night-2": "B8DDE4", "on-night": "06141F",
      chrome: "081A27", "chrome-2": "0E2536", "chrome-ink": "E6F1F5", "chrome-ink-2": "94B4C1", "chrome-line": "1C3A4E", "chrome-active": "2DD4BF", "chrome-active-ink": "03201F",
      shadow: "000000", "glow-1": "2DD4BF", "glow-2": "38BDF8", "glow-3": "6366F1",
      "chart-1": "14A898", "chart-2": "D95926", "chart-3": "3987E5", "chart-4": "C98500", "chart-5": "D55181", "chart-6": "9085E9", "chart-actual": "D6EEF2",
      "chart-pos": "34D399", "chart-neg": "FB7185", "chart-grid": "173447", "chart-axis": "86A8B6", "chart-prev": "5D879B",
    },
    radiusCard: "16px", radiusCtl: "10px", panelAlpha: "0.92", chromeAlpha: "0.84", blur: "16px", shadowAlpha: "0.35",
    canvas: `radial-gradient(50% 38% at 50% 0%, rgb(var(--glow-1) / .16), transparent 72%), ${GIRIH}`,
  },
};

const HEX_PAIR = 2;
const HEX_RADIX = 16;
const RED = 0;
const GREEN = 2;
const BLUE = 4;

/** «2563EB» → «37 99 235» (قالب rgb(var(--x) / a) در Tailwind) */
export function rgbTriplet(hex: string): string {
  return [RED, GREEN, BLUE].map((i) => parseInt(hex.slice(i, i + HEX_PAIR), HEX_RADIX)).join(" ");
}

function declarations(s: SkinTokens, id: SkinId): string {
  const colors = COLOR_TOKENS.map((t) => `--${t}:${rgbTriplet(s.colors[t])};`).join("");
  return `${colors}--radius-card:${s.radiusCard};--radius-ctl:${s.radiusCtl};--panel-alpha:${s.panelAlpha};--chrome-alpha:${s.chromeAlpha};--blur:${s.blur};--shadow-alpha:${s.shadowAlpha};--canvas:${s.canvas};color-scheme:${SKINS_META[id].scheme};`;
}

const CHART_TOKENS = COLOR_TOKENS.filter((t) => t.startsWith("chart-"));
/** پوسته‌ای که رنگ‌های نمودارش روی کاغذ سفید سنجیده شده و برای چاپ و PDF به کار می‌رود */
export const PRINT_SKIN: SkinId = "glass";

/** متغیرهای رنگ نمودار برای چاپ و PDF (همیشه روشن، سنجیده روی سفید) */
export function printChartVars(): string {
  return CHART_TOKENS.map((t) => `--${t}:${rgbTriplet(SKINS[PRINT_SKIN].colors[t])};`).join("");
}

/** CSS همه پوسته‌ها برای درج در <head>؛ جابه‌جایی پوسته در مرورگر فقط با تغییر data-skin انجام می‌شود */
export function skinCss(): string {
  const skins = SKIN_IDS.map((id) => `${id === DEFAULT_SKIN ? ":root," : ""}[data-skin="${id}"]{${declarations(SKINS[id], id)}}`);
  return [...skins, `@media print{html[data-skin]{${printChartVars()}}}`].join("\n");
}

export const isSkin = (v: unknown): v is SkinId => typeof v === "string" && (SKIN_IDS as readonly string[]).includes(v);
export const isLayout = (v: unknown): v is LayoutId => typeof v === "string" && (LAYOUT_IDS as readonly string[]).includes(v);
