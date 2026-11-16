import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { addDocumentVersion } from "@/server/documents";

export const runtime = "nodejs";

export const POST = apiHandler<{ params: Promise<{ id: string }> }>("document.upload", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("فایلی انتخاب نشده است.", "VALIDATION", 400, { file: "الزامی است." });
  const r = await addDocumentVersion(id, { name: file.name, data: Buffer.from(await file.arrayBuffer()) }, String(form.get("note") ?? "").trim().slice(0, 500) || null, user);
  return NextResponse.json({ ok: true, ...r });
});
