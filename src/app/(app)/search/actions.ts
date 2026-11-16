"use server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { db } from "@/lib/db";

export async function saveSearchAction(raw: unknown) {
  return runAction(z.object({ name: z.string().trim().min(1, "نام را وارد کنید.").max(80), q: z.string().trim().min(2), type: z.string().optional() }), null, raw, async (i, u) => {
    await db.savedSearch.create({ data: { userId: u.id, name: i.name, query: { q: i.q, type: i.type ?? null } } });
  });
}
export async function deleteSavedSearchAction(raw: unknown) {
  return runAction(z.object({ id: z.string() }), null, raw, async (i, u) => { await db.savedSearch.deleteMany({ where: { id: i.id, userId: u.id } }); });
}
