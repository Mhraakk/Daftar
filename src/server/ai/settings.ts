// ذخیره تنظیمات هوش مصنوعی: کلید API فقط رمزنگاری‌شده نگهداری و هرگز در تاریخچه یا پاسخ ثبت نمی‌شود. وقتی ارائه‌دهنده
// از متغیرهای محیطی سرور (LLM_*) خوانده می‌شود، ارائه‌دهنده، نشانی، مدل و کلید فرم نادیده گرفته می‌شوند و کلید محیط هرگز
// در پایگاه داده نوشته نمی‌شود؛ بقیه تنظیمات (فعال بودن، سقف‌ها، سیاست داده) همچنان از همین فرم ذخیره می‌شوند.
import type { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/guard";
import { AI_SETTING_KEY, envAiConfig, getAiSettings, getStoredAiSettings, isExternalProvider, withEnv, type aiSettingsSchema, type AiSettings } from "./config";
import { encryptSecret, secretHint } from "./secret";
import { testConnection, type ConnectionTest } from "./provider";

/** فیلدهایی که با پیکربندی محیط از فرم پذیرفته نمی‌شوند */
const ENV_LOCKED = new Set(["provider", "baseUrl", "model"]);
/** فیلدهای محاسبه‌شده که ذخیره نمی‌شوند */
const TRANSIENT = new Set(["source", "envProvider"]);

export async function saveAiSettings(input: z.infer<typeof aiSettingsSchema>, actor: SessionUser): Promise<void> {
  const prev = await getStoredAiSettings();
  const env = envAiConfig();
  const { apiKey, clearApiKey, ...rest } = input;
  const newKey = env ? undefined : apiKey?.trim();
  const clear = !env && !!clearApiKey;
  const keyFields: Pick<AiSettings, "apiKeyEnc" | "apiKeyHint"> = newKey
    ? { apiKeyEnc: encryptSecret(newKey), apiKeyHint: secretHint(newKey) }
    : { apiKeyEnc: clear ? null : prev.apiKeyEnc, apiKeyHint: clear ? null : prev.apiKeyHint };
  // فیلد ارسال‌نشده (ویژه ارائه‌دهنده‌ای که اکنون انتخاب نیست) مقدار ذخیره‌شده را نگه می‌دارد
  const sent = Object.fromEntries(Object.entries(rest).filter(([k, v]) => v !== undefined && !(env && ENV_LOCKED.has(k)))) as Partial<AiSettings>;
  const next: AiSettings = { ...prev, ...sent, ...keyFields };
  const value = Object.fromEntries(Object.entries(next).filter(([k]) => !TRANSIENT.has(k)));
  await db.setting.upsert({ where: { key: AI_SETTING_KEY }, create: { key: AI_SETTING_KEY, value, updatedById: actor.id }, update: { value, updatedById: actor.id } });
  const effective = withEnv(next, env);
  await audit({
    actorId: actor.id, action: "ai.settings_updated", entityType: "Setting", entityId: AI_SETTING_KEY, entityLabel: "تنظیمات هوش مصنوعی",
    meta: {
      enabled: effective.enabled, provider: effective.provider, model: effective.model, baseUrl: effective.baseUrl, external: isExternalProvider(effective),
      source: effective.source, keyChanged: !!newKey || clear, allowConfidential: effective.allowConfidential, concurrency: effective.concurrency,
    },
  });
}

export async function runConnectionTest(actor: SessionUser): Promise<ConnectionTest> {
  const s = await getAiSettings();
  const r = await testConnection(s);
  await audit({ actorId: actor.id, action: "ai.connection_tested", entityType: "Setting", entityId: AI_SETTING_KEY, meta: { ok: r.ok, provider: s.provider, model: r.model ?? s.model, latencyMs: r.latencyMs, error: r.error ?? null, source: s.source } });
  return r;
}
