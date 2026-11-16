// آداپتور API رسمی Anthropic (Messages API) با SDK رسمی @anthropic-ai/sdk.
// پاسخ جریانی است (برای خروجی‌های طولانی و جلوگیری از پایان زمان HTTP)، تفکر سازگار (adaptive) پیش‌فرض مدل
// باقی می‌ماند، سطح تلاش از تنظیمات می‌آید و در صورت امتناع مدل، بازگشت سمت سرور به مدل جایگزین فعال است.
import Anthropic from "@anthropic-ai/sdk";
import type { Effort } from "./config";
import { AiProviderError, type AiErrorKind, type AiProvider, type AiRequest, type AiResult, type StreamOptions } from "./types";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const SDK_MAX_RETRIES = 2;
const MS_PER_SEC = 1_000;
const MAX_DETAIL = 300;

/** خانواده‌هایی که output_config.effort را می‌پذیرند (مدل‌های قدیمی‌تر با این پارامتر خطا می‌دهند) */
const EFFORT_MODEL_PREFIXES = [
  "claude-fable-", "claude-mythos-", "claude-opus-5", "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-opus-4-5",
  "claude-sonnet-5", "claude-sonnet-4-6", "claude-haiku-5",
];

export interface AnthropicConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxOutputTokens: number;
  effort: Effort;
  refusalFallback: boolean;
  timeoutSec: number;
}

export const supportsEffort = (model: string): boolean => EFFORT_MODEL_PREFIXES.some((p) => model.startsWith(p));

/** نگاشت خطاهای نوع‌دار SDK به خطای مشترک؛ ترتیب از خاص به عام است */
const ERROR_MAP: [new (...args: never[]) => Error, AiErrorKind, boolean][] = [
  [Anthropic.APIUserAbortError, "canceled", false],
  [Anthropic.AuthenticationError, "auth", false],
  [Anthropic.PermissionDeniedError, "permission", false],
  [Anthropic.NotFoundError, "not_found", false],
  [Anthropic.RateLimitError, "rate_limit", true],
  [Anthropic.ContentTooLargeError, "too_large", false],
  [Anthropic.BadRequestError, "bad_request", false],
  [Anthropic.UnprocessableEntityError, "bad_request", false],
  [Anthropic.OverloadedError, "overloaded", true],
  [Anthropic.APIConnectionTimeoutError, "timeout", true],
  [Anthropic.APIConnectionError, "network", true],
  [Anthropic.InternalServerError, "server", true],
];

export function toAiError(e: unknown): AiProviderError {
  if (e instanceof AiProviderError) return e;
  const hit = ERROR_MAP.find(([cls]) => e instanceof cls);
  const status = e instanceof Anthropic.APIError ? e.status : undefined;
  const detail = e instanceof Error ? e.message.slice(0, MAX_DETAIL) : undefined;
  if (hit) return new AiProviderError(hit[1], hit[2], detail, status ?? undefined);
  if (e instanceof Anthropic.APIError) return new AiProviderError("server", true, detail, status ?? undefined);
  return new AiProviderError("network", true, detail);
}
const textOf = (content: Anthropic.Beta.Messages.BetaContentBlock[]): string =>
  content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");

export function anthropicProvider(cfg: AnthropicConfig): AiProvider {
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl || undefined,
    timeout: cfg.timeoutSec * MS_PER_SEC,
    maxRetries: SDK_MAX_RETRIES,
  });

  return {
    id: "anthropic",
    model: cfg.model,
    async stream(req: AiRequest, opts: StreamOptions = {}): Promise<AiResult> {
      const params: Anthropic.Beta.Messages.MessageCreateParamsStreaming = {
        model: cfg.model,
        max_tokens: req.maxTokens ?? cfg.maxOutputTokens,
        system: req.system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        // پیشوند ثابت (دستورالعمل، نمایه دفتر و متن مهارت) در اجرای بعدی از حافظه نهان خوانده می‌شود
        cache_control: { type: "ephemeral" },
        stream: true,
        ...(supportsEffort(cfg.model) ? { output_config: { effort: cfg.effort } } : {}),
        ...(cfg.refusalFallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
      };
      try {
        const stream = client.beta.messages.stream(params, { signal: opts.signal });
        stream.on("text", (delta) => opts.onText?.(delta));
        const final = await stream.finalMessage();
        const u = final.usage;
        return {
          text: textOf(final.content),
          model: final.model,
          stopReason: final.stop_reason ?? null,
          inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
          outputTokens: u.output_tokens ?? null,
        };
      } catch (e) {
        throw toAiError(e);
      }
    },
  };
}
