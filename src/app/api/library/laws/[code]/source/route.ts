import { apiHandler, contentDisposition } from "@/lib/api";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

// PDF منبعی که متن قانون از آن استخراج شده است؛ برای تطبیق ماده با صفحه چاپی (#page=N)
export const GET = apiHandler<{ params: Promise<{ code: string }> }>("research.use", async (_req, _user, ctx) => {
  const { code } = await ctx.params;
  const law = await db.law.findUnique({ where: { code }, select: { sourceFileKey: true, shortTitle: true, code: true } });
  if (!law?.sourceFileKey || !(await storage.exists(law.sourceFileKey))) throw new NotFoundError();
  const data = await storage.get(law.sourceFileKey);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.length),
      "Content-Disposition": contentDisposition(`${law.shortTitle ?? law.code}.pdf`, true),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
