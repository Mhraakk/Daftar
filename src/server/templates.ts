import { z } from "zod";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { LEGAL_DOC_TYPES } from "@/lib/labels";
import { newStorageKey, sanitizeFileName, storage, validateUpload } from "@/lib/storage";
import { extractFields } from "@/lib/template-fields";
import { sanitizeLegalHtml } from "./sanitize";
import { indexEntity } from "./search-index";

export const templateSchema = z.object({
  name: z.string().trim().min(3, "نام قالب باید دست‌کم ۳ نویسه باشد.").max(120),
  docType: z.string().refine((v) => v in LEGAL_DOC_TYPES, "نوع سند نامعتبر است."),
  category: z.string().trim().max(60).optional().transform((v) => v || null),
  description: z.string().trim().max(1000).optional().transform((v) => v || null),
  legalBasis: z.string().trim().max(500).optional().transform((v) => v || null),
});

async function reindex(id: string) {
  const t = await db.legalTemplate.findUnique({ where: { id }, include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } } });
  if (!t) return;
  await indexEntity({ entityType: "template", entityId: id, title: t.name, subtitle: `قالب ${LEGAL_DOC_TYPES[t.docType] ?? ""}`, body: [t.description, t.versions[0]?.contentHtml.replace(/<[^>]+>/g, " ")].filter(Boolean).join(" "), link: `/templates/${id}` });
}

/** تبدیل فایل Word/PDF بارگذاری‌شده به متن قالب قابل ویرایش */
export async function importTemplateFile(fileName: string, data: Buffer): Promise<{ html: string; storageKey: string; fileName: string }> {
  const safe = sanitizeFileName(fileName);
  const { ext } = validateUpload(safe, data);
  let html: string;
  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    html = (await mammoth.convertToHtml({ buffer: data })).value;
  } else if (ext === ".pdf") {
    const { extractText } = await import("unpdf");
    const r = await extractText(new Uint8Array(data), { mergePages: true });
    const text = (Array.isArray(r.text) ? r.text.join("\n") : r.text).trim();
    if (text.length < 20) throw new AppError("متن قابل استخراجی در این PDF یافت نشد (احتمالاً اسکن‌شده است). نسخه Word قالب را بارگذاری کنید.");
    html = text.split(/\n{2,}|\r?\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${p.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</p>`).join("");
  } else throw new AppError("قالب فقط از فایل Word (‎.docx) یا PDF پذیرفته می‌شود.");
  html = sanitizeLegalHtml(html);
  if (!html) throw new AppError("محتوایی از فایل استخراج نشد.");
  const storageKey = newStorageKey("templates", ext);
  await storage.put(storageKey, data);
  return { html, storageKey, fileName: safe };
}

export async function createTemplate(input: z.infer<typeof templateSchema>, contentHtml: string, user: SessionUser, source?: { storageKey: string; fileName: string }) {
  const html = sanitizeLegalHtml(contentHtml);
  if (!html) throw new AppError("متن قالب خالی است.", "VALIDATION", 400, { contentHtml: "الزامی است." });
  const t = await db.$transaction(async (tx) => {
    const row = await tx.legalTemplate.create({
      data: { name: input.name, docType: input.docType, category: input.category, description: input.description, legalBasis: input.legalBasis, createdById: user.id, versions: { create: { versionNo: 1, contentHtml: html, fields: extractFields(html), sourceFileKey: source?.storageKey, sourceFileName: source?.fileName, note: source ? `درون‌ریزی از ${source.fileName}` : "نسخه نخست", createdById: user.id } } },
    });
    await audit({ actorId: user.id, action: "template.created", entityType: "LegalTemplate", entityId: row.id, entityLabel: row.name, meta: { imported: !!source } }, tx);
    return row;
  });
  await reindex(t.id);
  return { id: t.id };
}

export async function updateTemplateMeta(id: string, input: z.infer<typeof templateSchema> & { isActive?: boolean }, user: SessionUser) {
  const t = await db.legalTemplate.update({ where: { id }, data: { name: input.name, docType: input.docType, category: input.category, description: input.description, legalBasis: input.legalBasis, ...(input.isActive === undefined ? {} : { isActive: input.isActive }) } });
  await audit({ actorId: user.id, action: "template.updated", entityType: "LegalTemplate", entityId: id, entityLabel: t.name, meta: { isActive: t.isActive } });
  await reindex(id);
}

/** هر تغییر متن، نسخه تازه می‌سازد؛ نسخه‌های قبلی و اسناد ساخته‌شده از آن‌ها دست‌نخورده می‌مانند. */
export async function addTemplateVersion(id: string, contentHtml: string, note: string | null, user: SessionUser) {
  const html = sanitizeLegalHtml(contentHtml);
  if (!html) throw new AppError("متن قالب خالی است.");
  const v = await db.$transaction(async (tx) => {
    const t = await tx.legalTemplate.findUniqueOrThrow({ where: { id }, include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } } });
    if (t.versions[0]?.contentHtml === html) throw new AppError("متن قالب تغییری نکرده است.");
    const ver = await tx.legalTemplateVersion.create({ data: { templateId: id, versionNo: (t.versions[0]?.versionNo ?? 0) + 1, contentHtml: html, fields: extractFields(html), note, createdById: user.id } });
    await tx.legalTemplate.update({ where: { id }, data: { updatedAt: new Date() } });
    await audit({ actorId: user.id, action: "template.version_added", entityType: "LegalTemplate", entityId: id, entityLabel: t.name, meta: { versionNo: ver.versionNo, note } }, tx);
    return ver;
  });
  await reindex(id);
  return { versionNo: v.versionNo };
}
