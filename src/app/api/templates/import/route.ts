import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { extractFields } from "@/lib/template-fields";
import { importTemplateFile } from "@/server/templates";

export const runtime = "nodejs";

// تبدیل فایل Word/PDF به متن قالب قابل ویرایش (برای بازبینی پیش از ذخیره)
export const POST = apiHandler("template.manage", async (req) => {
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) throw new AppError("فایلی انتخاب نشده است.");
  const r = await importTemplateFile(file.name, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ ok: true, html: r.html, sourceKey: r.storageKey, sourceName: r.fileName, fields: extractFields(r.html) });
});
