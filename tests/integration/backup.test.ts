// آزمون واقعی پشتیبان‌گیری و بازیابی: تهیه پشتیبان، بازیابی در پایگاه داده جداگانه و مقایسه رکوردها و فایل‌ها.
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { backupDir, createBackup, verifyBackup } from "@/server/backup";
import { prisma } from "./helpers";

afterAll(() => prisma.$disconnect());

describe("پشتیبان‌گیری و بازیابی", () => {
  let id = "", fileName = "";
  it("پشتیبان کامل تهیه و ثبت می‌شود", async () => {
    const b = await createBackup("MANUAL", null, "آزمون خودکار");
    id = b.id; fileName = b.fileName;
    expect(b.size).toBeGreaterThan(1000);
    expect((await fs.stat(path.join(backupDir(), fileName))).size).toBe(b.size);
  });
  it("بازیابی در پایگاه داده موقت با داده‌های جاری مطابقت دارد", async () => {
    const before = await prisma.client.count();
    const v = await verifyBackup(id, null);
    expect(v.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`).join("\n")).not.toContain("✗");
    expect(v.ok).toBe(true);
    expect(v.checks).toHaveLength(5);
    expect(await prisma.client.count()).toBe(before); // داده‌های جاری دست‌نخورده
    const left = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_database WHERE datname LIKE 'daftar_verify_%'`;
    expect(Number(left[0].n)).toBe(0); // پایگاه داده موقت پاک شده
    expect((await prisma.backupRecord.findUniqueOrThrow({ where: { id } })).status).toBe("VERIFIED");
  });
  it("دستکاری فایل پشتیبان تشخیص داده می‌شود", async () => {
    const b = await createBackup("MANUAL", null, "آزمون خرابی");
    const f = path.join(backupDir(), b.fileName);
    const buf = await fs.readFile(f);
    buf[Math.floor(buf.length / 2)] ^= 0xff;
    await fs.writeFile(f, buf);
    const v = await verifyBackup(b.id, null);
    expect(v.ok).toBe(false);
    expect(v.checks[0].ok).toBe(false);
    await fs.rm(f, { force: true });
    await prisma.backupRecord.delete({ where: { id: b.id } });
  });
});
