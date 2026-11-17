// داده نمودارهای پایش: فعالیت کاربران به تفکیک روز هفته و ساعت (وقت تهران) و مصرف هفتگی هوش مصنوعی
import { periodIndex, periods } from "@/lib/chart/time";
import { db } from "@/lib/db";
import { addDays } from "@/lib/jalali";

const DAYS_IN_WEEK = 7;
const HOURS_PER_DAY = 24;
const MS_PER_SEC = 1_000;

export interface HourMatrix { values: number[][]; total: number; days: number }

/**
 * شمار رویدادهای تاریخچه در هر خانه «روز هفته × ساعت» به وقت تهران.
 * createdAt بدون منطقه زمانی و به UTC ذخیره می‌شود؛ isodow دوشنبه=۱ … یکشنبه=۷ است و (isodow + 1) % 7 شنبه را صفر می‌کند.
 */
export async function activityByHour(days: number, now = new Date()): Promise<HourMatrix> {
  const rows = await db.$queryRaw<{ dow: number; h: number; n: bigint }[]>`
    SELECT extract(isodow FROM (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran'))::int AS dow,
           extract(hour FROM (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran'))::int AS h,
           count(*) AS n
    FROM "ActivityLog" WHERE "createdAt" >= ${addDays(now, -days)} GROUP BY 1, 2`;
  const values = Array.from({ length: DAYS_IN_WEEK }, (_, w) => Array.from({ length: HOURS_PER_DAY }, (_, h) =>
    Number(rows.find((r) => (r.dow + 1) % DAYS_IN_WEEK === w && r.h === h)?.n ?? 0)));
  return { values, total: values.flat().reduce((a, b) => a + b, 0), days };
}

export interface AiUsage { labels: string[]; long: string[]; runs: number[]; failed: number[]; tokens: number[]; avgSeconds: number[] }

/** اجراها، خطاها، توکن‌ها و میانگین زمان پاسخ هوش مصنوعی در هفته‌های اخیر (هفته از شنبه) */
export async function aiUsage(weeks: number, now = new Date()): Promise<AiUsage> {
  const list = periods("week", weeks, now);
  const rows = await db.aiInteraction.findMany({
    where: { createdAt: { gte: list[0].start } },
    select: { createdAt: true, status: true, inputTokens: true, outputTokens: true, durationMs: true },
  });
  const per = list.map((_, i) => rows.filter((r) => periodIndex(list, r.createdAt) === i));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    labels: list.map((p) => p.label),
    long: list.map((p) => p.long),
    runs: per.map((r) => r.length),
    failed: per.map((r) => r.filter((x) => x.status === "FAILED").length),
    tokens: per.map((r) => r.reduce((a, x) => a + (x.inputTokens ?? 0) + (x.outputTokens ?? 0), 0)),
    avgSeconds: per.map((r) => avg(r.flatMap((x) => (x.durationMs === null ? [] : [x.durationMs / MS_PER_SEC])))),
  };
}
