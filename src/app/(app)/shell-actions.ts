"use server";
// ذخیره چیدمان و پوسته انتخابی کاربر (اعمال فوری در مرورگر انجام شده؛ این فقط ماندگارش می‌کند)
import { runAction } from "@/lib/action";
import { saveUserUi, userUiSchema } from "@/theme/prefs";

export async function saveUiAction(raw: unknown) {
  return runAction(userUiSchema, null, raw, async (input, user) => {
    const ui = await saveUserUi(user, input);
    return { layout: ui.layout, skin: ui.skin, userLayout: ui.userLayout, userSkin: ui.userSkin };
  });
}
