"use server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { createDeadline, deadlineSchema, setDeadlineStatus, suggestFromRule, updateDeadline, verifyDeadline } from "@/server/deadlines";

export async function createDeadlineAction(raw: unknown) {
  return runAction(deadlineSchema, "deadline.manage", raw, (i, u) => createDeadline(i, u));
}
export async function updateDeadlineAction(raw: unknown) {
  return runAction(deadlineSchema.and(z.object({ id: z.string() })), "deadline.manage", raw, (i, u) => updateDeadline(i.id, i, u));
}
export async function deadlineStatusAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), status: z.enum(["DONE", "CANCELLED", "MISSED", "OPEN"]), note: z.string().trim().max(1000).optional() }), "deadline.view", raw, (i, u) => setDeadlineStatus(i.id, i.status, i.note || null, u));
}
export async function verifyDeadlineAction(raw: unknown) {
  return runAction(z.object({ id: z.string() }), "deadline.verify_legal", raw, (i, u) => verifyDeadline(i.id, u));
}
export async function suggestDeadlineAction(raw: unknown) {
  return runAction(z.object({ ruleKey: z.string().min(1, "قاعده را انتخاب کنید."), triggerDate: z.string().min(1, "تاریخ ابلاغ الزامی است."), abroad: z.boolean().default(false) }), "deadline.manage", raw, (i) => suggestFromRule(i.ruleKey, i.triggerDate, i.abroad));
}
