// ترجیحات ظاهر: چیدمان و پوسته هر کاربر، و پیش‌فرض دفتر (Setting «ui») که برای صفحه ورود و کاربرانِ بی‌انتخاب
// به کار می‌رود. ریشه برنامه آن را روی <html data-layout data-skin> می‌نشاند تا ظاهر بدون پرش بارگذاری شود.
import { z } from "zod";
import { audit } from "@/lib/audit";
import { assertCan, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { getSetting, setSetting } from "@/server/admin";
import { DEFAULT_LAYOUT, DEFAULT_SKIN, isLayout, isSkin, LAYOUT_IDS, SKIN_IDS, type LayoutId, type SkinId } from "./skins";

export const TIME_AXES = ["rtl", "ltr"] as const;
export type TimeAxis = (typeof TIME_AXES)[number];
export interface OfficeUi { layout: LayoutId; skin: SkinId; chartTimeAxis: TimeAxis }
export interface ResolvedUi extends OfficeUi { userLayout: LayoutId | null; userSkin: SkinId | null; officeLayout: LayoutId; officeSkin: SkinId }

const UI_KEY = "ui";
export const OFFICE_UI_DEFAULT: OfficeUi = { layout: DEFAULT_LAYOUT, skin: DEFAULT_SKIN, chartTimeAxis: "rtl" };

export const officeUiSchema = z.object({ layout: z.enum(LAYOUT_IDS), skin: z.enum(SKIN_IDS), chartTimeAxis: z.enum(TIME_AXES) });
export const userUiSchema = z.object({ layout: z.enum(LAYOUT_IDS).nullable().optional(), skin: z.enum(SKIN_IDS).nullable().optional() });

export async function getOfficeUi(): Promise<OfficeUi> {
  const raw = await getSetting<unknown>(UI_KEY, OFFICE_UI_DEFAULT);
  const r = officeUiSchema.partial().safeParse(raw);
  return { ...OFFICE_UI_DEFAULT, ...(r.success ? r.data : {}) };
}

/** ظاهر نهایی: انتخاب کاربر، وگرنه پیش‌فرض دفتر */
export async function resolveUi(userId: string | null): Promise<ResolvedUi> {
  const [office, u] = await Promise.all([getOfficeUi(), userId ? db.user.findUnique({ where: { id: userId }, select: { uiLayout: true, uiSkin: true } }) : null]);
  const userLayout = isLayout(u?.uiLayout) ? u.uiLayout : null;
  const userSkin = isSkin(u?.uiSkin) ? u.uiSkin : null;
  return { ...office, layout: userLayout ?? office.layout, skin: userSkin ?? office.skin, userLayout, userSkin, officeLayout: office.layout, officeSkin: office.skin };
}

/** ذخیره انتخاب کاربر؛ null یعنی بازگشت به پیش‌فرض دفتر */
export async function saveUserUi(user: SessionUser, input: z.infer<typeof userUiSchema>): Promise<ResolvedUi> {
  await db.user.update({
    where: { id: user.id },
    data: { ...(input.layout === undefined ? {} : { uiLayout: input.layout }), ...(input.skin === undefined ? {} : { uiSkin: input.skin }) },
  });
  return resolveUi(user.id);
}

export async function saveOfficeUi(user: SessionUser, input: OfficeUi): Promise<void> {
  assertCan(user, "settings.manage");
  const before = await getOfficeUi();
  await setSetting(UI_KEY, input, user);
  await audit({ actorId: user.id, action: "settings.updated", entityType: "Setting", entityId: UI_KEY, entityLabel: "ظاهر پیش‌فرض دفتر", meta: { before: { ...before }, after: { ...input } } });
}
