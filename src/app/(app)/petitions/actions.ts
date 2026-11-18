"use server";
// کنش‌های دادخواست: ساخت سند از نوع دادخواست، ذخیره داده استودیو، گزارش بررسی و مهلت، مدیریت انواع
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { petitionTypeUpdateSchema, setPetitionTypeStatus, updatePetitionType } from "@/server/petitions/catalog";
import { PETITION_TYPE_STATUSES, petitionDataSchema } from "@/server/petitions/data";
import { bodySuggestionState, requestBodySuggestion } from "@/server/petitions/ai-body";
import { createPetitionDraft, createPetitionSchema, petitionDeadline, petitionReport, savePetition } from "@/server/petitions/drafting";

const ID_MAX = 40;
const id = z.string().min(1).max(ID_MAX);

export async function createPetitionAction(raw: unknown) {
  return runAction(createPetitionSchema, "draft.create", raw, (input, user) => createPetitionDraft(input, user));
}

export async function savePetitionAction(raw: unknown) {
  return runAction(z.object({ id, version: z.number().int().min(1), data: z.unknown(), aiAssisted: z.boolean().optional() }), "draft.create", raw, async (input, user) => {
    const saved = await savePetition(input.id, input.version, input.data, user, input.aiAssisted ?? false);
    const report = await petitionReport(input.id, user);
    revalidatePath(`/drafts/${input.id}`);
    return { ...saved, validation: report.validation, deadline: report.deadline };
  });
}

export async function petitionReportAction(raw: unknown) {
  return runAction(z.object({ id }), "draft.view", raw, async (input, user) => {
    const report = await petitionReport(input.id, user);
    return { validation: report.validation, deadline: report.deadline };
  });
}

/** مهلت برای داده ذخیره‌نشده استودیو (پیش‌نمایش زنده؛ چیزی ذخیره نمی‌شود) */
export async function petitionDeadlineAction(raw: unknown) {
  return runAction(z.object({ id, data: z.unknown() }), "draft.view", raw, async (input, user) => {
    const report = await petitionReport(input.id, user);
    return petitionDeadline(report.spec, petitionDataSchema.parse(input.data));
  });
}

export async function updatePetitionTypeAction(raw: unknown) {
  return runAction(petitionTypeUpdateSchema.extend({ id }), "petition.manage", raw, async ({ id: typeId, ...input }, user) => {
    const r = await updatePetitionType(typeId, input, user);
    revalidatePath(`/petitions/${typeId}`);
    return r;
  });
}

export async function setPetitionTypeStatusAction(raw: unknown) {
  return runAction(z.object({ id, status: z.enum(PETITION_TYPE_STATUSES) }), "petition.manage", raw, async (input, user) => {
    await setPetitionTypeStatus(input.id, input.status, user);
    revalidatePath("/petitions");
    revalidatePath(`/petitions/${input.id}`);
  });
}

/** درخواست پیشنهاد هوش مصنوعی برای جاهای خالی شرح خواسته (خروجی تا اعمال کاربر در سند نمی‌نشیند) */
export async function requestBodySuggestionAction(raw: unknown) {
  return runAction(z.object({ id, confirmSend: z.boolean().default(false) }), "ai.use", raw, (input, user) => requestBodySuggestion(input.id, user, input.confirmSend));
}

export async function bodySuggestionAction(raw: unknown) {
  return runAction(z.object({ jobId: id }), "ai.use", raw, (input, user) => bodySuggestionState(input.jobId, user));
}
