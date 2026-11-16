"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action";
import "@/server/ai/handlers";
import { applyRewriteToDraft, assistantSchema, startAssistantJob } from "@/server/ai/assistant";
import { createDeadline, deadlineSchema } from "@/server/deadlines";

export async function startAssistantAction(raw: unknown) {
  return runAction(assistantSchema, "ai.use", raw, (input, user) => startAssistantJob(input, user));
}

/** ثبت مهلت پیشنهادی (استخراج قطعی یا پیشنهاد هوش مصنوعی) پس از تأیید کاربر؛ مهلت قانونی تأییدنشده می‌ماند */
export async function createSuggestedDeadlineAction(raw: unknown) {
  const schema = deadlineSchema.extend({ source: z.enum(["EXTRACTED", "AI_SUGGESTED"]) });
  return runAction(schema, "deadline.manage", raw, async (input, user) => {
    const d = await createDeadline(input, user);
    revalidatePath("/deadlines");
    return d;
  });
}

export async function applyRewriteAction(raw: unknown) {
  return runAction(z.object({ jobId: z.string().min(1) }), "draft.create", raw, async (i, user) => {
    const r = await applyRewriteToDraft(i.jobId, user);
    revalidatePath(`/drafts/${r.draftId}`);
    return r;
  });
}
