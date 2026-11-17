// چیدمان پیشخوان هر کاربر در User.uiPrefs.dashboard؛ شناسه‌های ناشناخته هنگام ذخیره رد می‌شوند
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { SessionUser } from "@/lib/auth/guard";
import { WIDGET_IDS } from "@/lib/dashboard-widgets";
import { db } from "@/lib/db";

const MAX_WIDGETS = WIDGET_IDS.length;

export const dashboardLayoutSchema = z.object({
  order: z.array(z.enum(WIDGET_IDS)).max(MAX_WIDGETS),
  hidden: z.array(z.enum(WIDGET_IDS)).max(MAX_WIDGETS),
});

const prefsOf = (v: Prisma.JsonValue): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export async function getDashboardLayout(userId: string): Promise<{ order: string[]; hidden: string[] }> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { uiPrefs: true } });
  const saved = dashboardLayoutSchema.partial().safeParse(prefsOf(u?.uiPrefs ?? {}).dashboard);
  return { order: saved.success ? saved.data.order ?? [] : [], hidden: saved.success ? saved.data.hidden ?? [] : [] };
}

/** ذخیره ترتیب و پنهان‌ها؛ null یعنی بازگشت به چیدمان پیش‌فرض */
export async function saveDashboardLayout(user: SessionUser, input: z.infer<typeof dashboardLayoutSchema> | null): Promise<void> {
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { uiPrefs: true } });
  const { dashboard: _old, ...rest } = prefsOf(u.uiPrefs);
  const next = input ? { ...rest, dashboard: { order: [...new Set(input.order)], hidden: [...new Set(input.hidden)] } } : rest;
  await db.user.update({ where: { id: user.id }, data: { uiPrefs: next as Prisma.InputJsonValue } });
}
