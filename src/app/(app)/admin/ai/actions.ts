"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { aiSettingsSchema } from "@/server/ai/config";
import { runConnectionTest, saveAiSettings } from "@/server/ai/settings";
import { syncSkills } from "@/server/ai/skill-catalog";

export async function saveAiSettingsAction(raw: unknown) {
  return runAction(aiSettingsSchema, "ai.configure", raw, async (input, user) => {
    await saveAiSettings(input, user);
    revalidatePath("/admin/ai");
  });
}

export async function testAiConnectionAction(raw: unknown) {
  return runAction(z.object({}).passthrough(), "ai.configure", raw ?? {}, async (_i, user) => runConnectionTest(user));
}

export async function syncSkillsAction(raw: unknown) {
  return runAction(z.object({}).passthrough(), "skill.manage", raw ?? {}, async (_i, user) => {
    const r = await syncSkills();
    await audit({ actorId: user.id, action: "skill.synced", entityType: "LegalSkill", entityLabel: "کتابخانه مهارت‌ها", meta: r });
    revalidatePath("/skills");
    revalidatePath("/admin/ai");
    return r;
  });
}

export async function toggleSkillAction(raw: unknown) {
  return runAction(z.object({ slug: z.string().min(1), enabled: z.boolean() }), "skill.manage", raw, async (i, user) => {
    const s = await db.legalSkill.update({ where: { slug: i.slug }, data: { enabled: i.enabled } });
    await audit({ actorId: user.id, action: i.enabled ? "skill.enabled" : "skill.disabled", entityType: "LegalSkill", entityId: s.id, entityLabel: s.slug });
    revalidatePath("/skills");
    revalidatePath(`/skills/${i.slug}`);
  });
}
