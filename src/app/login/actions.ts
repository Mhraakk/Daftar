"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/guard";
import { toActionError, type ActionResult } from "@/lib/action";
import { login, logout } from "@/server/auth";

const schema = z.object({ username: z.string().trim().min(1, "نام کاربری را وارد کنید.").max(60), password: z.string().min(1, "رمز عبور را وارد کنید.").max(200) });

export async function loginAction(raw: { username: string; password: string; next?: string }): Promise<ActionResult<{ href: string }>> {
  try {
    const input = schema.parse(raw);
    const r = await login(input.username, input.password);
    const next = raw.next && raw.next.startsWith("/") && !raw.next.startsWith("//") ? raw.next : "/";
    return { ok: true, data: { href: r.mustChangePassword ? "/account?first=1" : next } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function logoutAction() {
  await logout(await getSessionUser());
  redirect("/login");
}
