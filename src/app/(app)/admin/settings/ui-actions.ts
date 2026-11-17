"use server";
// ظاهر پیش‌فرض دفتر: چیدمان و پوسته برای صفحه ورود و کاربرانی که خودشان انتخاب نکرده‌اند، و جهت محور زمان نمودارها
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { officeUiSchema, saveOfficeUi } from "@/theme/prefs";

export async function saveOfficeUiAction(raw: unknown) {
  return runAction(officeUiSchema, "settings.manage", raw, async (input, user) => {
    await saveOfficeUi(user, input);
    revalidatePath("/", "layout");
  });
}
