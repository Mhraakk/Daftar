/* eslint-disable ts-patterns/no-magic-numbers -- assertions compare against literal expected values */
// لایه هوش مصنوعی: رمزنگاری کلید، تشخیص شبکه داخلی، خواندن مهارت‌ها، فهرست بررسی قرارداد، تجزیه پیشنهاد مهلت
// و دو آداپتور ارائه‌دهنده در برابر سرورهای آزمایشی محلی با پروتکل واقعی.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anthropicProvider } from "@/server/ai/anthropic";
import { parseDateSuggestions } from "@/server/ai/assistant";
import { isExternalProvider, isPrivateHost } from "@/server/ai/config";
import { openAiCompatibleProvider } from "@/server/ai/openai-compatible";
import { contractPreflight, preflightMarkdown } from "@/server/ai/preflight";
import { decryptSecret, encryptSecret, secretHint } from "@/server/ai/secret";
import { modeOf, parseFrontmatter, readSkillText, scanVendoredSkills } from "@/server/ai/skill-catalog";
import { AiProviderError } from "@/server/ai/types";
import { anthropicStream, jsonError, openAiStream, startStub, type Stub } from "../helpers/ai-stub";

describe("رمزنگاری کلید API", () => {
  it("رفت و برگشت، تشخیص دست‌کاری و نمایش امن", () => {
    const blob = encryptSecret("sk-test-1234567890");
    expect(blob.startsWith("v1:")).toBe(true);
    expect(blob).not.toContain("1234567890");
    expect(decryptSecret(blob)).toBe("sk-test-1234567890");
    expect(encryptSecret("x")).not.toBe(encryptSecret("x")); // IV تصادفی
    const [v, iv, tag, data] = blob.split(":");
    const tampered = [v, iv, tag, Buffer.from("AAAA" + data).toString("base64")].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
    expect(secretHint("sk-test-1234567890")).toBe("••••7890");
  });
});

describe("تشخیص ارائه‌دهنده داخل شبکه", () => {
  it.each([
    ["localhost", true], ["127.0.0.1", true], ["10.2.3.4", true], ["192.168.1.100", true], ["172.16.0.5", true], ["172.31.255.1", true],
    ["172.32.0.1", false], ["8.8.8.8", false], ["api.anthropic.com", false], ["llm.local", true], ["[::1]", true], ["fd12::1", true], ["host.docker.internal", true],
  ])("%s → داخلی=%s", (host, priv) => expect(isPrivateHost(host)).toBe(priv));
  it("Anthropic همیشه بیرونی است؛ Ollama روی LAN داخلی", () => {
    expect(isExternalProvider({ provider: "anthropic", baseUrl: "http://127.0.0.1:1" })).toBe(true);
    expect(isExternalProvider({ provider: "openai_compatible", baseUrl: "http://192.168.1.50:11434/v1" })).toBe(false);
    expect(isExternalProvider({ provider: "openai_compatible", baseUrl: "https://gateway.example.com/v1" })).toBe(true);
  });
});

describe("کتابخانه مهارت‌ها", () => {
  it("frontmatter: مقدار ساده، نقل‌قول‌دار و بلوک «>»", () => {
    const { data, body } = parseFrontmatter("---\nname: nda-review\ndescription: >\n  Reference: fast triage\n  of NDAs.\nargument-hint: \"[file]\"\nuser-invocable: false\n---\n# Body\ntext");
    expect(data.name).toBe("nda-review");
    expect(data.description).toBe("Reference: fast triage of NDAs.");
    expect(data["argument-hint"]).toBe("[file]");
    expect(data["user-invocable"]).toBe("false");
    expect(body.startsWith("# Body")).toBe(true);
  });
  it("هر دو مخزن با مجوز و اثر انگشت خوانده می‌شوند", () => {
    const all = scanVendoredSkills();
    expect(all.length).toBe(152);
    const cr = all.find((s) => s.slug === "claude-legal-skill.contract-review")!;
    expect(cr.license).toBe("MIT");
    expect(cr.version).toBe("3.0.0");
    expect(cr.origin).toContain("github.com/evolsb/claude-legal-skill");
    const plr = all.find((s) => s.slug === "litigation-legal.privilege-log-review")!;
    expect(plr.license).toBe("Apache-2.0");
    expect(plr.argumentHint).toBe("[log file, or document set]");
    expect(modeOf(plr)).toBe("RUN");
    expect(modeOf(all.find((s) => s.slug === "commercial-legal.nda-review")!)).toBe("REFERENCE");
    expect(modeOf(all.find((s) => s.slug === "commercial-legal.cold-start-interview")!)).toBe("AGENT_ONLY");
    expect(modeOf(all.find((s) => s.slug === "cocounsel-legal.deep-research")!)).toBe("AGENT_ONLY");
    const text = readSkillText({ path: cr.relPath, sha256: cr.sha256, slug: cr.slug });
    expect(text).toContain("## Step 1: Pre-Review Checklist");
    expect(() => readSkillText({ path: cr.relPath, sha256: "0".repeat(64), slug: cr.slug })).toThrow("همگام‌سازی");
    expect(() => readSkillText({ path: "../../package.json", sha256: cr.sha256, slug: "x" })).toThrow();
  });
});

const CONTRACT = `قرارداد اجاره
ماده ۱ - طرفین قرارداد
موجر: آقای حسن کریمی و مستأجر: ............
ماده ۲ - موضوع: یک واحد آپارتمان مطابق پیوست شماره ۱
ماده ۳ - مبلغ اجاره ماهانه [مبلغ] ریال و ودیعه TBD
ماده ۵ - در صورت تأخیر، وجه التزام روزانه معادل یک درصد مبلغ قرارداد پرداخت می‌شود.
ماده ۶ - مستأجر با اسقاط کافه خیارات حتی خیار غبن فاحش قرارداد را پذیرفت.
ماده ۷ - حل اختلاف از طریق داوری داور مرضی‌الطرفین است و مرجع حل اختلاف دادگاه صالح تهران خواهد بود.
ماده ۸ - موجر می‌تواند به تشخیص خود قرارداد را فسخ کند.
امضای موجر: ..........          امضای مستأجر: ..........`;

describe("فهرست بررسی پیش از تحلیل قرارداد (بدون هوش مصنوعی)", () => {
  const r = contractPreflight(CONTRACT);
  it("جاهای خالی، پیوست گمشده، ماده جاافتاده و وضعیت امضا", () => {
    expect(r.documentType).toBe("اجاره‌نامه");
    expect(r.blanks.map((b) => b.line)).toEqual(expect.arrayContaining([3, 5, 10]));
    expect(r.exhibits).toEqual([{ label: "پیوست 1", firstLine: 4, found: false }]);
    expect(r.completeness.join(" ")).toContain("4");
    expect(r.signature.status).toBe("BLOCK_EMPTY");
  });
  it("نشانه‌های خطر با شماره سطر", () => {
    const keys = r.redFlags.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["penalty", "waiver_of_options", "arbitration", "jurisdiction", "sole_discretion", "termination"]));
    expect(r.redFlags.find((f) => f.key === "waiver_of_options")!.hits[0].line).toBe(7);
    expect(keys).not.toContain("offshore");
  });
  it("گزارش فارسی شامل بخش‌ها است", () => {
    const md = preflightMarkdown(r, "اجاره‌نامه آزمون");
    expect(md).toContain("پیوست 1 ⚠️ در متن یافت نشد");
    expect(md).toContain("سطر 7");
    expect(md).toContain("بخش امضا دارای جای خالی است");
  });
  it("قرارداد کامل: پیوست موجود و بدون جای خالی", () => {
    const ok = contractPreflight("Article 1 Parties\nSee Exhibit A for prices.\nArticle 2 Term\nThe term is one year.\nExhibit A\nPrice list.\nIN WITNESS WHEREOF the parties signed.\nBy: John Smith");
    expect(ok.exhibits).toEqual([{ label: "exhibit a", firstLine: 2, found: true }]);
    expect(ok.blanks).toHaveLength(0);
    expect(ok.signature.status).toBe("BLOCK_PRESENT");
    expect(ok.completeness).toHaveLength(0);
  });
});

describe("تجزیه پیشنهاد مهلت از پاسخ مدل", () => {
  it("JSON درون متن/کد، تاریخ نامعتبر و نوع ناشناخته", () => {
    const out = parseDateSuggestions("نتیجه:\n```json\n[{\"date\":\"۱۴۰۵/۰۲/۱۵\",\"type\":\"HEARING\",\"title\":\"جلسه رسیدگی\",\"quote\":\"وقت رسیدگی ۱۴۰۵/۰۲/۱۵\"},{\"date\":\"1405/13/40\",\"type\":\"HEARING\",\"title\":\"نامعتبر\"},{\"date\":\"1405/1/9\",\"type\":\"WHATEVER\",\"title\":\"x\",\"relative\":true}]\n```");
    expect(out).toEqual([
      { date: "1405/02/15", type: "HEARING", title: "جلسه رسیدگی", quote: "وقت رسیدگی ۱۴۰۵/۰۲/۱۵", relative: false },
      { date: "1405/01/09", type: "OTHER", title: "x", quote: "", relative: true },
    ]);
    expect(parseDateSuggestions("no json here")).toEqual([]);
    expect(parseDateSuggestions("[not valid json")).toEqual([]);
  });
});

describe("آداپتور سازگار با OpenAI در برابر سرور آزمایشی", () => {
  let stub: Stub;
  beforeAll(async () => { stub = await startStub(openAiStream("سلام، این پاسخ آزمایشی است.")); });
  afterAll(() => stub.close());
  const provider = () => openAiCompatibleProvider({ baseUrl: `${stub.url}/v1/`, apiKey: "local-key", model: "qwen-test", maxOutputTokens: 512, temperature: 0.1, timeoutSec: 10 });

  it("جریان SSE بریده‌بریده، توکن‌ها و سرآیند مجوز", async () => {
    const deltas: string[] = [];
    const r = await provider().stream({ system: "SYS", messages: [{ role: "user", content: "پرسش" }] }, { onText: (d) => deltas.push(d) });
    expect(r.text).toBe("سلام، این پاسخ آزمایشی است.");
    expect(deltas.join("")).toBe(r.text);
    expect(r).toMatchObject({ model: "stub-model", stopReason: "stop", inputTokens: 321, outputTokens: 45 });
    const req = stub.requests.at(-1)!;
    expect(req.path).toBe("/v1/chat/completions");
    expect(req.headers.authorization).toBe("Bearer local-key");
    expect(req.body).toMatchObject({ model: "qwen-test", max_tokens: 512, temperature: 0.1, stream: true, stream_options: { include_usage: true } });
    expect(req.body.messages).toEqual([{ role: "system", content: "SYS" }, { role: "user", content: "پرسش" }]);
  });
  it("سروری که stream_options را نمی‌شناسد: یک تلاش دوباره بدون آن", async () => {
    let n = 0;
    stub.respond((req, res) => {
      n++;
      if (req.body.stream_options) return jsonError(400, "unknown field stream_options")(req, res);
      return openAiStream("ok", { usage: false })(req, res);
    });
    const r = await provider().stream({ system: "s", messages: [{ role: "user", content: "u" }] });
    expect(r.text).toBe("ok");
    expect(n).toBe(2);
    expect(r.inputTokens).toBeNull();
  });
  it("نگاشت خطا: 401، 404، 503 و قطع اتصال", async () => {
    stub.respond(jsonError(401, "bad key"));
    await expect(provider().stream({ system: "s", messages: [{ role: "user", content: "u" }] })).rejects.toMatchObject({ kind: "auth", retryable: false });
    stub.respond(jsonError(404, "model not found"));
    await expect(provider().stream({ system: "s", messages: [{ role: "user", content: "u" }] })).rejects.toMatchObject({ kind: "not_found" });
    stub.respond(jsonError(503, "loading model"));
    await expect(provider().stream({ system: "s", messages: [{ role: "user", content: "u" }] })).rejects.toMatchObject({ kind: "overloaded", retryable: true });
    const dead = openAiCompatibleProvider({ baseUrl: "http://127.0.0.1:9/v1", apiKey: null, model: "m", maxOutputTokens: 10, temperature: 0, timeoutSec: 5 });
    await expect(dead.stream({ system: "s", messages: [{ role: "user", content: "u" }] })).rejects.toMatchObject({ kind: "network", retryable: true });
  });
  it("لغو کاربر", async () => {
    stub.respond(() => { /* پاسخ نمی‌دهد */ });
    const ctrl = new AbortController();
    const p = provider().stream({ system: "s", messages: [{ role: "user", content: "u" }] }, { signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 100);
    await expect(p).rejects.toMatchObject({ kind: "canceled" });
  });
});

describe("آداپتور Anthropic (SDK رسمی) در برابر سرور آزمایشی", () => {
  let stub: Stub;
  beforeAll(async () => { stub = await startStub(anthropicStream("پاسخ مدل Claude")); });
  afterAll(() => stub.close());
  const provider = (over: Partial<Parameters<typeof anthropicProvider>[0]> = {}) => anthropicProvider({ apiKey: "sk-ant-test", baseUrl: stub.url, model: "claude-opus-5-5", maxOutputTokens: 16000, effort: "high", refusalFallback: true, timeoutSec: 10, ...over });

  it("درخواست: مدل، تلاش، بازگشت سمت سرور، cache و سرآیندها؛ پاسخ جریانی و توکن‌ها", async () => {
    const deltas: string[] = [];
    const r = await provider().stream({ system: "SYSTEM PROMPT", messages: [{ role: "user", content: "سلام" }] }, { onText: (d) => deltas.push(d) });
    expect(r.text).toBe("پاسخ مدل Claude");
    expect(deltas.join("")).toBe(r.text);
    expect(r).toMatchObject({ model: "claude-opus-5-5", stopReason: "end_turn", inputTokens: 250, outputTokens: 42 });
    const req = stub.requests.at(-1)!;
    expect(req.path).toContain("/v1/messages");
    // SDK نسخه 1.8 (API نسخه 2026-10-21) کلید را با Authorization: Bearer می‌فرستد
    expect([req.headers["x-api-key"], req.headers.authorization]).toContain(req.headers["x-api-key"] ? "sk-ant-test" : "Bearer sk-ant-test");
    expect(String(req.headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(req.headers["anthropic-version"]).toBeTruthy();
    expect(req.body).toMatchObject({ model: "claude-opus-5-5", max_tokens: 16000, system: "SYSTEM PROMPT", stream: true, output_config: { effort: "high" }, fallbacks: "default", cache_control: { type: "ephemeral" } });
    expect(req.body).not.toHaveProperty("temperature");
    expect(req.body).not.toHaveProperty("thinking");
  });
  it("مدل قدیمی: effort ارسال نمی‌شود؛ بدون بازگشت: بدون سرآیند beta", async () => {
    await provider({ model: "claude-3-haiku-20240307", refusalFallback: false }).stream({ system: "s", messages: [{ role: "user", content: "u" }] });
    const req = stub.requests.at(-1)!;
    expect(req.body).not.toHaveProperty("output_config");
    expect(req.body).not.toHaveProperty("fallbacks");
    expect(req.headers["anthropic-beta"]).toBeUndefined();
  });
  it("امتناع مدل گزارش می‌شود", async () => {
    stub.respond(anthropicStream("", { stopReason: "refusal" }));
    const r = await provider().stream({ system: "s", messages: [{ role: "user", content: "u" }] });
    expect(r.stopReason).toBe("refusal");
  });
  it("نگاشت خطاهای نوع‌دار SDK", async () => {
    stub.respond(jsonError(401, "invalid x-api-key", "authentication_error"));
    const e1 = await provider().stream({ system: "s", messages: [{ role: "user", content: "u" }] }).catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(AiProviderError);
    expect(e1).toMatchObject({ kind: "auth", retryable: false, status: 401 });
    stub.respond(jsonError(404, "model: claude-x not found", "not_found_error"));
    await expect(provider().stream({ system: "s", messages: [{ role: "user", content: "u" }] })).rejects.toMatchObject({ kind: "not_found" });
  });
});
