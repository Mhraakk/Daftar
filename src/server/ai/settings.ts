// ذخیره تنظیمات هوش مصنوعی: کلید API فقط رمزنگاری‌شده نگهداری و هرگز در تاریخچه یا پاسخ ثبت نمی‌شود.
import type { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/guard";
import { AI_SETTING_KEY, getAiSettings, isExternalProvider, type aiSettingsSchema, type AiSettings } from "./config";
import { encryptSecret, secretHint } from "./secret";
import { testConnection, type ConnectionTest } from "./provider";

export async function saveAiSettings(input: z.infer<typeof aiSettingsSchema>, actor: SessionUser): Promise<void> {
  const prev = await getAiSettings();
  const { apiKey, clearApiKey, ...rest } = input;
  const newKey = apiKey?.trim();
  const keyFields: Pick<AiSettings, "apiKeyEnc" | "apiKeyHint"> = newKey
    ? { apiKeyEnc: encryptSecret(newKey), apiKeyHint: secretHint(newKey) }
    : { apiKeyEnc: clearApiKey ? null : prev.apiKeyEnc, apiKeyHint: clearApiKey ? null : prev.apiKeyHint };
  // فیلد ارسال‌نشده (ویژه ارائه‌دهنده‌ای که اکنون انتخاب نیست) مقدار ذخیره‌شده را نگه می‌دارد
  const sent = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Partial<AiSettings>;
  const next: AiSettings = { ...prev, ...sent, ...keyFields };
  await db.setting.upsert({ where: { key: AI_SETTING_KEY }, create: { key: AI_SETTING_KEY, value: { ...next }, updatedById: actor.id }, update: { value: { ...next }, updatedById: actor.id } });
  await audit({
    actorId: actor.id, action: "ai.settings_updated", entityType: "Setting", entityId: AI_SETTING_KEY, entityLabel: "تنظیمات هوش مصنوعی",
    meta: {
      enabled: next.enabled, provider: next.provider, model: next.model, baseUrl: next.baseUrl, external: isExternalProvider(next),
      keyChanged: !!newKey || !!clearApiKey, allowConfidential: next.allowConfidential, concurrency: next.concurrency,
    },
  });
}

export async function runConnectionTest(actor: SessionUser): Promise<ConnectionTest> {
  const s = await getAiSettings();
  const r = await testConnection(s);
  await audit({ actorId: actor.id, action: "ai.connection_tested", entityType: "Setting", entityId: AI_SETTING_KEY, meta: { ok: r.ok, provider: s.provider, model: r.model ?? s.model, latencyMs: r.latencyMs, error: r.error ?? null } });
  return r;
}
