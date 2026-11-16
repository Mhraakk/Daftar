"use server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { addParty, assignCase, caseSchema, changeCaseStatus, createCase, partySchema, removeParty, setCaseMember, updateCase } from "@/server/cases";

export async function createCaseAction(raw: unknown) {
  return runAction(caseSchema, "case.create", raw, (i, u) => createCase(i, u));
}
export async function updateCaseAction(raw: unknown) {
  return runAction(caseSchema.and(z.object({ id: z.string(), version: z.number() })), "case.edit", raw, (i, u) => updateCase(i.id, i.version, i, u));
}
export async function changeCaseStatusAction(raw: unknown) {
  return runAction(
    z.object({ id: z.string(), to: z.enum(["INTAKE", "OPEN", "IN_PROGRESS", "WAITING", "CLOSED", "ARCHIVED"]), reason: z.string().optional(), acknowledgeOpenItems: z.boolean().optional() }),
    ["case.edit", "case.close"], raw, (i, u) => changeCaseStatus(i.id, i.to, u, { reason: i.reason, acknowledgeOpenItems: i.acknowledgeOpenItems }),
  );
}
export async function assignCaseAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), responsibleId: z.string().min(1, "کارمند مسئول را انتخاب کنید."), note: z.string().trim().max(500).optional() }), "case.assign", raw, (i, u) => assignCase(i.id, i.responsibleId, i.note || null, u));
}
export async function caseMemberAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), userId: z.string().min(1, "کارمند را انتخاب کنید."), add: z.boolean() }), "case.assign", raw, (i, u) => setCaseMember(i.id, i.userId, i.add, u));
}
export async function addPartyAction(raw: unknown) {
  return runAction(partySchema, "case.edit", raw, (i, u) => addParty(i, u));
}
export async function removePartyAction(raw: unknown) {
  return runAction(z.object({ partyId: z.string() }), "case.edit", raw, (i, u) => removeParty(i.partyId, u));
}
