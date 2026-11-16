// رمزنگاری اسرار ذخیره‌شده در پایگاه داده (کلید API ارائه‌دهنده هوش مصنوعی، توکن اتصال‌ها).
// AES-256-GCM با کلیدی که از APP_SECRET با HKDF مشتق می‌شود؛ متن رمز هرگز به مرورگر فرستاده نمی‌شود.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const VERSION = "v1";
const MIN_APP_SECRET_LENGTH = 32;
const KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const HINT_VISIBLE_CHARS = 4;

function deriveKey(): Buffer {
  const secret = process.env.APP_SECRET ?? "";
  if (secret.length < MIN_APP_SECRET_LENGTH || secret.startsWith("CHANGE_ME")) {
    throw new Error("APP_SECRET تنظیم نشده یا کوتاه است؛ ذخیره امن اسرار ممکن نیست.");
  }
  return Buffer.from(hkdfSync("sha256", secret, "daftar", "secret-store-v1", KEY_BYTES));
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, data] = blob.split(":");
  if (v !== VERSION || !iv || !tag || !data) throw new Error("قالب کلید ذخیره‌شده نامعتبر است.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("کلید ذخیره‌شده با APP_SECRET فعلی قابل بازگشایی نیست؛ کلید را دوباره وارد کنید.");
  }
}

/** نمایش امن: فقط چند نویسه آخر */
export function secretHint(plain: string): string {
  const t = plain.trim();
  return t.length <= HINT_VISIBLE_CHARS ? "••••" : `••••${t.slice(t.length - HINT_VISIBLE_CHARS)}`;
}
