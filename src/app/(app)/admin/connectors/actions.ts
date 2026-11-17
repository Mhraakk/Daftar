"use server";
// تنظیم اتصال‌های بیرونی دفتر (فقط با مجوز connector.manage)؛ توکن ربات رمزنگاری‌شده ذخیره می‌شود و هرگز به مرورگر برنمی‌گردد
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { legalWebSchema, messengerSchema, saveLegalWeb, saveMessenger, testMessenger } from "@/server/connectors";

const PATH = "/admin/connectors";

export async function saveMessengerAction(raw: unknown) {
  return runAction(messengerSchema, "connector.manage", raw, async (input, user) => {
    await saveMessenger(input, user);
    revalidatePath(PATH);
  });
}

export async function saveLegalWebAction(raw: unknown) {
  return runAction(legalWebSchema, "connector.manage", raw, async (input, user) => {
    await saveLegalWeb(input, user);
    revalidatePath(PATH);
  });
}

export async function testMessengerAction(raw: unknown) {
  return runAction(z.object({}), "connector.manage", raw, async (_input, user) => {
    await testMessenger(user);
    revalidatePath(PATH);
  });
}
