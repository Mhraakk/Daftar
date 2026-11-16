"use server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { addNote } from "@/server/cases";
import { clientSchema, createClient, findSimilarClients, setClientArchived, updateClient } from "@/server/clients";

export async function createClientAction(raw: unknown) {
  return runAction(clientSchema, "client.create", raw, (input, user) => createClient(input, user));
}
export async function updateClientAction(raw: unknown) {
  return runAction(clientSchema.and(z.object({ id: z.string(), version: z.number() })), "client.edit", raw, (input, user) => updateClient(input.id, input.version, input, user));
}
export async function archiveClientAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), archived: z.boolean() }), "client.archive", raw, (i, user) => setClientArchived(i.id, i.archived, user));
}
export async function similarClientsAction(raw: unknown) {
  return runAction(z.object({ nationalId: z.string().optional(), mobile: z.string().optional(), name: z.string().optional() }), "client.create", raw, (i) => findSimilarClients(i));
}
export async function addNoteAction(raw: unknown) {
  return runAction(z.object({ caseId: z.string().optional(), clientId: z.string().optional(), body: z.string().trim().min(2, "متن یادداشت را وارد کنید.").max(5000) }), ["client.view", "case.view"], raw, (i, user) => addNote(i, user));
}
