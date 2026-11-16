import { describe, expect, it } from "vitest";
import { sanitizeFileName, validateUpload } from "@/lib/storage";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/auth/password";

describe("اعتبارسنجی فایل", () => {
  it("نوع را از محتوا تأیید می‌کند", () => {
    expect(validateUpload("a.pdf", Buffer.from("%PDF-1.7 ...")).mime).toBe("application/pdf");
    expect(validateUpload("a.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2])).ext).toBe(".png");
    expect(validateUpload("یادداشت.txt", Buffer.from("سلام")).mime).toContain("text/plain");
  });
  it("ناسازگاری محتوا و پسوند، پسوند غیرمجاز و فایل خالی را رد می‌کند", () => {
    expect(() => validateUpload("a.pdf", Buffer.from("MZ\x90\x00"))).toThrow("هم‌خوانی ندارد");
    expect(() => validateUpload("a.exe", Buffer.from("MZ"))).toThrow("مجاز نیست");
    expect(() => validateUpload("a.html", Buffer.from("<script>"))).toThrow("مجاز نیست");
    expect(() => validateUpload("a.txt", Buffer.alloc(0))).toThrow("خالی");
    expect(() => validateUpload("a.txt", Buffer.from([0x41, 0x00, 0x42]))).toThrow("هم‌خوانی ندارد");
  });
  it("نام فایل را ایمن می‌کند", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName('a<b>:"c".pdf')).toBe("a_b___c_.pdf");
  });
});

describe("رمز عبور", () => {
  it("هش scrypt و راستی‌آزمایی", async () => {
    const h = await hashPassword("Daftar@1405");
    expect(h.startsWith("scrypt$32768$")).toBe(true);
    expect(h).not.toContain("Daftar");
    expect(await verifyPassword("Daftar@1405", h)).toBe(true);
    expect(await verifyPassword("daftar@1405", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
  it("حداقل پیچیدگی", () => {
    expect(validatePasswordStrength("short1")).not.toBeNull();
    expect(validatePasswordStrength("onlyletters")).not.toBeNull();
    expect(validatePasswordStrength("Good1234")).toBeNull();
  });
});
