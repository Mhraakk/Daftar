import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertCan, requireUserStrict, type SessionUser } from "./auth/guard";
import { AppError } from "./errors";
import type { PermissionKey } from "./permissions";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

export function toActionError(e: unknown): ActionResult<never> {
  if (e instanceof AppError) return { ok: false, error: e.message, code: e.code, fieldErrors: e.fieldErrors };
  if (e instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of e.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { ok: false, error: "اطلاعات واردشده معتبر نیست.", code: "VALIDATION", fieldErrors };
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return { ok: false, error: "رکوردی با این مشخصات یکتا قبلاً ثبت شده است.", code: "DUPLICATE" };
    if (e.code === "P2003") return { ok: false, error: "این رکورد به اطلاعات دیگری وابسته است و قابل حذف نیست.", code: "FK" };
    if (e.code === "P2025") return { ok: false, error: "رکورد مورد نظر یافت نشد.", code: "NOT_FOUND" };
  }
  // خطاهای داخلی Next (redirect / notFound) باید عبور کنند
  if (typeof e === "object" && e && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
  console.error("[action] unexpected error", e);
  return { ok: false, error: "خطای غیرمنتظره رخ داد. دوباره تلاش کنید.", code: "INTERNAL" };
}

/**
 * پوشش استاندارد Server Action: احراز هویت، بررسی مجوز سمت سرور، اعتبارسنجی ورودی و مدیریت خطا.
 * (فایل‌های "use server" فقط تابع async صادر می‌کنند؛ هر اکشن این تابع را فراخوانی می‌کند.)
 */
export async function runAction<S extends z.ZodTypeAny, R>(
  schema: S,
  perm: PermissionKey | PermissionKey[] | null,
  raw: unknown,
  fn: (input: z.infer<S>, user: SessionUser) => Promise<R>,
): Promise<ActionResult<R>> {
  try {
    const user = await requireUserStrict();
    if (perm) {
      const perms = Array.isArray(perm) ? perm : [perm];
      if (!perms.some((p) => user.permissions.has(p))) assertCan(user, perms[0]);
    }
    const input = schema.parse(raw);
    const data = await fn(input, user);
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}
