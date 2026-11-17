import { apiHandler, contentDisposition } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { storage } from "@/lib/storage";
import { getPetitionType } from "@/server/petitions/catalog";

export const runtime = "nodejs";

// فرم PDF اصلی که نوع دادخواست از آن وارد شده است؛ برای تطبیق متن واردشده با فرم چاپی
export const GET = apiHandler<{ params: Promise<{ id: string }> }>("draft.view", async (_req, user, ctx) => {
  const { id } = await ctx.params;
  const row = await getPetitionType(id, user);
  if (!row.sourceFileKey || !(await storage.exists(row.sourceFileKey))) throw new NotFoundError("فرم اصلی این نوع دادخواست در بایگانی نیست.");
  const data = await storage.get(row.sourceFileKey);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.length),
      "Content-Disposition": contentDisposition(row.sourceFileName ?? `${row.title}.pdf`, true),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
