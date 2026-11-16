"use server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { createBackup, verifyBackup } from "@/server/backup";

export async function createBackupAction(raw: unknown) {
  return runAction(z.object({ note: z.string().trim().max(200).optional() }), "backup.manage", raw, (i, u) => createBackup("MANUAL", u.id, i.note || null));
}
export async function verifyBackupAction(raw: unknown) {
  return runAction(z.object({ id: z.string() }), "backup.manage", raw, (i, u) => verifyBackup(i.id, u.id));
}
