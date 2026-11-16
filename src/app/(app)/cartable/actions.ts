"use server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { archiveCorrespondence, corrSchema, createCorrespondence, decideCorrespondence, referCorrespondence, referSchema } from "@/server/correspondence";

export async function createCorrAction(raw: unknown) {
  return runAction(corrSchema, "correspondence.create", raw, (i, u) => createCorrespondence(i, u));
}
export async function referCorrAction(raw: unknown) {
  return runAction(referSchema, "correspondence.refer", raw, (i, u) => referCorrespondence(i, u));
}
export async function decideCorrAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), decision: z.enum(["RETURN", "APPROVE", "REJECT", "COMPLETE"]), note: z.string().trim().max(2000).optional() }), "correspondence.view", raw, (i, u) => decideCorrespondence(i.id, i.decision, i.note || null, u));
}
export async function archiveCorrAction(raw: unknown) {
  return runAction(z.object({ id: z.string() }), "correspondence.archive", raw, (i, u) => archiveCorrespondence(i.id, u));
}
