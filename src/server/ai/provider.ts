// انتخاب ارائه‌دهنده بر اساس تنظیمات دفتر و آزمون اتصال.
import { anthropicProvider } from "./anthropic";
import { apiKeyOf, type AiSettings } from "./config";
import { openAiCompatibleProvider } from "./openai-compatible";
import { AiProviderError, type AiProvider } from "./types";

const TEST_MAX_TOKENS = 512;
const TEST_TIMEOUT_SEC = 120;
const MAX_SAMPLE = 200;

export function providerFromSettings(s: AiSettings, overrides: { timeoutSec?: number } = {}): AiProvider {
  const timeoutSec = overrides.timeoutSec ?? s.timeoutSec;
  if (s.provider === "anthropic") {
    const apiKey = apiKeyOf(s);
    if (!apiKey) throw new AiProviderError("config", false, "کلید API ثبت نشده است");
    return anthropicProvider({
      apiKey, baseUrl: s.baseUrl, model: s.model, maxOutputTokens: s.maxOutputTokens,
      effort: s.effort, refusalFallback: s.refusalFallback, timeoutSec,
    });
  }
  return openAiCompatibleProvider({
    baseUrl: s.baseUrl, apiKey: apiKeyOf(s), model: s.model, maxOutputTokens: s.maxOutputTokens,
    temperature: s.temperature, timeoutSec,
  });
}

export interface ConnectionTest {
  ok: boolean;
  model?: string;
  latencyMs: number;
  sample?: string;
  error?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

/** درخواست کوچک واقعی به ارائه‌دهنده؛ هیچ داده‌ای از پرونده‌ها ارسال نمی‌شود */
export async function testConnection(s: AiSettings): Promise<ConnectionTest> {
  const started = Date.now();
  try {
    const provider = providerFromSettings({ ...s, effort: "low" }, { timeoutSec: TEST_TIMEOUT_SEC });
    const r = await provider.stream({
      system: "You are a connectivity check. Reply with the single word: OK",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: TEST_MAX_TOKENS,
    });
    const sample = r.text.trim().slice(0, MAX_SAMPLE);
    return {
      ok: sample.length > 0, model: r.model, latencyMs: Date.now() - started, sample,
      inputTokens: r.inputTokens, outputTokens: r.outputTokens,
      ...(sample.length > 0 ? {} : { error: `پاسخ خالی (stop: ${r.stopReason ?? "?"})` }),
    };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  }
}
