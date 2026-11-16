/* eslint-disable ts-patterns/no-magic-numbers -- test fixture: HTTP status codes and token counts are the data under test */
// سرورهای آزمایشی محلی که پروتکل واقعی دو ارائه‌دهنده را پیاده می‌کنند (SSE پیام‌های Anthropic و Chat Completions
// سازگار با OpenAI) تا آداپتورها بدون اینترنت و بدون کلید واقعی آزموده شوند. این‌ها فقط در آزمون استفاده می‌شوند.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface Captured { path: string; headers: IncomingMessage["headers"]; body: Record<string, unknown> }
export type Responder = (req: Captured, res: ServerResponse) => void;

export interface Stub {
  url: string;
  requests: Captured[];
  respond: (fn: Responder) => void;
  close: () => Promise<void>;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve());
    req.on("error", reject);
  });
  return Buffer.concat(chunks).toString("utf8");
}

/** برش متن به قطعه‌های هم‌اندازه (آخرین قطعه ممکن است کوتاه‌تر باشد) */
export const chunk = (text: string, size: number): string[] =>
  text ? Array.from({ length: Math.ceil(text.length / size) }, (_, i) => text.slice(i * size, (i + 1) * size)) : [""];

export async function startStub(initial: Responder): Promise<Stub> {
  let responder = initial;
  const requests: Captured[] = [];
  const server: Server = createServer((req, res) => {
    void (async () => {
      const raw = await readBody(req);
      const cap: Captured = { path: req.url ?? "", headers: req.headers, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} };
      requests.push(cap);
      responder(cap, res);
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    respond: (fn) => { responder = fn; },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** پاسخ جریانی سازگار با OpenAI؛ بخش‌ها عمداً در مرزهای نامنظم بریده می‌شوند */
export function openAiStream(text: string, opts: { model?: string; usage?: boolean; finish?: string; splitAt?: number } = {}): Responder {
  return (_req, res) => {
    const pieces = chunk(text, 7);
    const events = [
      ...pieces.map((p) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", model: opts.model ?? "stub-model", choices: [{ index: 0, delta: { content: p }, finish_reason: null }] })}\n\n`),
      `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", model: opts.model ?? "stub-model", choices: [{ index: 0, delta: {}, finish_reason: opts.finish ?? "stop" }] })}\n\n`,
      ...(opts.usage === false ? [] : [`data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", model: opts.model ?? "stub-model", choices: [], usage: { prompt_tokens: 321, completion_tokens: 45 } })}\n\n`]),
      "data: [DONE]\n\n",
    ].join("");
    res.writeHead(200, { "content-type": "text/event-stream" });
    const at = opts.splitAt ?? 13;
    const parts = chunk(events, at);
    parts.forEach((p) => res.write(p));
    res.end();
  };
}

/** پاسخ جریانی رویدادهای Messages API */
export function anthropicStream(text: string, opts: { model?: string; stopReason?: string } = {}): Responder {
  return (_req, res) => {
    const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
    const pieces = chunk(text, 5);
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(ev("message_start", { message: { id: "msg_stub", type: "message", role: "assistant", model: opts.model ?? "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 200, output_tokens: 1, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 } } }));
    res.write(ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }));
    pieces.forEach((p) => res.write(ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: p } })));
    res.write(ev("content_block_stop", { index: 0 }));
    res.write(ev("message_delta", { delta: { stop_reason: opts.stopReason ?? "end_turn", stop_sequence: null }, usage: { output_tokens: 42 } }));
    res.write(ev("message_stop", {}));
    res.end();
  };
}

export function jsonError(status: number, message: string, type = "error"): Responder {
  return (_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type, message } }));
  };
}
