"use server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { documentMetaSchema, setDocumentAccess, setDocumentDeleted, updateDocumentMeta } from "@/server/documents";

export async function updateDocumentAction(raw: unknown) {
  return runAction(documentMetaSchema.and(z.object({ id: z.string() })), "document.view", raw, (i, u) => updateDocumentMeta(i.id, i, u));
}
export async function deleteDocumentAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), deleted: z.boolean() }), "document.delete", raw, (i, u) => setDocumentDeleted(i.id, i.deleted, u));
}
export async function documentAccessAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), userIds: z.array(z.string()) }), "document.view", raw, (i, u) => setDocumentAccess(i.id, i.userIds, u));
}
