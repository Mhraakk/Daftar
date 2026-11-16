"use server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { cancelEvent, createEvent, eventSchema } from "@/server/calendar";

export async function createEventAction(raw: unknown) {
  return runAction(eventSchema, "calendar.manage", raw, (i, u) => createEvent(i, u));
}
export async function cancelEventAction(raw: unknown) {
  return runAction(z.object({ id: z.string() }), "calendar.manage", raw, (i, u) => cancelEvent(i.id, u));
}
