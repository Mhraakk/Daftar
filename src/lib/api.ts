import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, type SessionUser } from "./auth/guard";
import { AppError } from "./errors";
import type { PermissionKey } from "./permissions";

/** پوشش استاندارد Route Handler: احراز هویت، مجوز و تبدیل خطا به پاسخ JSON */
export function apiHandler<C = unknown>(
  perm: PermissionKey | null,
  fn: (req: Request, user: SessionUser, ctx: C) => Promise<Response>,
) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const user = await getSessionUser();
      if (!user) return NextResponse.json({ error: "نشست شما منقضی شده است." }, { status: 401 });
      if (perm && !user.permissions.has(perm)) return NextResponse.json({ error: "شما مجوز انجام این عملیات را ندارید." }, { status: 403 });
      return await fn(req, user, ctx);
    } catch (e) {
      if (e instanceof AppError) return NextResponse.json({ error: e.message, code: e.code, fieldErrors: e.fieldErrors }, { status: e.status });
      if (e instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        for (const i of e.issues) fieldErrors[i.path.join(".")] ??= i.message;
        return NextResponse.json({ error: "اطلاعات واردشده معتبر نیست.", fieldErrors }, { status: 400 });
      }
      console.error("[api] unexpected", e);
      return NextResponse.json({ error: "خطای داخلی سرور." }, { status: 500 });
    }
  };
}

export function contentDisposition(fileName: string, inline = false): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
