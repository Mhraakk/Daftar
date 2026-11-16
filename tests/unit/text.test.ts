import { describe, expect, it } from "vitest";
import { faNum, isValidLegalId, isValidMobile, isValidNationalId, normalizeFa, toEnDigits, toFaDigits } from "@/lib/text";

describe("متن فارسی", () => {
  it("تبدیل ارقام", () => {
    expect(toEnDigits("۱۲۳٤٥٦")).toBe("123456");
    expect(toFaDigits("P-1405-00012")).toBe("P-۱۴۰۵-۰۰۰۱۲");
    expect(faNum(1234567)).toBe("۱,۲۳۴,۵۶۷");
  });
  it("نرمال‌سازی: ی/ک عربی، اعراب، نیم‌فاصله، همزه و ارقام", () => {
    expect(normalizeFa("كتابِ عليٌ")).toBe(normalizeFa("کتاب علی"));
    expect(normalizeFa("می‌شود")).toBe("می شود");
    expect(normalizeFa("مسئول")).toBe(normalizeFa("مسؤل".replace("ؤ", "ئو")));
    expect(normalizeFa("پرونده ۱۴۰۵")).toBe("پرونده 1405");
    expect(normalizeFa("آیین‌نامهٔ اجرايي")).toBe("ایین نامه اجرایی");
    expect(normalizeFa(null)).toBe("");
  });
  it("کد ملی", () => {
    expect(isValidNationalId("0499370899")).toBe(true);
    expect(isValidNationalId("۰۴۹۹۳۷۰۸۹۹")).toBe(true);
    expect(isValidNationalId("0499370898")).toBe(false);
    expect(isValidNationalId("1111111111")).toBe(false);
    expect(isValidNationalId("12345")).toBe(false);
  });
  it("شناسه ملی اشخاص حقوقی و تلفن همراه", () => {
    expect(isValidLegalId("10380284790")).toBe(true);
    expect(isValidLegalId("10380284791")).toBe(false);
    expect(isValidMobile("09121234567")).toBe(true);
    expect(isValidMobile("9121234567")).toBe(false);
  });
});
