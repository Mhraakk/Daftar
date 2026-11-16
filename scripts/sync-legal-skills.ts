// همگام‌سازی کتابخانه مهارت‌های حقوقی (vendor/legal-skills) با جدول LegalSkill.
// اجرا: npm run skills:sync
import { db } from "../src/lib/db";
import { syncSkills } from "../src/server/ai/skill-catalog";

async function main(): Promise<void> {
  const r = await syncSkills();
  const modes = await db.legalSkill.groupBy({ by: ["mode"], where: { enabled: true }, _count: true });
  console.log(`[skills] total=${r.total} created=${r.created} updated=${r.updated} disabled=${r.disabled}`);
  console.log(`[skills] by mode: ${modes.map((m) => `${m.mode}=${m._count}`).join(" ")}`);
  await db.$disconnect();
}

void main().catch(async (e: unknown) => {
  console.error("[skills] sync failed:", e instanceof Error ? e.message : e);
  await db.$disconnect();
  process.exit(1);
});
