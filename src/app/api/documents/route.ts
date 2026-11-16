import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { createDocument, documentMetaSchema } from "@/server/documents";

export const runtime = "nodejs";

// بارگذاری سند (multipart/form-data): فیلد file + مشخصات
export const POST = apiHandler("document.upload", async (req, user) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("فایلی انتخاب نشده است.", "VALIDATION", 400, { file: "الزامی است." });
  const meta = documentMetaSchema.parse({
    title: form.get("title") ?? "", category: form.get("category") ?? "", description: form.get("description") ?? "",
    tags: String(form.get("tags") ?? "").split(/[،,]/).map((s) => s.trim()).filter(Boolean),
    confidentiality: form.get("confidentiality") || "NORMAL", caseId: form.get("caseId") ?? "", clientId: form.get("clientId") ?? "",
    correspondenceId: form.get("correspondenceId") ?? "", taskId: form.get("taskId") ?? "", folderId: form.get("folderId") ?? "",
  });
  const r = await createDocument(meta, { name: file.name, data: Buffer.from(await file.arrayBuffer()) }, user);
  return NextResponse.json({ ok: true, ...r });
});
