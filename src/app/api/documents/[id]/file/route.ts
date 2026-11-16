import { apiHandler, contentDisposition } from "@/lib/api";
import { readDocumentFile } from "@/server/documents";

export const runtime = "nodejs";
const INLINE_OK = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain; charset=utf-8"];

// دریافت/پیش‌نمایش فایل سند — فقط پس از بررسی دسترسی؛ فایل‌ها هرگز مستقیم از دیسک سرو نمی‌شوند.
export const GET = apiHandler<{ params: Promise<{ id: string }> }>("document.view", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const u = new URL(req.url);
  const v = u.searchParams.get("v");
  const wantInline = u.searchParams.get("inline") === "1";
  const { data, version } = await readDocumentFile(id, v ? Number(v) : null, user, wantInline ? "view" : "download");
  const inline = wantInline && INLINE_OK.includes(version.mimeType);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": inline ? version.mimeType : "application/octet-stream",
      "Content-Length": String(data.length),
      "Content-Disposition": contentDisposition(version.fileName, inline),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
