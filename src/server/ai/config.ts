// تنظیمات هوش مصنوعی دفتر (کلید تنظیم: «ai»). ارائه‌دهنده قابل تعویض است: API رسمی Anthropic یا هر سرور
// سازگار با OpenAI (Ollama، llama.cpp، vLLM، LM Studio یا درگاه سازمانی). بدون پیکربندی، هیچ خروجی ساختگی تولید نمی‌شود.
import { z } from "zod";
import { db } from "@/lib/db";
import { decryptSecret, secretHint } from "./secret";
import type { AiProviderId } from "./types";

export const AI_SETTING_KEY = "ai";
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";
export const DEFAULT_ANTHROPIC_URL = "https://api.anthropic.com";
const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;
const DEFAULT_CONTEXT_WINDOW = 1_000_000;
const DEFAULT_TIMEOUT_SEC = 900;
const DEFAULT_TEMPERATURE = 0.2;
const MAX_CONCURRENCY = 8;
const MIN_OUTPUT_TOKENS = 256;
const MAX_OUTPUT_TOKENS = 128_000;
const MIN_CONTEXT_WINDOW = 2_048;
const MAX_CONTEXT_WINDOW = 2_000_000;
const MIN_TIMEOUT_SEC = 30;
const MAX_TIMEOUT_SEC = 7_200;
const MAX_TEMPERATURE = 2;
const MAX_URL_LENGTH = 300;
const MAX_MODEL_LENGTH = 120;
const MAX_KEY_LENGTH = 500;
const MAX_CONTACT_LENGTH = 200;
const MAX_NOTES_LENGTH = 4_000;

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export const USER_ROLES = ["lawyer", "nonlawyer_with_attorney", "nonlawyer_without_attorney"] as const;
export type PracticeRole = (typeof USER_ROLES)[number];

export interface AiSettings {
  enabled: boolean;
  provider: AiProviderId;
  baseUrl: string;
  model: string;
  apiKeyEnc: string | null;
  apiKeyHint: string | null;
  maxOutputTokens: number;
  contextWindow: number;
  timeoutSec: number;
  concurrency: number;
  effort: Effort;
  refusalFallback: boolean;
  temperature: number;
  allowConfidential: boolean;
  practiceRole: PracticeRole;
  attorneyContact: string;
  officeNotes: string;
  /** مدل امبدینگ برای مرتب‌سازی دوباره منابع پرسش حقوقی؛ خالی یعنی فقط بازیابی واژگانی */
  embeddingModel: string;
  /** «env»: ارائه‌دهنده، نشانی، مدل و کلید از متغیرهای محیطی سرور (LLM_*) خوانده شده و هرگز ذخیره نمی‌شود */
  source: "db" | "env";
  /** برچسب LLM_PROVIDER (مثلاً hf، openrouter، deepseek) وقتی پیکربندی از محیط است */
  envProvider: string | null;
}

export const DEFAULT_AI: AiSettings = {
  enabled: false,
  provider: "anthropic",
  baseUrl: DEFAULT_ANTHROPIC_URL,
  model: DEFAULT_ANTHROPIC_MODEL,
  apiKeyEnc: null,
  apiKeyHint: null,
  maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  contextWindow: DEFAULT_CONTEXT_WINDOW,
  timeoutSec: DEFAULT_TIMEOUT_SEC,
  concurrency: 1,
  effort: "high",
  refusalFallback: true,
  temperature: DEFAULT_TEMPERATURE,
  allowConfidential: false,
  practiceRole: "nonlawyer_with_attorney",
  attorneyContact: "",
  officeNotes: "",
  embeddingModel: "",
  source: "db",
  envProvider: null,
};

/**
 * فرم ذخیره تنظیمات؛ کلید API فقط هنگام تغییر ارسال می‌شود. فیلدهای ویژه یک ارائه‌دهنده (effort و refusalFallback
 * برای Claude، temperature برای سرور سازگار با OpenAI) فقط وقتی همان ارائه‌دهنده انتخاب شده در فرم نمایش و ارسال
 * می‌شوند؛ نبودنشان یعنی مقدار ذخیره‌شده بماند.
 */
export const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["anthropic", "openai_compatible"]).optional(),
  baseUrl: z.string().trim().url("نشانی معتبر نیست.").max(MAX_URL_LENGTH).optional(),
  model: z.string().trim().min(1, "نام مدل الزامی است.").max(MAX_MODEL_LENGTH).optional(),
  apiKey: z.string().trim().max(MAX_KEY_LENGTH).optional().nullable(),
  clearApiKey: z.boolean().optional(),
  maxOutputTokens: z.coerce.number().int().min(MIN_OUTPUT_TOKENS).max(MAX_OUTPUT_TOKENS),
  contextWindow: z.coerce.number().int().min(MIN_CONTEXT_WINDOW).max(MAX_CONTEXT_WINDOW),
  timeoutSec: z.coerce.number().int().min(MIN_TIMEOUT_SEC).max(MAX_TIMEOUT_SEC),
  concurrency: z.coerce.number().int().min(1).max(MAX_CONCURRENCY),
  effort: z.enum(EFFORTS).optional(),
  refusalFallback: z.boolean().optional(),
  temperature: z.coerce.number().min(0).max(MAX_TEMPERATURE).optional(),
  allowConfidential: z.boolean(),
  practiceRole: z.enum(USER_ROLES),
  attorneyContact: z.string().trim().max(MAX_CONTACT_LENGTH).default(""),
  officeNotes: z.string().trim().max(MAX_NOTES_LENGTH).default(""),
  embeddingModel: z.string().trim().max(MAX_MODEL_LENGTH).optional(),
});

const MS_PER_SEC = 1_000;

/** پیکربندی ارائه‌دهنده از متغیرهای محیطی سرور (ماژول اتصال LLM) */
export interface EnvAiConfig {
  provider: AiProviderId;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  timeoutSec: number | null;
  embeddingModel: string | null;
}

/**
 * LLM_BASE_URL و LLM_MODEL لازم است؛ LLM_PROVIDER برچسب است (hf، openrouter، deepseek، ollama…) و فقط «anthropic» به
 * API رسمی Claude می‌رود. LLM_API_KEY فقط در حافظه سرور می‌ماند و هرگز در پایگاه داده یا پاسخی ذخیره نمی‌شود.
 */
export function envAiConfig(env: Record<string, string | undefined> = process.env): EnvAiConfig | null {
  const baseUrl = env.LLM_BASE_URL?.trim() ?? "";
  const model = env.LLM_MODEL?.trim() ?? "";
  if (!baseUrl || !model) return null;
  const label = env.LLM_PROVIDER?.trim() || "openai_compatible";
  const ms = Number(env.LLM_TIMEOUT_MS ?? "");
  return {
    provider: label === "anthropic" ? "anthropic" : "openai_compatible",
    label,
    baseUrl,
    model,
    apiKey: env.LLM_API_KEY?.trim() || null,
    timeoutSec: Number.isFinite(ms) && ms > 0 ? Math.min(MAX_TIMEOUT_SEC, Math.max(MIN_TIMEOUT_SEC, Math.ceil(ms / MS_PER_SEC))) : null,
    embeddingModel: env.LLM_EMBEDDING_MODEL?.trim() || null,
  };
}

/** تنظیمات ذخیره‌شده با پیکربندی محیط روی آن (اگر تعیین شده باشد) */
export function withEnv(s: AiSettings, env: EnvAiConfig | null): AiSettings {
  if (!env) return { ...s, source: "db", envProvider: null };
  return {
    ...s, provider: env.provider, baseUrl: env.baseUrl, model: env.model, apiKeyEnc: null,
    apiKeyHint: env.apiKey ? secretHint(env.apiKey) : null, timeoutSec: env.timeoutSec ?? s.timeoutSec,
    embeddingModel: env.embeddingModel ?? s.embeddingModel, source: "env", envProvider: env.label,
  };
}

/** فقط مقدارهای ذخیره‌شده در پایگاه داده (برای ذخیره دوباره، بدون پیکربندی محیط) */
export async function getStoredAiSettings(): Promise<AiSettings> {
  const row = await db.setting.findUnique({ where: { key: AI_SETTING_KEY } });
  return { ...DEFAULT_AI, ...((row?.value as Partial<AiSettings> | undefined) ?? {}), source: "db", envProvider: null };
}

/** تنظیمات مؤثر: ذخیره‌شده‌ها، با ارائه‌دهنده و نشانی و مدل و کلید از محیط سرور اگر LLM_* تعیین شده باشد */
export async function getAiSettings(): Promise<AiSettings> {
  return withEnv(await getStoredAiSettings(), envAiConfig());
}

export function apiKeyOf(s: AiSettings): string | null {
  if (s.source === "env") return envAiConfig()?.apiKey ?? null;
  return s.apiKeyEnc ? decryptSecret(s.apiKeyEnc) : null;
}

export const hasApiKey = (s: AiSettings): boolean => (s.source === "env" ? !!envAiConfig()?.apiKey : !!s.apiKeyEnc);

/** نسخه بی‌خطر برای ارسال به مرورگر (بدون متن رمز کلید) */
export function publicAiSettings(s: AiSettings): Omit<AiSettings, "apiKeyEnc"> & { hasApiKey: boolean } {
  const { apiKeyEnc: _secret, ...rest } = s;
  return { ...rest, hasApiKey: hasApiKey(s) };
}

const PRIVATE_NAMES = new Set(["localhost", "host.docker.internal", "::1", "[::1]"]);
const PRIVATE_SUFFIXES = [".local", ".lan", ".internal", ".localhost"];
const IPV4_PARTS = 4;
const OCTET_MAX = 255;
const LOOPBACK = 127;
const CLASS_A_PRIVATE = 10;
const CLASS_B_PRIVATE = 172;
const CLASS_B_LOW = 16;
const CLASS_B_HIGH = 31;
const CLASS_C_FIRST = 192;
const CLASS_C_SECOND = 168;
const LINK_LOCAL_FIRST = 169;
const LINK_LOCAL_SECOND = 254;

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((p) => (p === "" ? Number.NaN : Number(p)));
  if (parts.length !== IPV4_PARTS || parts.some((n) => !Number.isInteger(n) || n < 0 || n > OCTET_MAX)) return false;
  const [a, b] = parts as [number, number, number, number];
  return a === LOOPBACK || a === CLASS_A_PRIVATE
    || (a === CLASS_B_PRIVATE && b >= CLASS_B_LOW && b <= CLASS_B_HIGH)
    || (a === CLASS_C_FIRST && b === CLASS_C_SECOND)
    || (a === LINK_LOCAL_FIRST && b === LINK_LOCAL_SECOND);
}

/** نام میزبان در شبکه داخلی (نشانی خصوصی IPv4، loopback، ULA در IPv6 یا نام محلی) */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (PRIVATE_NAMES.has(host) || PRIVATE_NAMES.has(bare)) return true;
  if (PRIVATE_SUFFIXES.some((suffix) => bare.endsWith(suffix))) return true;
  if (bare.includes(":")) return bare.startsWith("fc") || bare.startsWith("fd") || bare.startsWith("fe80");
  return isPrivateIpv4(bare);
}

/** آیا داده از شبکه داخلی دفتر خارج می‌شود؟ (ارائه‌دهنده ابری = بیرونی) */
export function isExternalProvider(s: Pick<AiSettings, "provider" | "baseUrl">): boolean {
  if (s.provider === "anthropic") return true;
  try {
    return !isPrivateHost(new URL(s.baseUrl).hostname);
  } catch {
    return true;
  }
}

export function isAiReady(s: AiSettings): { ready: boolean; reason?: string } {
  if (!s.enabled) return { ready: false, reason: "هوش مصنوعی در تنظیمات دفتر غیرفعال است." };
  if (s.provider === "anthropic" && !hasApiKey(s)) return { ready: false, reason: "کلید API ارائه‌دهنده ثبت نشده است." };
  if (!s.model) return { ready: false, reason: "نام مدل تعیین نشده است." };
  return { ready: true };
}
