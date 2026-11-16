// ورود متن قانون آیین دادرسی مدنی (prisma/seed-data/acp) به کتابخانه حقوقی. اجرای مکرر امن است.
// اجرا: npm run acp:import
import { db } from "../src/lib/db";
import { ACP_IMPORT, importLaw } from "../src/server/law-import";

async function main(): Promise<void> {
  const r = await importLaw(db, ACP_IMPORT);
  console.log(`[acp] created=${r.created} updated=${r.updated} unchanged=${r.unchanged} verificationReset=${r.verificationReset} keptManualEdits=${r.keptManualEdits} sourceStored=${r.sourceStored}`);
  await db.$disconnect();
}

main().catch(async (e: unknown) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
