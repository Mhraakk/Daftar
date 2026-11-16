"use server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { addTemplateVersion, createTemplate, templateSchema, updateTemplateMeta } from "@/server/templates";

export async function createTemplateAction(raw: unknown) {
  return runAction(templateSchema.and(z.object({ contentHtml: z.string().min(1, "متن قالب الزامی است.").max(2_000_000), sourceKey: z.string().optional(), sourceName: z.string().optional() })), "template.manage", raw,
    (i, u) => createTemplate(i, i.contentHtml, u, i.sourceKey && i.sourceName ? { storageKey: i.sourceKey, fileName: i.sourceName } : undefined));
}
export async function updateTemplateAction(raw: unknown) {
  return runAction(templateSchema.and(z.object({ id: z.string(), isActive: z.boolean().optional() })), "template.manage", raw, (i, u) => updateTemplateMeta(i.id, { name: i.name, docType: i.docType, category: i.category, description: i.description, legalBasis: i.legalBasis, isActive: i.isActive }, u));
}
export async function templateVersionAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), contentHtml: z.string().max(2_000_000), note: z.string().trim().max(300).optional() }), "template.manage", raw, (i, u) => addTemplateVersion(i.id, i.contentHtml, i.note || null, u));
}
