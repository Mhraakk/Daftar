// استخراج متن برای نمایه‌سازی: PDF / DOCX / متن ساده؛ OCR فارسی با tesseract در صورت نصب بودن روی سرور.
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export type TextStatus = "EXTRACTED" | "OCR_DONE" | "OCR_PENDING" | "OCR_UNAVAILABLE" | "NONE" | "FAILED";

let tesseractOk: boolean | null = null;
export async function ocrAvailable(): Promise<boolean> {
  if (tesseractOk !== null) return tesseractOk;
  try {
    const { stdout } = await run("tesseract", ["--list-langs"]);
    tesseractOk = /\bfas\b/.test(stdout);
  } catch { tesseractOk = false; }
  return tesseractOk;
}

const clean = (s: string) => s.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

export async function extractText(data: Buffer, mime: string, ext: string): Promise<{ text: string | null; status: TextStatus }> {
  try {
    if (ext === ".pdf") {
      const { extractText: pdfText } = await import("unpdf");
      const r = await pdfText(new Uint8Array(data), { mergePages: true });
      const text = clean(Array.isArray(r.text) ? r.text.join("\n") : r.text);
      if (text.length >= 40) return { text, status: "EXTRACTED" };
      return { text: null, status: (await ocrAvailable()) ? "OCR_PENDING" : "OCR_UNAVAILABLE" };
    }
    if (ext === ".docx") {
      const mammoth = await import("mammoth");
      const r = await mammoth.extractRawText({ buffer: data });
      return { text: clean(r.value), status: "EXTRACTED" };
    }
    if (ext === ".txt" || ext === ".csv") return { text: clean(data.toString("utf8")), status: "EXTRACTED" };
    if (mime.startsWith("image/")) return { text: null, status: (await ocrAvailable()) ? "OCR_PENDING" : "OCR_UNAVAILABLE" };
    return { text: null, status: "NONE" };
  } catch (e) {
    console.error("[extract] failed", e);
    return { text: null, status: "FAILED" };
  }
}

/** OCR فارسی+انگلیسی (در worker اجرا می‌شود). برای PDF اسکن‌شده ابتدا صفحات به تصویر تبدیل می‌شوند. */
export async function runOcr(data: Buffer, ext: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "daftar-ocr-"));
  try {
    const src = path.join(dir, `in${ext}`);
    await fs.writeFile(src, data);
    let images = [src];
    if (ext === ".pdf") {
      await run("pdftoppm", ["-r", "200", "-png", "-l", "30", src, path.join(dir, "pg")], { timeout: 180_000 });
      images = (await fs.readdir(dir)).filter((f) => f.startsWith("pg") && f.endsWith(".png")).sort().map((f) => path.join(dir, f));
    }
    const parts: string[] = [];
    for (const img of images) {
      const { stdout } = await run("tesseract", [img, "stdout", "-l", "fas+eng", "--psm", "3"], { timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
      parts.push(stdout);
    }
    return clean(parts.join("\n\n"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
