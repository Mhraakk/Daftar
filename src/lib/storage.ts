// ذخیره‌سازی فایل با رابط مستقل از درایور (محلی در MVP؛ قابل انتقال به S3)
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { AppError } from "./errors";

export interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

class LocalDriver implements StorageDriver {
  constructor(private root: string) {}
  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new AppError("مسیر فایل نامعتبر است.");
    return full;
  }
  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data, { flag: "wx" });
  }
  get(key: string) { return fs.readFile(this.resolve(key)); }
  async exists(key: string) { return fs.access(this.resolve(key)).then(() => true, () => false); }
  async remove(key: string) { await fs.rm(this.resolve(key), { force: true }); }
}

export const storageRoot = () => path.resolve(process.env.STORAGE_DIR ?? "./storage");
export const storage: StorageDriver = new LocalDriver(storageRoot());

export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export function newStorageKey(prefix: string, ext: string): string {
  const d = new Date();
  return `${prefix}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}${ext}`;
}

// ───────── اعتبارسنجی فایل بر پایه امضای محتوا (نه فقط پسوند) ─────────
interface Kind { ext: string[]; mime: string; test: (b: Buffer) => boolean }
const startsWith = (b: Buffer, sig: number[], off = 0) => sig.every((x, i) => b[off + i] === x);
const isZip = (b: Buffer) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]);
const isOle = (b: Buffer) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0]);
const isText = (b: Buffer) => !b.subarray(0, 4096).includes(0);

const KINDS: Kind[] = [
  { ext: [".pdf"], mime: "application/pdf", test: (b) => b.subarray(0, 1024).includes("%PDF-") },
  { ext: [".docx"], mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", test: isZip },
  { ext: [".xlsx"], mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", test: isZip },
  { ext: [".pptx"], mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", test: isZip },
  { ext: [".doc"], mime: "application/msword", test: isOle },
  { ext: [".xls"], mime: "application/vnd.ms-excel", test: isOle },
  { ext: [".jpg", ".jpeg"], mime: "image/jpeg", test: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { ext: [".png"], mime: "image/png", test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) },
  { ext: [".tif", ".tiff"], mime: "image/tiff", test: (b) => startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a]) },
  { ext: [".webp"], mime: "image/webp", test: (b) => b.subarray(8, 12).toString() === "WEBP" },
  { ext: [".txt"], mime: "text/plain; charset=utf-8", test: isText },
  { ext: [".csv"], mime: "text/csv; charset=utf-8", test: isText },
  { ext: [".rtf"], mime: "application/rtf", test: (b) => b.subarray(0, 5).toString() === "{\\rtf" },
  { ext: [".odt"], mime: "application/vnd.oasis.opendocument.text", test: isZip },
];

export const ALLOWED_EXTENSIONS = KINDS.flatMap((k) => k.ext);

export function maxUploadBytes(): number {
  return Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;
}

export function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").trim();
  return base.slice(0, 180) || "file";
}

/** نوع فایل را از پسوند و امضای محتوا تعیین می‌کند؛ در ناسازگاری خطا می‌دهد. */
export function validateUpload(fileName: string, data: Buffer): { mime: string; ext: string } {
  if (data.length === 0) throw new AppError("فایل خالی است.");
  if (data.length > maxUploadBytes()) {
    throw new AppError(`حجم فایل بیش از حد مجاز (${process.env.MAX_UPLOAD_MB ?? 25} مگابایت) است.`);
  }
  const ext = path.extname(fileName).toLowerCase();
  const kind = KINDS.find((k) => k.ext.includes(ext));
  if (!kind) throw new AppError(`نوع فایل «${ext || "بدون پسوند"}» مجاز نیست.`);
  if (!kind.test(data)) throw new AppError("محتوای فایل با پسوند آن هم‌خوانی ندارد.");
  return { mime: kind.mime, ext };
}
