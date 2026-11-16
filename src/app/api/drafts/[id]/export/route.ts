import { apiHandler, contentDisposition } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { exportDraft } from "@/server/draft-export";

export const runtime = "nodejs";

export const GET = apiHandler<{ params: Promise<{ id: string }> }>("draft.view", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format");
  if (format !== "docx" && format !== "pdf") throw new AppError("قالب خروجی نامعتبر است.");
  const { data, fileName } = await exportDraft(id, format, user);
  const inline = new URL(req.url).searchParams.get("inline") === "1" && format === "pdf";
  return new Response(new Uint8Array(data), { headers: { "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": contentDisposition(fileName, inline), "Cache-Control": "private, no-store" } });
});
