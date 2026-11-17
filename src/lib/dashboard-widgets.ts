// فهرست ویجت‌های پیشخوان و چیدمان هر کاربر (ترتیب و پنهان‌ها). خالص است تا در مرورگر و آزمون واحد هم به کار رود.
export const WIDGET_IDS = [
  "summary", "my-deadlines", "deadline-rings", "deadlines-14", "events", "my-tasks", "my-cases", "cartable", "recent-docs",
  "office-summary", "workload", "case-status", "office-deadlines-14", "activity",
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];
/** پهنا در شبکه سه‌ستونه: تمام‌عرض، دوستونه، یک‌ستونه */
export type WidgetSize = "full" | "wide" | "narrow";

export const WIDGET_META: Record<WidgetId, { title: string; size: WidgetSize; manager?: boolean }> = {
  "summary": { title: "خلاصه کار من", size: "full" },
  "my-deadlines": { title: "مهلت‌های نزدیک و معوق", size: "wide" },
  "deadline-rings": { title: "شمارش معکوس مهلت‌ها", size: "narrow" },
  "deadlines-14": { title: "مهلت‌های من در ۱۴ روز آینده", size: "wide" },
  "events": { title: "قرارها و جلسات پیش رو", size: "narrow" },
  "my-tasks": { title: "وظایف من", size: "wide" },
  "my-cases": { title: "پرونده‌های من", size: "narrow" },
  "cartable": { title: "ورودی کارتابل", size: "wide" },
  "recent-docs": { title: "اسناد اخیر", size: "narrow" },
  "office-summary": { title: "نمای مدیریتی دفتر", size: "full", manager: true },
  "workload": { title: "بار کاری کارمندان", size: "wide", manager: true },
  "case-status": { title: "وضعیت پرونده‌ها", size: "narrow", manager: true },
  "office-deadlines-14": { title: "مهلت‌های دفتر در ۱۴ روز آینده", size: "full", manager: true },
  "activity": { title: "فعالیت‌های اخیر من", size: "full" },
};

export interface DashboardLayout { order: WidgetId[]; hidden: WidgetId[] }

const isWidget = (v: string): v is WidgetId => (WIDGET_IDS as readonly string[]).includes(v);

/** ترتیب ذخیره‌شده (فقط ویجت‌های در دسترس)؛ ویجت‌های تازه یا جاافتاده در جای پیش‌فرض خود قرار می‌گیرند */
export function arrange(available: readonly WidgetId[], saved: { order?: readonly string[]; hidden?: readonly string[] } = {}): DashboardLayout {
  const kept = (saved.order ?? []).filter(isWidget).filter((id) => available.includes(id));
  const missing = available.filter((id) => !kept.includes(id));
  const order = missing.reduce<WidgetId[]>((acc, id) => {
    const defaultIndex = available.indexOf(id);
    const after = acc.findIndex((x) => available.indexOf(x) > defaultIndex);
    return after < 0 ? [...acc, id] : [...acc.slice(0, after), id, ...acc.slice(after)];
  }, kept);
  return { order, hidden: (saved.hidden ?? []).filter(isWidget).filter((id) => available.includes(id)) };
}

/** جابه‌جایی یک ویجت به جای ویجت هدف (برای کشیدن و رها کردن) */
export function moveTo<T>(list: readonly T[], item: T, target: T): T[] {
  const from = list.indexOf(item);
  const to = list.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...list];
  const rest = list.filter((x) => x !== item);
  return [...rest.slice(0, to), item, ...rest.slice(to)];
}

/** یک گام جلوتر یا عقب‌تر (برای دکمه‌های صفحه‌کلید) */
export function shift<T>(list: readonly T[], item: T, by: number): T[] {
  const i = list.indexOf(item);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return [...list];
  return moveTo(list, item, list[j]);
}
