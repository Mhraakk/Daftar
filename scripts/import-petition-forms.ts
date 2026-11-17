// ابزار زمان توسعه: تجزیه فرم‌های نمونه دادخواست (PDF) و ساخت prisma/seed-data/petitions/forms.json برای seed.
// فایل‌های اصلی با نام پایدار (FK-<sha>.pdf) کنار JSON نگه داشته می‌شوند. نیازمند poppler-utils.
// اجرا: npx tsx scripts/import-petition-forms.ts <پوشه فایل‌های PDF>
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "../src/lib/storage";
import { formCode, parseFormFile } from "../src/server/petitions/import-form";

const OUT_DIR = path.resolve("prisma/seed-data/petitions");
const FORMS_DIR = path.join(OUT_DIR, "forms");

interface Entry { code: string; sha256: string; sourceFile: string; parsed: Awaited<ReturnType<typeof parseFormFile>>["parsed"] }

async function processFile(dir: string, file: string): Promise<Entry> {
  const data = await readFile(path.join(dir, file));
  const sha = sha256(data);
  const code = formCode(sha);
  const target = path.join(FORMS_DIR, `${code}.pdf`);
  await copyFile(path.join(dir, file), target);
  const { parsed } = await parseFormFile(target);
  return { code, sha256: sha, sourceFile: file, parsed };
}

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (!dir) throw new Error("پوشه فایل‌های PDF فرم را بدهید.");
  await mkdir(FORMS_DIR, { recursive: true });
  const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
  const entries = await files.reduce<Promise<Entry[]>>(async (done, f) => [...(await done), await processFile(dir, f)], Promise.resolve([]));
  const forms = [...new Map(entries.map((e) => [e.code, e])).values()].sort((a, b) => a.parsed.title.localeCompare(b.parsed.title, "fa"));
  const incomplete = forms.filter((f) => !f.parsed.title || !f.parsed.bodyTemplate);
  await writeFile(path.join(OUT_DIR, "forms.json"), `${JSON.stringify({ generatedBy: "scripts/import-petition-forms.ts", formCount: forms.length, forms }, null, 1)}\n`);
  forms.forEach((f) => console.log(`${f.code}  ${f.parsed.title}  [${f.parsed.category}]  blanks=${f.parsed.blanks.length}${f.parsed.warnings.length ? `  ⚠ ${f.parsed.warnings.join(" | ")}` : ""}`));
  console.log(`[forms] ${forms.length} parsed, ${incomplete.length} incomplete`);
  if (incomplete.length) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
