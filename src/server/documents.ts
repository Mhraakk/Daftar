import type { Confidentiality, Prisma } from "@prisma/client";
import path from "node:path";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError, ForbiddenError } from "@/lib/errors";
import { DOCUMENT_CATEGORIES } from "@/lib/labels";
import { nextNumber } from "@/lib/numbering";
import { newStorageKey, sanitizeFileName, sha256, storage, validateUpload } from "@/lib/storage";
import { toEnDigits } from "@/lib/text";
import { assertCaseAccess, assertClientAccess, assertCorrAccess, assertDocumentAccess, assertTaskAccess, documentScope } from "./access";
import { indexEntity, unindexEntity } from "./search-index";
import { extractText } from "./text-extract";

export const documentMetaSchema = z.object({
  title: z.string().trim().min(2, "عنوان سند الزامی است.").max(200),
  category: z.string().refine((v) => DOCUMENT_CATEGORIES.includes(v), "نوع سند نامعتبر است."),
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  confidentiality: z.enum(["NORMAL", "CONFIDENTIAL", "RESTRICTED"]).default("NORMAL"),
  caseId: z.string().optional().transform((v) => v || null),
  clientId: z.string().optional().transform((v) => v || null),
  correspondenceId: z.string().optional().transform((v) => v || null),
  taskId: z.string().optional().transform((v) => v || null),
  folderId: z.string().optional().transform((v) => v || null),
});
export type DocumentMeta = z.infer<typeof documentMetaSchema>;

export async function reindexDocument(id: string) {
  const d = await db.document.findUnique({ where: { id }, include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } } });
  if (!d) return;
  if (d.deletedAt) return unindexEntity("document", id);
  const v = d.versions[0];
  await indexEntity({
    entityType: "document", entityId: d.id, title: d.title,
    subtitle: [d.code, d.category, v?.fileName].filter(Boolean).join(" · "),
    body: [d.description, d.tags.join(" "), v?.extractedText].filter(Boolean).join("\n"),
    caseId: d.caseId, clientId: d.clientId, ownerId: d.createdById, restricted: d.confidentiality !== "NORMAL", link: `/documents/${d.id}`,
  });
}

async function resolveLinks(meta: Pick<DocumentMeta, "caseId" | "clientId" | "correspondenceId" | "taskId">, user: SessionUser) {
  let { caseId, clientId } = meta;
  if (caseId) { const c = await assertCaseAccess(user, caseId); clientId = c.clientId; }
  else if (clientId) await assertClientAccess(user, clientId);
  if (meta.correspondenceId) {
    const c = await assertCorrAccess(user, meta.correspondenceId);
    caseId ??= c.caseId; clientId ??= c.clientId;
  }
  if (meta.taskId) {
    const t = await assertTaskAccess(user, meta.taskId);
    caseId ??= t.caseId; clientId ??= t.clientId;
  }
  return { caseId, clientId };
}

async function storeFile(fileName: string, data: Buffer) {
  const safe = sanitizeFileName(fileName);
  const { mime, ext } = validateUpload(safe, data);
  const key = newStorageKey("documents", ext);
  await storage.put(key, data);
  const { text, status } = await extractText(data, mime, ext);
  return { fileName: safe, mimeType: mime, size: data.length, sha256: sha256(data), storageKey: key, extractedText: text, textStatus: status };
}

export async function createDocument(meta: DocumentMeta, file: { name: string; data: Buffer }, user: SessionUser, messageId?: string | null) {
  if (!can(user, "document.upload")) throw new ForbiddenError();
  if (meta.confidentiality !== "NORMAL" && !can(user, "document.view_confidential")) throw new ForbiddenError("ثبت سند محرمانه نیازمند مجوز است.");
  const links = await resolveLinks(meta, user);
  const stored = await storeFile(file.name, file.data);
  const duplicate = await db.documentVersion.findFirst({
    where: { sha256: stored.sha256, document: { deletedAt: null, caseId: links.caseId ?? undefined } },
    select: { document: { select: { id: true, code: true, title: true } } },
  });
  try {
    const doc = await db.$transaction(async (tx) => {
      const code = await nextNumber("DOCUMENT", tx);
      const d = await tx.document.create({
        data: {
          code, title: meta.title, category: meta.category, description: meta.description, tags: meta.tags, confidentiality: meta.confidentiality,
          caseId: links.caseId, clientId: links.clientId, correspondenceId: meta.correspondenceId, taskId: meta.taskId, messageId: messageId ?? null,
          folderId: meta.folderId, createdById: user.id,
          versions: { create: { versionNo: 1, ...stored, uploadedById: user.id } },
        },
      });
      await audit({ actorId: user.id, action: "document.uploaded", entityType: "Document", entityId: d.id, entityLabel: `${d.title} (${d.code})`, caseId: d.caseId, clientId: d.clientId, meta: { fileName: stored.fileName, size: stored.size, sha256: stored.sha256, confidentiality: d.confidentiality } }, tx);
      return d;
    });
    await reindexDocument(doc.id);
    return { id: doc.id, code: doc.code, duplicateOf: duplicate?.document ?? null };
  } catch (e) {
    await storage.remove(stored.storageKey).catch(() => {});
    throw e;
  }
}

export async function addDocumentVersion(id: string, file: { name: string; data: Buffer }, note: string | null, user: SessionUser) {
  if (!can(user, "document.upload")) throw new ForbiddenError();
  const d = await assertDocumentAccess(user, id);
  if (d.archivedAt) throw new AppError("سند بایگانی‌شده نسخه جدید نمی‌پذیرد.");
  const stored = await storeFile(file.name, file.data);
  try {
    const v = await db.$transaction(async (tx) => {
      const last = await tx.documentVersion.findFirst({ where: { documentId: id }, orderBy: { versionNo: "desc" } });
      if (last?.sha256 === stored.sha256) throw new AppError("این فایل با آخرین نسخه سند یکسان است.");
      const ver = await tx.documentVersion.create({ data: { documentId: id, versionNo: (last?.versionNo ?? 0) + 1, ...stored, note, uploadedById: user.id } });
      await tx.document.update({ where: { id }, data: { updatedAt: new Date() } });
      await audit({ actorId: user.id, action: "document.version_added", entityType: "Document", entityId: id, entityLabel: `${d.title} (${d.code})`, caseId: d.caseId, clientId: d.clientId, meta: { versionNo: ver.versionNo, fileName: stored.fileName, sha256: stored.sha256 } }, tx);
      return ver;
    });
    await reindexDocument(id);
    return { versionNo: v.versionNo };
  } catch (e) {
    await storage.remove(stored.storageKey).catch(() => {});
    throw e;
  }
}

export async function updateDocumentMeta(id: string, meta: Omit<DocumentMeta, "caseId" | "clientId" | "correspondenceId" | "taskId">, user: SessionUser) {
  const d = await assertDocumentAccess(user, id);
  if (!can(user, "document.edit") && d.createdById !== user.id) throw new ForbiddenError();
  if (meta.confidentiality !== d.confidentiality && !can(user, "document.view_confidential")) throw new ForbiddenError("تغییر سطح محرمانگی نیازمند مجوز است.");
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { title: meta.title, category: meta.category, description: meta.description, tags: meta.tags, confidentiality: meta.confidentiality as Confidentiality, folderId: meta.folderId } });
    await audit({ actorId: user.id, action: "document.updated", entityType: "Document", entityId: id, entityLabel: `${meta.title} (${d.code})`, caseId: d.caseId, clientId: d.clientId, meta: { confidentiality: { from: d.confidentiality, to: meta.confidentiality } } }, tx);
  });
  await reindexDocument(id);
}

/** حذف منطقی: فایل و نسخه‌ها حفظ می‌شوند و سند قابل بازیابی است. */
export async function setDocumentDeleted(id: string, deleted: boolean, user: SessionUser) {
  if (!can(user, "document.delete")) throw new ForbiddenError();
  const d = await assertDocumentAccess(user, id, { includeDeleted: true });
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { deletedAt: deleted ? new Date() : null, deletedById: deleted ? user.id : null } });
    await audit({ actorId: user.id, action: deleted ? "document.deleted" : "document.restored", entityType: "Document", entityId: id, entityLabel: `${d.title} (${d.code})`, caseId: d.caseId, clientId: d.clientId }, tx);
  });
  await reindexDocument(id);
}

export async function setDocumentAccess(id: string, userIds: string[], user: SessionUser) {
  const d = await assertDocumentAccess(user, id);
  if (!can(user, "document.view_restricted") && d.createdById !== user.id) throw new ForbiddenError();
  await db.$transaction(async (tx) => {
    await tx.documentAccess.deleteMany({ where: { documentId: id } });
    if (userIds.length) await tx.documentAccess.createMany({ data: userIds.map((userId) => ({ documentId: id, userId })) });
    await audit({ actorId: user.id, action: "document.access_changed", entityType: "Document", entityId: id, entityLabel: `${d.title} (${d.code})`, caseId: d.caseId, clientId: d.clientId, meta: { userIds } }, tx);
  });
}

/** واکشی فایل با بررسی دسترسی و ثبت در تاریخچه (برای دانلود و پیش‌نمایش) */
export async function readDocumentFile(id: string, versionNo: number | null, user: SessionUser, mode: "download" | "view") {
  const d = await assertDocumentAccess(user, id);
  const v = await db.documentVersion.findFirst({ where: { documentId: id, ...(versionNo ? { versionNo } : {}) }, orderBy: { versionNo: "desc" } });
  if (!v) throw new AppError("نسخه سند یافت نشد.", "NOT_FOUND", 404);
  const data = await storage.get(v.storageKey);
  if (sha256(data) !== v.sha256) throw new AppError("یکپارچگی فایل ذخیره‌شده تأیید نشد. با مدیر سامانه تماس بگیرید.", "INTEGRITY", 500);
  if (mode === "download" || d.confidentiality !== "NORMAL") {
    await audit({ actorId: user.id, action: mode === "download" ? "document.downloaded" : "document.viewed", entityType: "Document", entityId: id, entityLabel: `${d.title} (${d.code})`, caseId: d.caseId, clientId: d.clientId, meta: { versionNo: v.versionNo } });
  }
  return { data, version: v, document: d };
}

export async function listDocuments(user: SessionUser, p: { q?: string; category?: string; confidentiality?: string; caseId?: string; clientId?: string; folderId?: string; state?: string; tag?: string; page: number; pageSize: number }) {
  const deleted = p.state === "deleted" && can(user, "document.delete");
  const and: Prisma.DocumentWhereInput[] = [documentScope(user, { includeDeleted: deleted })];
  if (deleted) and.push({ deletedAt: { not: null } });
  if (p.category) and.push({ category: p.category });
  if (p.confidentiality && ["NORMAL", "CONFIDENTIAL", "RESTRICTED"].includes(p.confidentiality)) and.push({ confidentiality: p.confidentiality as Confidentiality });
  if (p.caseId) and.push({ caseId: p.caseId });
  if (p.clientId) and.push({ clientId: p.clientId });
  if (p.folderId) and.push({ folderId: p.folderId });
  if (p.tag) and.push({ tags: { has: p.tag } });
  if (p.q) {
    const q = p.q.trim();
    and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { code: { contains: toEnDigits(q), mode: "insensitive" } }, { tags: { has: q } }, { versions: { some: { fileName: { contains: q, mode: "insensitive" } } } }] });
  }
  const where = { AND: and };
  const [total, rows] = await Promise.all([
    db.document.count({ where }),
    db.document.findMany({
      where, orderBy: { updatedAt: "desc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize,
      include: {
        versions: { orderBy: { versionNo: "desc" }, take: 1, select: { versionNo: true, fileName: true, size: true, mimeType: true, textStatus: true } },
        case: { select: { id: true, number: true, title: true } }, client: { select: { id: true, displayName: true } },
      },
    }),
  ]);
  return { total, rows };
}

export function extOf(fileName: string) { return path.extname(fileName).toLowerCase(); }
