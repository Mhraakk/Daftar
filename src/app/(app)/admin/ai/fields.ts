// فیلدهای فرم تنظیمات هوش مصنوعی. جدا از صفحه نگه داشته شده تا آزمون بسنجد داده‌ای که فرم برای هر ارائه‌دهنده
// می‌فرستد (فقط فیلدهای نمایان) از طرح‌واره ذخیره می‌گذرد؛ فیلدهای ویژه یک ارائه‌دهنده برای دیگری ارسال نمی‌شوند.
// وقتی ارائه‌دهنده از متغیرهای محیطی سرور (LLM_*) خوانده می‌شود، فیلدهای اتصال (نوع، مدل، نشانی، کلید) در فرم نیستند.
import type { FieldDef } from "@/components/ui/smart-form";
import { EFFORTS } from "@/server/ai/config";
import type { AiProviderId } from "@/server/ai/types";

// eslint-disable-next-line ts-patterns/no-magic-numbers -- FieldDef.span needs the literal type 2
const FULL = 2 as const;
const NOTE_ROWS = 3;

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude) — API رسمی" },
  { value: "openai_compatible", label: "سازگار با OpenAI (Hugging Face، OpenRouter، DeepSeek، Ollama، llama.cpp، vLLM)" },
];
const ROLES = [
  { value: "nonlawyer_with_attorney", label: "غیرحقوق‌دان با دسترسی به وکیل/مشاور" },
  { value: "lawyer", label: "وکیل / حقوق‌دان دارای پروانه" },
  { value: "nonlawyer_without_attorney", label: "غیرحقوق‌دان بدون دسترسی به وکیل" },
];

/** پیکربندی ارائه‌دهنده از متغیرهای محیطی سرور: فیلدهای اتصال قفل‌اند و فقط فیلدهای همین ارائه‌دهنده نمایش داده می‌شوند */
export interface EnvLock { provider: AiProviderId }

/** راهنمای کلید API: کلید ثبت‌شده هرگز نمایش داده نمی‌شود، فقط چند نویسه پایانی آن */
const keyHint = (key: { hasApiKey: boolean; apiKeyHint: string | null }): string => (key.hasApiKey
  ? `کلید ثبت‌شده: ${key.apiKeyHint ?? "••••"} — برای تغییر، کلید تازه وارد کنید`
  : "برای مدل محلی بدون کلید، خالی بگذارید");

/** فیلد ویژه یک ارائه‌دهنده: در حالت عادی وابسته به انتخاب «نوع ارائه‌دهنده»، با پیکربندی محیط فقط برای همان ارائه‌دهنده */
const forProvider = (provider: AiProviderId, field: FieldDef, env: EnvLock | null): FieldDef[] => {
  if (!env) return [{ ...field, showIf: { field: "provider", equals: provider } }];
  return env.provider === provider ? [field] : [];
};

const connectionFields = (key: { hasApiKey: boolean; apiKeyHint: string | null }): FieldDef[] => [
  { name: "provider", label: "نوع ارائه‌دهنده", type: "select", required: true, options: PROVIDERS },
  {
    name: "model", label: "نام مدل", required: true, ltr: true,
    hint: "مثلاً claude-opus-5-5 (Anthropic)، Qwen/Qwen3.8-27B (Hugging Face)، qwen/qwen3.8-27b (OpenRouter) یا qwen2.5:7b-instruct (Ollama)؛ شناسه دقیق را از فهرست مدل‌های همان ارائه‌دهنده بردارید",
  },
  {
    name: "baseUrl", label: "نشانی سرور", required: true, ltr: true, span: FULL,
    hint: "Anthropic: https://api.anthropic.com — Hugging Face: https://router.huggingface.co/v1 — OpenRouter: https://openrouter.ai/api/v1 — DeepSeek: https://api.deepseek.com/v1 — Ollama: http://192.168.1.50:11434/v1 — llama.cpp: http://<host>:8080/v1",
  },
  { name: "apiKey", label: "کلید API", type: "password", ltr: true, hint: keyHint(key) },
  { name: "clearApiKey", label: "حذف کلید ثبت‌شده", type: "checkbox" },
];

export function aiSettingsFields(key: { hasApiKey: boolean; apiKeyHint: string | null }, env: EnvLock | null = null): FieldDef[] {
  return [
    { name: "enabled", label: "هوش مصنوعی در دفتر فعال باشد", type: "checkbox", span: FULL },
    ...(env ? [] : connectionFields(key)),
    ...forProvider("anthropic", { name: "effort", label: "سطح تلاش مدل (Claude)", type: "select", options: EFFORTS.map((e) => ({ value: e, label: e })) }, env),
    ...forProvider("anthropic", { name: "refusalFallback", label: "در صورت امتناع، اجرای خودکار روی مدل جایگزین (server-side fallback)", type: "checkbox" }, env),
    ...forProvider("openai_compatible", { name: "temperature", label: "دمای نمونه‌برداری", type: "number", hint: "برای متن حقوقی مقدار کم (۰ تا ۰٫۳) مناسب است" }, env),
    ...forProvider("openai_compatible", {
      name: "embeddingModel", label: "مدل امبدینگ (اختیاری)", ltr: true,
      hint: "برای مرتب‌سازی معنایی منابع در «پرسش حقوقی از منابع دفتر»؛ سرور باید مسیر ‎/embeddings‎ داشته باشد (مثلاً MCINext/Hakim اگر ارائه‌دهنده عرضه کند). خالی = فقط جست‌وجوی واژگانی",
    }, env),
    { name: "maxOutputTokens", label: "سقف توکن خروجی", type: "number", required: true },
    { name: "contextWindow", label: "ظرفیت ورودی مدل (توکن)", type: "number", required: true, hint: "برای مدل محلی ۸۱۹۲ تا ۳۲۷۶۸؛ برای Claude تا ۱٬۰۰۰٬۰۰۰" },
    { name: "timeoutSec", label: "سقف زمان هر اجرا (ثانیه)", type: "number", required: true },
    { name: "concurrency", label: "اجرای هم‌زمان", type: "number", required: true, hint: "برای مدل محلی روی یک سرور، ۱" },
    { name: "allowConfidential", label: "ارسال اسناد محرمانه به ارائه‌دهنده بیرون از شبکه مجاز است", type: "checkbox", span: FULL },
    { name: "practiceRole", label: "نقش کاربران در نمایه مهارت‌ها", type: "select", required: true, options: ROLES },
    { name: "attorneyContact", label: "مرجع بررسی حقوقی دفتر", placeholder: "مثلاً: آقای ... مشاور حقوقی دفتر" },
    { name: "officeNotes", label: "توضیحات افزوده به نمایه دفتر", type: "textarea", rows: NOTE_ROWS, span: FULL, hint: "این متن در «نمایه تمرین» همه مهارت‌ها قرار می‌گیرد؛ اطلاعات شخصی ننویسید." },
  ];
}
