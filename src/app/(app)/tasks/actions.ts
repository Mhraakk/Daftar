"use server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { changeTaskStatus, commentTask, createTask, reassignTask, reviewTask, setTaskProgress, taskSchema, updateTask } from "@/server/tasks";

export async function createTaskAction(raw: unknown) {
  return runAction(taskSchema, "task.create", raw, (i, u) => createTask(i, u));
}
export async function updateTaskAction(raw: unknown) {
  return runAction(taskSchema.and(z.object({ id: z.string(), version: z.number() })), "task.view", raw, (i, u) => updateTask(i.id, i.version, i, u));
}
export async function taskStatusAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), to: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]), result: z.string().trim().max(5000).optional() }), "task.view", raw, (i, u) => changeTaskStatus(i.id, i.to, u, { result: i.result }));
}
export async function taskProgressAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), progress: z.coerce.number().min(0).max(99) }), "task.view", raw, (i, u) => setTaskProgress(i.id, i.progress, u));
}
export async function reviewTaskAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), approve: z.boolean(), comment: z.string().trim().max(2000).optional() }), "task.view", raw, (i, u) => reviewTask(i.id, i.approve, i.comment || null, u));
}
export async function reassignTaskAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), toUserId: z.string().min(1, "کارمند را انتخاب کنید."), note: z.string().trim().max(500).optional() }), "task.assign", raw, (i, u) => reassignTask(i.id, i.toUserId, i.note || null, u));
}
export async function commentTaskAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), body: z.string().trim().min(1, "متن نظر را وارد کنید.").max(3000) }), "task.view", raw, (i, u) => commentTask(i.id, i.body, u));
}
