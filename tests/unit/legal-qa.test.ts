/* eslint-disable ts-patterns/no-magic-numbers -- assertions compare against literal expected values */
// پرسش حقوقی از منابع دفتر: بازیابی (BM25، ریشه‌یابی، برتری ماده نام‌برده، RRF، تکه‌کردن)، سنجش عدد و مدت، سنجش پاسخ مدل
// و پیکربندی ارائه‌دهنده از متغیرهای محیطی (LLM_*).
import { describe, expect, it } from "vitest";
import { aiSettingsFields } from "@/app/(app)/admin/ai/fields";
import { DEFAULT_AI, envAiConfig, publicAiSettings, withEnv } from "@/server/ai/config";
import { periodsIn, unsupportedFigures } from "@/server/ai/grounding";
import { checkLegalAnswer, NOT_FOUND, sourcesBlock, type QaSource } from "@/server/ai/legal-qa";
import { renderAiMarkdown } from "@/server/ai/markdown";
import { articleRefsIn, bm25, chunkText, cosine, fuseRanks, stem, tokenize } from "@/server/ai/retrieval";

// متن ماده ۳۳۶ ق.آ.د.م همان‌گونه که در کتابخانه دفتر واردشده است
const A336 = "مهلت درخواست تجدیدنظر اصحاب دعوا، برای اشخاص مقیم ایران بیست روز و برای اشخاص مقیم خارج از کشور دو ماه از تاریخ ابلاغ یا انقضای مدت واخواهی است.";
const src = (id: string, title: string, text: string): QaSource => ({ id, kind: "law", refId: id, kindLabel: "قانون", title, text, href: "#", status: "VALID", verified: false });
const S1 = src("S1", "ماده 336 قانون آیین دادرسی مدنی", A336);
const S2 = src("S2", "ماده 306 قانون آیین دادرسی مدنی", "مهلت واخواهی از احکام غیابی برای کسانی که مقیم کشورند بیست روز و برای کسانی که خارج از کشور اقامت دارند دو ماه از تاریخ ابلاغ واقعی خواهد بود.");

describe("واژه‌سازی و ریشه‌یابی", () => {
  it("پسوندها فقط وقتی برداشته می‌شوند که ریشه کافی بماند", () => {
    expect(stem("تجدیدنظرخواهی")).toBe("تجدیدنظر");
    expect(stem("دادگاهها")).toBe("دادگاه");
    expect(stem("قانونی")).toBe("قانون");
    expect(stem("واخواهی")).toBe("واخواه");
    expect(stem("بدوی")).toBe("بدوی");
    expect(stem("تنها")).toBe("تنها");
  });
  it("نیم‌فاصله، ی/ک عربی و واژه‌های پربسامد", () => {
    expect(tokenize("مهلت تجديدنظرخواهي از رأي دادگاه‌ها چقدر است؟")).toEqual(["مهلت", "تجدیدنظر", "رای", "دادگاه"]);
  });
  it("شماره مواد نام‌برده با ارقام فارسی", () => {
    expect(articleRefsIn("طبق ماده ۳۳۶ و ماده 5 قانون")).toEqual(["336", "5"]);
  });
});

describe("رتبه‌بندی BM25", () => {
  const passages = [
    { key: "a", text: "مهلت درخواست تجدیدنظر بیست روز است", articleNo: "336" },
    { key: "b", text: "دادگاه رسیدگی به دعوای تجدیدنظر را در وقت مقرر انجام می‌دهد", articleNo: "350" },
    { key: "c", text: "هزینه دادرسی را خواهان می‌پردازد", articleNo: "502" },
  ];
  it("متن با واژه‌های مشترک بیشتر بالاتر است و متن بی‌ربط نامزد نمی‌شود", () => {
    const r = bm25("مهلت تجدیدنظرخواهی چند روز است؟", passages);
    expect(r.map((x) => x.key)).toEqual(["a"]);
  });
  it("ماده نام‌برده در پرسش اول می‌آید حتی بی واژه مشترک", () => {
    expect(bm25("ماده ۵۰۲ چه می‌گوید؟", passages)[0].key).toBe("c");
  });
  it("پرسشی که با هیچ متنی دو واژه مشترک ندارد نتیجه‌ای ندارد", () => {
    expect(bm25("هزینه پرواز به کیش چقدر است؟", passages)).toEqual([]);
  });
});

describe("ادغام رتبه‌ها، شباهت و تکه‌کردن", () => {
  it("Reciprocal Rank Fusion", () => {
    expect(fuseRanks([["a", "b", "c"], ["c", "a", "b"]])).toEqual(["a", "c", "b"]);
  });
  it("شباهت کسینوسی", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
  it("متن کوتاه یک تکه است؛ متن بلند روی مرز جمله با هم‌پوشانی تکه می‌شود", () => {
    expect(chunkText(A336)).toEqual([A336]);
    const long = Array.from({ length: 60 }, (_, i) => `جمله شماره ${i + 1} درباره مهلت و ابلاغ است.`).join(" ");
    const chunks = chunkText(long, 300, 60);
    expect(chunks.length).toBeGreaterThan(3);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(300 + 60 + 1));
    expect(chunks.join(" ")).toContain("جمله شماره 60 ");
    expect(chunks[1].startsWith(chunks[0].slice(-20).trim().split(" ").at(-1) ?? "")).toBe(false);
    expect(chunks[1]).toContain(chunks[0].slice(-15).trim());
  });
});

describe("مدت‌ها و عددهای بی‌پشتوانه", () => {
  it("مدت با حروف و با رقم یکسان سنجیده می‌شود", () => {
    expect(periodsIn(A336)).toEqual(["20 روز", "2 ماه"]);
    expect(periodsIn("ظرف بیست و یک روز")).toEqual(["21 روز"]);
    expect(periodsIn("مهلت ۱۰ روزه")).toEqual(["10 روز"]);
    expect(periodsIn("هر دو بیست روز است")).toEqual(["20 روز"]);
  });
  it("مدتی که در منبع نیست کنار می‌رود و مدت درست پذیرفته است", () => {
    expect(unsupportedFigures("مهلت ۲۰ روز است", A336)).toEqual([]);
    expect(unsupportedFigures("مهلت سی روز است", A336)).toEqual(["30 روز"]);
    expect(unsupportedFigures("مبلغ ۵۰۰٬۰۰۰ ریال", A336)).toEqual(["500000"]);
  });
});

describe("سنجش پاسخ پرسش حقوقی", () => {
  const sources = [S1, S2];
  it("مستند: هر بند برچسب منبع موجود دارد و مدت و ماده در همان منبع است", () => {
    const g = checkLegalAnswer("مهلت درخواست تجدیدنظر برای اشخاص مقیم ایران بیست روز از تاریخ ابلاغ است [S1].\nبرای مقیمان خارج از کشور دو ماه است (ماده ۳۳۶). [S۱]", sources);
    expect(g).toMatchObject({ status: "grounded", cited: ["S1"], untagged: 0, articles: [], figures: [] });
  });
  it("برچسب با ویرگول فارسی و سطر جداگانه برچسب", () => {
    const g = checkLegalAnswer("مهلت واخواهی و تجدیدنظر هر دو بیست روز است\n[S1، S2]", sources);
    expect(g).toMatchObject({ status: "grounded", cited: ["S1", "S2"], claims: 1 });
  });
  it("پیدا نشد: فقط جمله نبودِ پاسخ", () => {
    expect(checkLegalAnswer(`${NOT_FOUND}.`, sources).status).toBe("not_found");
    expect(checkLegalAnswer(`${NOT_FOUND}.\nاین جواب پیش‌نویس است و وکیل باید تأیید کند.`, sources).status).toBe("not_found");
  });
  it("مردود: بند بدون منبع", () => {
    expect(checkLegalAnswer("مهلت تجدیدنظر بیست روز است.", sources)).toMatchObject({ status: "rejected", untagged: 1, cited: [] });
  });
  it("پاسخ واقعی Qwen2.5-1.5B در آزمون زنده («۲ ماه» بی برچسب): مردود به دلیل نبودِ ارجاع", () => {
    expect(checkLegalAnswer("۲ ماه", sources)).toMatchObject({ status: "rejected", claims: 1, untagged: 1, cited: [], figures: [], articles: [] });
    expect(checkLegalAnswer("۲ ماه [S1]", sources)).toMatchObject({ status: "grounded", claims: 1, cited: ["S1"] });
  });
  it("مردود: برچسب منبع ناموجود", () => {
    expect(checkLegalAnswer("مهلت تجدیدنظر بیست روز است [S9]", sources)).toMatchObject({ status: "rejected", unknown: ["S9"] });
  });
  it("مردود: ماده یا مدتی که در منبع ارجاع‌شده نیست", () => {
    expect(checkLegalAnswer("طبق ماده ۳۴۹ مهلت تجدیدنظر بیست روز است [S1]", sources)).toMatchObject({ status: "rejected", articles: ["ماده 349"] });
    expect(checkLegalAnswer("مهلت تجدیدنظر سی روز از تاریخ ابلاغ است [S1]", sources)).toMatchObject({ status: "rejected", figures: ["30 روز"] });
    // مدت ماده ۳۰۶ به ماده ۳۳۶ نسبت داده نمی‌شود اگر فقط S1 ارجاع شده باشد
    expect(checkLegalAnswer("مهلت تجدیدنظر بیست روز است و تبصره دارد [S1]", sources)).toMatchObject({ status: "rejected", articles: ["تبصره"] });
  });
  it("پاسخ‌های واقعی Qwen2.5-7B: واژه درهم هشدار می‌گیرد و پاسخ بی بند قابل‌سنجش مردود است", () => {
    expect(checkLegalAnswer(" Mehلت درخواست تجدیدنظر برای اشخاص مقیم ایران بیست روز است [S1].", sources)).toMatchObject({ status: "grounded", garbled: ["Mehلت"] });
    expect(checkLegalAnswer("دو ماه [S1].", sources)).toMatchObject({ status: "grounded", garbled: [] });
    expect(checkLegalAnswer("دva ماه [S1].", sources)).toMatchObject({ status: "rejected", claims: 0, garbled: ["دva"] });
    expect(checkLegalAnswer("طبق API دفتر مهلت بیست روز است[S1]", sources).garbled).toEqual([]);
  });
  it("جهت بند از اکثریت حروف: بند فارسیِ آغازشده با واژه درهم راست‌به‌چپ می‌ماند", () => {
    expect(renderAiMarkdown("Mehلت درخواست تجدیدنظر بیست روز است [S1].")).toContain('<p dir="rtl">');
    expect(renderAiMarkdown("The skill reviews contracts and flags risky clauses.")).toContain('<p dir="ltr">');
    // Two list items with their own direction: matches '<li dir="rtl">مورد نخست</li>\n<li dir="ltr">second item</li>'; rejects both items rtl.
    // https://regex101.com/?regex=%3Cli%20dir%3D%22rtl%22%3E%D9%85%D9%88%D8%B1%D8%AF%20%D9%86%D8%AE%D8%B3%D8%AA%3C%5C%2Fli%3E%5Cs*%3Cli%20dir%3D%22ltr%22%3Esecond%20item%3C%5C%2Fli%3E&flavor=javascript
    expect(renderAiMarkdown("- مورد نخست\n- second item")).toMatch(/<li dir="rtl">مورد نخست<\/li>\s*<li dir="ltr">second item<\/li>/);
  });
  it("بلوک منابع: شناسه، نوع، عنوان و وضعیت", () => {
    const block = sourcesBlock([S1]);
    expect(block).toContain('<source id="S1" kind="قانون" title="ماده 336 قانون آیین دادرسی مدنی" status="معتبر">');
    expect(block).toContain(A336);
  });
});

describe("پیکربندی ارائه‌دهنده از متغیرهای محیطی", () => {
  const env = { LLM_PROVIDER: "hf", LLM_BASE_URL: "https://router.huggingface.co/v1", LLM_MODEL: "Qwen/Qwen3.8-27B", LLM_API_KEY: "hf_test_secret_1234", LLM_EMBEDDING_MODEL: "MCINext/Hakim", LLM_TIMEOUT_MS: "30000" };
  it("بدون نشانی یا مدل، پیکربندی محیطی در کار نیست", () => {
    expect(envAiConfig({})).toBeNull();
    expect(envAiConfig({ LLM_BASE_URL: "http://x/v1" })).toBeNull();
  });
  it("برچسب ارائه‌دهنده، سقف زمان و مدل امبدینگ", () => {
    expect(envAiConfig(env)).toMatchObject({ provider: "openai_compatible", label: "hf", timeoutSec: 30, embeddingModel: "MCINext/Hakim" });
    expect(envAiConfig({ ...env, LLM_PROVIDER: "anthropic" })?.provider).toBe("anthropic");
    expect(envAiConfig({ ...env, LLM_TIMEOUT_MS: "1000" })?.timeoutSec).toBe(30);
    expect(envAiConfig({ ...env, LLM_TIMEOUT_MS: "99999999" })?.timeoutSec).toBe(7200);
    expect(envAiConfig({ ...env, LLM_TIMEOUT_MS: "" })?.timeoutSec).toBeNull();
  });
  it("پیکربندی محیط روی تنظیمات ذخیره‌شده می‌نشیند و کلید به مرورگر نمی‌رسد", () => {
    const s = withEnv({ ...DEFAULT_AI, apiKeyEnc: "stored-cipher", enabled: true }, envAiConfig(env));
    expect(s).toMatchObject({ source: "env", envProvider: "hf", provider: "openai_compatible", baseUrl: env.LLM_BASE_URL, model: env.LLM_MODEL, apiKeyEnc: null, enabled: true });
    expect(s.apiKeyHint).not.toContain("hf_test_secret");
    expect(JSON.stringify(publicAiSettings(s))).not.toContain("hf_test_secret_1234");
    expect(JSON.stringify(publicAiSettings(s))).not.toContain("stored-cipher");
  });
  it("فرم تنظیمات با پیکربندی محیط: فیلدهای اتصال قفل‌اند", () => {
    const names = (provider: "anthropic" | "openai_compatible") => aiSettingsFields({ hasApiKey: true, apiKeyHint: "…1234" }, { provider }).map((f) => f.name);
    ["provider", "model", "baseUrl", "apiKey", "clearApiKey"].forEach((n) => expect(names("openai_compatible")).not.toContain(n));
    expect(names("openai_compatible")).toEqual(expect.arrayContaining(["temperature", "embeddingModel"]));
    expect(names("openai_compatible")).not.toContain("effort");
    expect(names("anthropic")).toEqual(expect.arrayContaining(["effort", "refusalFallback"]));
    expect(aiSettingsFields({ hasApiKey: false, apiKeyHint: null }, { provider: "openai_compatible" }).every((f) => !f.showIf)).toBe(true);
  });
});
