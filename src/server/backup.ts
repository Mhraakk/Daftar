// پشتیبان‌گیری کامل (پایگاه داده + فایل‌های اسناد) با راستی‌آزمایی واقعی از طریق بازیابی در پایگاه داده موقت.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { storageRoot } from "@/lib/storage";

const run = promisify(execFile);
const MAXBUF = 64 * 1024 * 1024;
export const backupDir = () => path.resolve(process.env.BACKUP_DIR ?? "./backups");

// libpq پارامتر schema را نمی‌شناسد
function pgUrl(dbName?: string): string {
  const u = new URL(process.env.DATABASE_URL!);
  u.search = "";
  if (dbName) u.pathname = `/${dbName}`;
  return u.toString();
}

const COUNT_TABLES = ["User", "Client", "Case", "Document", "DocumentVersion", "Correspondence", "Task", "Deadline", "ActivityLog", "LegalDraft"];

async function tableCounts(url: string): Promise<Record<string, number>> {
  const sql = COUNT_TABLES.map((t) => `SELECT '${t}' AS t, count(*) AS n FROM "${t}"`).join(" UNION ALL ");
  const { stdout } = await run("psql", [url, "-At", "-F", "|", "-c", sql], { maxBuffer: MAXBUF });
  return Object.fromEntries(stdout.trim().split("\n").map((l) => { const [t, n] = l.split("|"); return [t, Number(n)]; }));
}

async function sha256File(file: string): Promise<string> {
  const h = createHash("sha256");
  await new Promise<void>((res, rej) => createReadStream(file).on("data", (d) => h.update(d)).on("end", () => res()).on("error", rej));
  return h.digest("hex");
}

async function countFiles(dir: string): Promise<number> {
  let n = 0;
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) n += e.isDirectory() ? await countFiles(path.join(dir, e.name)) : 1;
  return n;
}

export interface BackupManifest { createdAt: string; kind: string; counts: Record<string, number>; storageFiles: number; dumpSha256: string; appVersion: string }

export async function createBackup(kind: "MANUAL" | "SCHEDULED", actorId: string | null, note?: string | null) {
  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const fileName = `daftar-${ts}.tar.gz`;
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "daftar-bk-"));
  try {
    const dump = path.join(work, "db.dump");
    await run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${dump}`, pgUrl()], { maxBuffer: MAXBUF });
    const store = storageRoot();
    await fs.mkdir(store, { recursive: true });
    const manifest: BackupManifest = { createdAt: new Date().toISOString(), kind, counts: await tableCounts(pgUrl()), storageFiles: await countFiles(store), dumpSha256: await sha256File(dump), appVersion: process.env.npm_package_version ?? "0.1.0" };
    await fs.writeFile(path.join(work, "manifest.json"), JSON.stringify(manifest, null, 2));
    const out = path.join(dir, fileName);
    await run("tar", ["-czf", out, "-C", work, "db.dump", "manifest.json", "-C", path.dirname(store), path.basename(store)], { maxBuffer: MAXBUF });
    const st = await fs.stat(out);
    const rec = await db.backupRecord.create({ data: { fileName, kind, size: BigInt(st.size), sha256: await sha256File(out), status: "CREATED", note: note ?? null, createdById: actorId } });
    await audit({ actorId, action: "backup.created", entityType: "Backup", entityId: rec.id, entityLabel: fileName, meta: { size: st.size, kind, counts: manifest.counts, storageFiles: manifest.storageFiles } });
    await prune();
    return { id: rec.id, fileName, size: st.size };
  } catch (e) {
    console.error("[backup] failed", e);
    throw e instanceof AppError ? e : new AppError("تهیه پشتیبان ناموفق بود. ابزار pg_dump و مسیر پشتیبان را بررسی کنید.", "BACKUP_FAILED", 500);
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

async function prune() {
  const keep = Number(process.env.BACKUP_KEEP ?? 14);
  const old = await db.backupRecord.findMany({ where: { kind: "SCHEDULED" }, orderBy: { createdAt: "desc" }, skip: keep });
  for (const r of old) {
    await fs.rm(path.join(backupDir(), r.fileName), { force: true });
    await db.backupRecord.update({ where: { id: r.id }, data: { status: "PRUNED" } });
  }
}

/**
 * راستی‌آزمایی: ۱) هش فایل پشتیبان ۲) هش dump درون بسته ۳) بازیابی کامل در پایگاه داده موقت و مقایسه شمار رکوردها
 * ۴) شمار فایل‌های اسناد. پایگاه داده موقت پس از آزمون حذف می‌شود.
 */
export async function verifyBackup(id: string, actorId: string | null) {
  const rec = await db.backupRecord.findUnique({ where: { id } });
  if (!rec) throw new AppError("پشتیبان یافت نشد.", "NOT_FOUND", 404);
  const file = path.join(backupDir(), rec.fileName);
  if (!(await fs.stat(file).catch(() => null))) throw new AppError("فایل پشتیبان روی دیسک موجود نیست.");
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "daftar-vf-"));
  const scratch = `daftar_verify_${Date.now()}`;
  let created = false;
  try {
    const sha = await sha256File(file);
    checks.push({ name: "یکپارچگی فایل پشتیبان (SHA-256)", ok: sha === rec.sha256, detail: sha === rec.sha256 ? "مطابق" : "هش فایل با مقدار ثبت‌شده مغایر است" });
    await run("tar", ["-xzf", file, "-C", work], { maxBuffer: MAXBUF });
    const manifest = JSON.parse(await fs.readFile(path.join(work, "manifest.json"), "utf8")) as BackupManifest;
    const dump = path.join(work, "db.dump");
    const dsha = await sha256File(dump);
    checks.push({ name: "یکپارچگی dump پایگاه داده", ok: dsha === manifest.dumpSha256, detail: dsha === manifest.dumpSha256 ? "مطابق" : "مغایر" });
    await run("psql", [pgUrl("postgres"), "-c", `CREATE DATABASE "${scratch}"`], { maxBuffer: MAXBUF });
    created = true;
    await run("pg_restore", ["--no-owner", "--no-privileges", "--exit-on-error", `--dbname=${pgUrl(scratch)}`, dump], { maxBuffer: MAXBUF });
    const counts = await tableCounts(pgUrl(scratch));
    const diff = COUNT_TABLES.filter((t) => counts[t] !== manifest.counts[t]);
    checks.push({ name: "بازیابی آزمایشی و مقایسه شمار رکوردها", ok: diff.length === 0, detail: diff.length ? `مغایرت در: ${diff.join("، ")}` : COUNT_TABLES.map((t) => `${t}=${counts[t]}`).join(" · ") });
    const orphan = await run("psql", [pgUrl(scratch), "-At", "-c", `SELECT count(*) FROM "Document" d WHERE d."caseId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Case" c WHERE c.id = d."caseId")`], { maxBuffer: MAXBUF });
    checks.push({ name: "ارتباط اسناد با پرونده‌ها", ok: orphan.stdout.trim() === "0", detail: orphan.stdout.trim() === "0" ? "بدون رکورد یتیم" : `${orphan.stdout.trim()} سند بدون پرونده` });
    const files = await countFiles(path.join(work, path.basename(storageRoot())));
    checks.push({ name: "فایل‌های اسناد", ok: files === manifest.storageFiles, detail: `${files} فایل از ${manifest.storageFiles}` });
  } catch (e) {
    checks.push({ name: "اجرای آزمون بازیابی", ok: false, detail: e instanceof Error ? e.message.slice(0, 300) : "خطای نامشخص" });
  } finally {
    if (created) await run("psql", [pgUrl("postgres"), "-c", `DROP DATABASE IF EXISTS "${scratch}"`], { maxBuffer: MAXBUF }).catch(() => {});
    await fs.rm(work, { recursive: true, force: true });
  }
  const ok = checks.every((c) => c.ok);
  await db.backupRecord.update({ where: { id }, data: { status: ok ? "VERIFIED" : "FAILED", verifiedAt: ok ? new Date() : null, note: checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`).join("\n") } });
  await audit({ actorId, action: "backup.verified", entityType: "Backup", entityId: id, entityLabel: rec.fileName, meta: { ok, checks } });
  return { ok, checks };
}

export async function backupFilePath(id: string) {
  const rec = await db.backupRecord.findUnique({ where: { id } });
  if (!rec) throw new AppError("پشتیبان یافت نشد.", "NOT_FOUND", 404);
  return { rec, file: path.join(backupDir(), rec.fileName) };
}
