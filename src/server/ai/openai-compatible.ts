// آداپتور سرورهای سازگار با OpenAI Chat Completions (Ollama، llama.cpp، vLLM، LM Studio یا درگاه سازمانی).
// مناسب مدل محلی روی شبکه داخلی دفتر: بدون خروج داده از دفتر و بدون وابستگی به اینترنت.
import { AiProviderError, type AiErrorKind, type AiProvider, type AiRequest, type AiResult, type StreamOptions } from "./types";

const MS_PER_SEC = 1_000;
const MAX_DETAIL = 300;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_TOO_MANY = 429;
const HTTP_SERVER = 500;
const HTTP_OVERLOADED = 503;
const DATA_PREFIX = "data:";
const DONE = "[DONE]";

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  maxOutputTokens: number;
  temperature: number;
  timeoutSec: number;
}

interface ChunkChoice { delta?: { content?: string | null }; finish_reason?: string | null }
interface Chunk {
  model?: string;
  choices?: ChunkChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { message?: string } | string;
}

const STATUS_KIND: Record<number, [AiErrorKind, boolean]> = {
  [HTTP_UNAUTHORIZED]: ["auth", false],
  [HTTP_FORBIDDEN]: ["permission", false],
  [HTTP_NOT_FOUND]: ["not_found", false],
  [HTTP_PAYLOAD_TOO_LARGE]: ["too_large", false],
  [HTTP_TOO_MANY]: ["rate_limit", true],
  [HTTP_OVERLOADED]: ["overloaded", true],
};

function statusError(status: number, body: string): AiProviderError {
  const [kind, retryable] = STATUS_KIND[status] ?? (status >= HTTP_SERVER ? ["server", true] : ["bad_request", false]);
  return new AiProviderError(kind, retryable, body.slice(0, MAX_DETAIL) || `HTTP ${status}`, status);
}

const trimTrailingSlashes = (url: string): string => (url.endsWith("/") ? trimTrailingSlashes(url.slice(0, -1)) : url);
const chatUrl = (baseUrl: string): string => `${trimTrailingSlashes(baseUrl)}/chat/completions`;

interface Accumulator { text: string; model: string | null; finish: string | null; inTok: number | null; outTok: number | null }
interface LineResult { acc: Accumulator; delta: string | null; done: boolean }

function applyChunk(acc: Accumulator, chunk: Chunk): LineResult {
  if (chunk.error) {
    const msg = typeof chunk.error === "string" ? chunk.error : chunk.error.message ?? "stream error";
    throw new AiProviderError("server", true, msg.slice(0, MAX_DETAIL));
  }
  const choice = chunk.choices?.[0];
  const delta = choice?.delta?.content || null;
  return {
    acc: {
      text: delta ? acc.text + delta : acc.text,
      model: chunk.model || acc.model,
      finish: choice?.finish_reason || acc.finish,
      inTok: chunk.usage?.prompt_tokens ?? acc.inTok,
      outTok: chunk.usage?.completion_tokens ?? acc.outTok,
    },
    delta,
    done: false,
  };
}

/** یک خط «data:» از جریان SSE؛ خطوط خالی، توضیح و «event:» بی‌اثرند */
function handleLine(acc: Accumulator, line: string): LineResult {
  const t = line.trim();
  const idle: LineResult = { acc, delta: null, done: false };
  if (!t.startsWith(DATA_PREFIX)) return idle;
  const payload = t.slice(DATA_PREFIX.length).trim();
  if (payload === DONE) return { ...idle, done: true };
  if (!payload) return idle;
  try {
    return applyChunk(acc, JSON.parse(payload) as Chunk);
  } catch (e) {
    if (e instanceof AiProviderError) throw e;
    return idle;
  }
}

async function readSse(body: ReadableStream<Uint8Array>, onText?: (d: string) => void): Promise<Accumulator> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const pump = async (acc: Accumulator, buffer: string): Promise<Accumulator> => {
    const { done: end, value } = await reader.read();
    const lines = (buffer + (end ? decoder.decode() : decoder.decode(value, { stream: true }))).split("\n");
    const rest = end ? "" : lines.pop() ?? "";
    const step = lines.reduce<LineResult>((prev, line) => {
      if (prev.done) return prev;
      const r = handleLine(prev.acc, line);
      if (r.delta) onText?.(r.delta);
      return r;
    }, { acc, delta: null, done: false });
    return end || step.done ? step.acc : pump(step.acc, rest);
  };
  try {
    return await pump({ text: "", model: null, finish: null, inTok: null, outTok: null }, "");
  } finally {
    reader.releaseLock();
  }
}

export function openAiCompatibleProvider(cfg: OpenAiCompatibleConfig): AiProvider {
  const post = (body: object, signal: AbortSignal): Promise<Response> =>
    fetch(chatUrl(cfg.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify(body),
      signal,
    });

  return {
    id: "openai_compatible",
    model: cfg.model,
    async stream(req: AiRequest, opts: StreamOptions = {}): Promise<AiResult> {
      const timeout = AbortSignal.timeout(cfg.timeoutSec * MS_PER_SEC);
      const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
      const base = {
        model: cfg.model,
        messages: [{ role: "system", content: req.system }, ...req.messages.map((m) => ({ role: m.role, content: m.content }))],
        max_tokens: req.maxTokens ?? cfg.maxOutputTokens,
        temperature: cfg.temperature,
        stream: true,
      };
      try {
        let res = await post({ ...base, stream_options: { include_usage: true } }, signal);
        if (!res.ok && res.status < HTTP_SERVER && res.status !== HTTP_UNAUTHORIZED && res.status !== HTTP_NOT_FOUND) {
          const text = await res.text();
          // برخی سرورها stream_options را نمی‌شناسند؛ یک بار بدون آن تلاش می‌شود
          if (!text.includes("stream_options")) throw statusError(res.status, text);
          res = await post(base, signal);
        }
        if (!res.ok) throw statusError(res.status, await res.text());
        if (!res.body) throw new AiProviderError("server", true, "empty body");
        const acc = await readSse(res.body, opts.onText);
        return { text: acc.text, model: acc.model ?? cfg.model, stopReason: acc.finish, inputTokens: acc.inTok, outputTokens: acc.outTok };
      } catch (e) {
        if (e instanceof AiProviderError) throw e;
        if (opts.signal?.aborted) throw new AiProviderError("canceled", false);
        if (timeout.aborted) throw new AiProviderError("timeout", true);
        const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : "";
        throw new AiProviderError("network", true, `${e instanceof Error ? e.message : String(e)} ${cause}`.trim().slice(0, MAX_DETAIL));
      }
    },
  };
}
