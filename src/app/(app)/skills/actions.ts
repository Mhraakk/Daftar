"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action";
import "@/server/ai/handlers";
import { cancelAiJob } from "@/server/ai/jobs";
import { continueSkillRun, reviewSkillRun, skillRunToDraft, startSkillRun, startSkillRunSchema } from "@/server/ai/skill-runner";

const MAX_NOTE = 2_000;
const MAX_FOLLOWUP = 8_000;

export async function startSkillRunAction(raw: unknown) {
  return runAction(startSkillRunSchema, "skill.run", raw, (input, user) => startSkillRun(input, user));
}

export async function continueSkillRunAction(raw: unknown) {
  return runAction(z.object({ runId: z.string().min(1), text: z.string().trim().min(1, "متن پاسخ را بنویسید.").max(MAX_FOLLOWUP) }), "skill.run", raw, async (i, user) => {
    const r = await continueSkillRun(i.runId, i.text, user);
    revalidatePath(`/skills/runs/${i.runId}`);
    return r;
  });
}

export async function reviewSkillRunAction(raw: unknown) {
  return runAction(z.object({ runId: z.string().min(1), decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().trim().max(MAX_NOTE).optional().nullable() }), "draft.review", raw, async (i, user) => {
    await reviewSkillRun(i.runId, i.decision, i.note ?? null, user);
    revalidatePath(`/skills/runs/${i.runId}`);
  });
}

export async function skillRunToDraftAction(raw: unknown) {
  return runAction(z.object({ runId: z.string().min(1) }), "draft.create", raw, (i, user) => skillRunToDraft(i.runId, user));
}

export async function cancelAiJobAction(raw: unknown) {
  return runAction(z.object({ id: z.string().min(1), path: z.string().optional() }), null, raw, async (i, user) => {
    await cancelAiJob(i.id, user);
    if (i.path) revalidatePath(i.path);
  });
}
