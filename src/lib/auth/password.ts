import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;
const N = 32768, r = 8, p = 1, KEYLEN = 64;

/** هش رمز عبور با scrypt (N=2^15) — قالب: scrypt$N$r$p$salt$hash */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r, p, maxmem: 128 * N * r * 2 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, rr, pp, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, {
    N: Number(n), r: Number(rr), p: Number(pp), maxmem: 128 * Number(n) * Number(rr) * 2,
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 8) return "رمز عبور باید دست‌کم ۸ نویسه باشد.";
  if (!/[A-Za-z؀-ۿ]/.test(pw) || !/\d|[۰-۹]/.test(pw)) return "رمز عبور باید شامل حرف و رقم باشد.";
  return null;
}
