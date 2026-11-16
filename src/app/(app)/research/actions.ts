"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { importFromUrl } from "@/server/connectors";
import {
  deleteLegalSource, deleteResearch, legalSourceSchema, researchSchema, saveLegalSource, saveResearch, verifyLaw, verifyLegalSource,
} from "@/server/legal-library";

const MAX_URL = 2_000;

export async function saveLegalSourceAction(raw: unknown) {
  return runAction(legalSourceSchema, "legal_source.manage", raw, async (input, user) => {
    const r = await saveLegalSource(input, user);
    revalidatePath("/research/library");
    return r;
  });
}

export async function verifyLegalSourceAction(raw: unknown) {
  return runAction(z.object({ id: z.string().min(1), verified: z.boolean() }), "legal_source.manage", raw, async (i, user) => {
    await verifyLegalSource(i.id, i.verified, user);
    revalidatePath(`/research/library/${i.id}`);
  });
}

export async function deleteLegalSourceAction(raw: unknown) {
  return runAction(z.object({ id: z.string().min(1) }), "legal_source.manage", raw, async (i, user) => {
    await deleteLegalSource(i.id, user);
    revalidatePath("/research/library");
  });
}

export async function verifyLawAction(raw: unknown) {
  return runAction(z.object({ code: z.string().min(1), verified: z.boolean() }), "legal_source.manage", raw, async (i, user) => {
    const r = await verifyLaw(i.code, i.verified, user);
    revalidatePath("/research");
    revalidatePath(`/research/laws/${i.code}`);
    return r;
  });
}

export async function saveResearchAction(raw: unknown) {
  return runAction(researchSchema, "research.use", raw, async (input, user) => {
    const r = await saveResearch(input, user);
    revalidatePath("/research");
    return r;
  });
}

export async function deleteResearchAction(raw: unknown) {
  return runAction(z.object({ id: z.string().min(1) }), "research.use", raw, async (i, user) => {
    await deleteResearch(i.id, user);
    revalidatePath("/research");
  });
}

export async function importFromUrlAction(raw: unknown) {
  return runAction(z.object({ url: z.string().trim().min(1, "نشانی صفحه را وارد کنید.").max(MAX_URL) }), "legal_source.manage", raw, async (i, user) => {
    const r = await importFromUrl(i.url, user);
    revalidatePath("/research/library");
    return r;
  });
}
