// ورود فرم‌های دادخواست (PDF جدول‌دار «دادخواست خدمات قضایی»): هر فایل یک نوع «پیش‌نویس» برای بازبینی و انتشار
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { importPetitionForm } from "@/server/petitions/import-form";

const MAX_FILES = 40;

interface Outcome { fileName: string; id?: string; existed?: boolean; warnings?: string[]; error?: string }

export const POST = apiHandler("petition.manage", async (req, user) => {
  const files = (await req.formData()).getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) throw new AppError("فایلی انتخاب نشده است.");
  if (files.length > MAX_FILES) throw new AppError(`در هر بار حداکثر ${MAX_FILES} فایل.`);
  const results = await files.reduce<Promise<Outcome[]>>(async (done, f) => {
    const list = await done;
    try {
      const r = await importPetitionForm({ data: Buffer.from(await f.arrayBuffer()), fileName: f.name }, user);
      return [...list, { fileName: f.name, ...r }];
    } catch (e) {
      return [...list, { fileName: f.name, error: e instanceof AppError ? e.message : "خطا در خواندن فایل" }];
    }
  }, Promise.resolve([]));
  return NextResponse.json({ results });
});
