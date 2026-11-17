"use server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { formatJalali } from "@/lib/jalali";
import { changeOwnPassword } from "@/server/auth";
import { confirmMessengerLink, setOwnChatId, startMessengerLink } from "@/server/connectors";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const CHAT_ID_MAX = 40;

const schema = z
  .object({ current: z.string().min(1, "رمز فعلی را وارد کنید."), next: z.string().min(PASSWORD_MIN, "رمز جدید باید دست‌کم ۸ نویسه باشد.").max(PASSWORD_MAX), confirm: z.string() })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "تکرار رمز با رمز جدید یکسان نیست." });

export async function changePasswordAction(raw: unknown) {
  return runAction(schema, null, raw, async (input, user) => { await changeOwnPassword(user, input.current, input.next); });
}

/** کد یک‌بارمصرف اتصال به پیام‌رسان */
export async function startMessengerLinkAction(raw: unknown) {
  return runAction(z.object({}), null, raw, async (_input, user) => {
    const r = await startMessengerLink(user);
    return { code: r.code, until: formatJalali(r.until, "time"), bot: r.bot };
  });
}

export async function confirmMessengerLinkAction(raw: unknown) {
  return runAction(z.object({}), null, raw, (_input, user) => confirmMessengerLink(user));
}

/** ثبت دستی شناسه گفت‌وگو؛ مقدار خالی اتصال را قطع می‌کند */
export async function setChatIdAction(raw: unknown) {
  return runAction(z.object({ chatId: z.string().trim().max(CHAT_ID_MAX).optional() }), null, raw, (input, user) => setOwnChatId(user, input.chatId ?? null));
}
