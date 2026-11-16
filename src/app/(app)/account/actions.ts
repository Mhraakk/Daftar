"use server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { changeOwnPassword } from "@/server/auth";

const schema = z
  .object({ current: z.string().min(1, "رمز فعلی را وارد کنید."), next: z.string().min(8, "رمز جدید باید دست‌کم ۸ نویسه باشد.").max(200), confirm: z.string() })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "تکرار رمز با رمز جدید یکسان نیست." });

export async function changePasswordAction(raw: unknown) {
  return runAction(schema, null, raw, async (input, user) => { await changeOwnPassword(user, input.current, input.next); });
}
