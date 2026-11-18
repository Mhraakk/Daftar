// فیلدهای فرم تنظیمات هوش مصنوعی. جدا از صفحه نگه داشته شده تا آزمون بسنجد داده‌ای که فرم برای هر ارائه‌دهنده
// می‌فرستد (فقط فیلدهای نمایان) از طرح‌واره ذخیره می‌گذرد؛ فیلدهای ویژه یک ارائه‌دهنده برای دیگری ارسال نمی‌شوند.
import type { FieldDef } from "@/components/ui/smart-form";
import { EFFORTS } from "@/server/ai/config";

// eslint-disable-next-line ts-patterns/no-magic-numbers -- FieldDef.span needs the literal type 2
const FULL = 2 as const;
const NOTE_ROWS = 3;

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude) — API رسمی" },
  { value: "openai_compatible", label: "سازگار با OpenAI (Ollama / llama.cpp / vLLM / LM Studio)" },
];
const ROLES = [
  { value: "nonlawyer_with_attorney", label: "غیرحقوق‌دان با دسترسی به وکیل/مشاور" },
  { value: "lawyer", label: "وکیل / حقوق‌دان دارای پروانه" },
  { value: "nonlawyer_without_attorney", label: "غیرحقوق‌دان بدون دسترسی به وکیل" },
];

/** راهنمای کلید API: کلید ثبت‌شده هرگز نمایش داده نمی‌شود، فقط چند نویسه پایانی آن */
const keyHint = (key: { hasApiKey: boolean; apiKeyHint: string | null }): string => (key.hasApiKey
  ? `کلید ثبت‌شده: ${key.apiKeyHint ?? "••••"} — برای تغییر، کلید تازه وارد کنید`
  : "برای مدل محلی بدون کلید، خالی بگذارید");

export function aiSettingsFields(key: { hasApiKey: boolean; apiKeyHint: string | null }): FieldDef[] {
  return [
    { name: "enabled", label: "هوش مصنوعی در دفتر فعال باشد", type: "checkbox", span: FULL },
    { name: "provider", label: "نوع ارائه‌دهنده", type: "select", required: true, options: PROVIDERS },
    { name: "model", label: "نام مدل", required: true, ltr: true, hint: "مثلاً claude-opus-5-5 یا qwen2.5:7b-instruct" },
    { name: "baseUrl", label: "نشانی سرور", required: true, ltr: true, span: FULL, hint: "Anthropic: https://api.anthropic.com — Ollama: http://192.168.1.50:11434/v1 — llama.cpp: http://<host>:8080/v1" },
    { name: "apiKey", label: "کلید API", type: "password", ltr: true, hint: keyHint(key) },
    { name: "clearApiKey", label: "حذف کلید ثبت‌شده", type: "checkbox" },
    { name: "effort", label: "سطح تلاش مدل (Claude)", type: "select", options: EFFORTS.map((e) => ({ value: e, label: e })), showIf: { field: "provider", equals: "anthropic" } },
    { name: "refusalFallback", label: "در صورت امتناع، اجرای خودکار روی مدل جایگزین (server-side fallback)", type: "checkbox", showIf: { field: "provider", equals: "anthropic" } },
    { name: "temperature", label: "دمای نمونه‌برداری", type: "number", showIf: { field: "provider", equals: "openai_compatible" }, hint: "برای متن حقوقی مقدار کم (۰ تا ۰٫۳) مناسب است" },
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
