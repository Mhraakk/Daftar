// قرارداد مشترک ارائه‌دهندگان هوش مصنوعی: هر ارائه‌دهنده پاسخ را جریانی (stream) تولید می‌کند تا
// صف کار بتواند متن جزئی را ذخیره، لغو را اعمال و زمان‌سنج را کنترل کند.

export type AiProviderId = "anthropic" | "openai_compatible";

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiRequest {
  system: string;
  messages: AiMessage[];
  /** سقف توکن خروجی این درخواست؛ در نبود آن از تنظیمات استفاده می‌شود */
  maxTokens?: number;
}

export interface AiResult {
  text: string;
  /** مدلی که واقعاً پاسخ داده است (ممکن است در صورت امتناع، مدل جایگزین باشد) */
  model: string;
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface StreamOptions {
  signal?: AbortSignal;
  onText?: (delta: string) => void;
}

export interface AiProvider {
  id: AiProviderId;
  model: string;
  stream(req: AiRequest, opts?: StreamOptions): Promise<AiResult>;
}

export type AiErrorKind =
  | "auth" | "permission" | "not_found" | "bad_request" | "rate_limit" | "overloaded"
  | "server" | "network" | "timeout" | "canceled" | "refusal" | "too_large" | "config";

const MESSAGES: Record<AiErrorKind, string> = {
  auth: "کلید API نامعتبر است یا پذیرفته نشد.",
  permission: "این کلید اجازه استفاده از مدل یا قابلیت درخواستی را ندارد.",
  not_found: "مدل یا نشانی ارائه‌دهنده یافت نشد؛ نام مدل و نشانی را بررسی کنید.",
  bad_request: "درخواست توسط ارائه‌دهنده رد شد.",
  rate_limit: "سقف درخواست‌های ارائه‌دهنده پر شده است؛ کمی بعد دوباره تلاش می‌شود.",
  overloaded: "ارائه‌دهنده موقتاً پرمشغله است.",
  server: "خطای سرور ارائه‌دهنده.",
  network: "اتصال به ارائه‌دهنده برقرار نشد (شبکه، نشانی یا خاموش بودن سرور مدل).",
  timeout: "زمان پاسخ‌گویی ارائه‌دهنده به پایان رسید.",
  canceled: "اجرا لغو شد.",
  refusal: "مدل از پاسخ به این درخواست امتناع کرد.",
  too_large: "حجم ورودی از ظرفیت مدل بیشتر است؛ اسناد کمتری انتخاب کنید.",
  config: "پیکربندی هوش مصنوعی کامل نیست.",
};

export class AiProviderError extends Error {
  constructor(
    public kind: AiErrorKind,
    public retryable: boolean,
    public detail?: string,
    public status?: number,
  ) {
    super(detail ? `${MESSAGES[kind]} (${detail})` : MESSAGES[kind]);
    this.name = "AiProviderError";
  }
}
