"use server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { finalizeDraft } from "@/server/draft-export";
import { addDraftSource, addLibrarySource, createDraft, createDraftSchema, prepareTemplate, removeDraftSource, reopenDraft, restoreDraftVersion, reviewDraft, saveDraft, setDraftSourceVerified, submitDraft } from "@/server/drafts";

const HTML_MAX = 2_000_000;
const NOTE_MAX = 300;
const COMMENT_MAX = 3000;
const CITATION_MIN = 3;
const URL_MAX = 500;
const SOURCE_NOTE_MAX = 1000;
const ID_MAX = 40;

export async function prepareTemplateAction(raw: unknown) {
  return runAction(z.object({ templateId: z.string(), caseId: z.string().optional() }), "draft.create", raw, (i, u) => prepareTemplate(i.templateId, i.caseId || null, u));
}
export async function createDraftAction(raw: unknown) { return runAction(createDraftSchema, "draft.create", raw, (i, u) => createDraft(i, u)); }
export async function saveDraftAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), version: z.number(), contentHtml: z.string().max(HTML_MAX), mode: z.enum(["AUTOSAVE", "MANUAL"]), note: z.string().trim().max(NOTE_MAX).optional(), title: z.string().optional() }), "draft.create", raw, (i, u) => saveDraft(i.id, i.version, i.contentHtml, i.mode, i.note || null, u, i.title));
}
export async function restoreDraftAction(raw: unknown) { return runAction(z.object({ id: z.string(), versionNo: z.number() }), "draft.create", raw, (i, u) => restoreDraftVersion(i.id, i.versionNo, u)); }
export async function submitDraftAction(raw: unknown) { return runAction(z.object({ id: z.string(), reviewerId: z.string().min(1, "بررسی‌کننده را انتخاب کنید.") }), "draft.create", raw, (i, u) => submitDraft(i.id, i.reviewerId, u)); }
export async function reviewDraftAction(raw: unknown) { return runAction(z.object({ id: z.string(), decision: z.enum(["APPROVE", "CHANGES"]), comment: z.string().trim().max(COMMENT_MAX).optional() }), "draft.review", raw, (i, u) => reviewDraft(i.id, i.decision, i.comment || null, u)); }
export async function reopenDraftAction(raw: unknown) { return runAction(z.object({ id: z.string() }), "draft.create", raw, (i, u) => reopenDraft(i.id, u)); }
export async function finalizeDraftAction(raw: unknown) { return runAction(z.object({ id: z.string() }), "draft.finalize", raw, (i, u) => finalizeDraft(i.id, u)); }
export async function addSourceAction(raw: unknown) {
  return runAction(z.object({ draftId: z.string(), citation: z.string().trim().min(CITATION_MIN, "متن ارجاع الزامی است.").max(URL_MAX), url: z.string().trim().max(URL_MAX).optional(), note: z.string().trim().max(SOURCE_NOTE_MAX).optional() }), "draft.create", raw, (i, u) => addDraftSource({ draftId: i.draftId, citation: i.citation, url: i.url || null, note: i.note || null }, u));
}
export async function addLibrarySourceAction(raw: unknown) { return runAction(z.object({ draftId: z.string().min(1).max(ID_MAX), legalSourceId: z.string().min(1).max(ID_MAX) }), "draft.create", raw, (i, u) => addLibrarySource(i.draftId, i.legalSourceId, u)); }
export async function verifySourceAction(raw: unknown) { return runAction(z.object({ sourceId: z.string(), verified: z.boolean() }), "draft.review", raw, (i, u) => setDraftSourceVerified(i.sourceId, i.verified, u)); }
export async function removeSourceAction(raw: unknown) { return runAction(z.object({ sourceId: z.string() }), "draft.create", raw, (i, u) => removeDraftSource(i.sourceId, u)); }
