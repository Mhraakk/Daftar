// وضعیت قابل‌نمایش یک کار هوش مصنوعی (برای صفحه نتیجه و نظرسنجی زنده)
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/guard";
import { getJobForUser, getQueueState, type JobMeta } from "./jobs";
import { renderAiMarkdown } from "./markdown";

export interface JobSnapshot {
  id: string;
  kind: string;
  title: string | null;
  status: string;
  html: string;
  error: string | null;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  createdAt: string;
  startedAt: string | null;
  attempts: number;
  queueAhead: number;
  workerAlive: boolean;
  truncated: boolean;
  retryAt: string | null;
}

/** پاسخ این کارها داده JSON است، نه متن؛ به‌صورت بلوک کد چپ‌به‌راست نمایش داده می‌شود تا جهت متن آن را به هم نریزد */
const JSON_KINDS = new Set(["assistant.dates", "petition.body"]);
// Code-fence lines the model may already have written around its JSON: matches "```json" and "```", rejects "[{".
// https://regex101.com/?regex=%5E%60%60%60%5Cw*%5Cs*%24&testString=%60%60%60json&flavor=javascript&flags=gm
const FENCE_LINE = /^```\w*\s*$/gm;
// A source tag in rendered HTML: matches "[S1]" and "[S1، S3]"; rejects "[1]".
// https://regex101.com/?regex=%5C%5B%5B%5E%5C%5B%5C%5D%3C%3E%5D*%3FS%5Cs*%5Cd%2B%5B%5E%5C%5B%5C%5D%3C%3E%5D*%5C%5D&testString=%5BS1%D8%8C%20S3%5D&flavor=javascript&flags=gi
const SOURCE_TAG = /\[[^[\]<>]*?S\s*\d+[^[\]<>]*\]/gi;
// One source id inside a tag: matches "S1" and "S 12"; rejects "1".
// https://regex101.com/?regex=S%5Cs*%28%5Cd%2B%29&testString=%5BS1%D8%8C%20S%2012%5D&flavor=javascript&flags=gi
const SOURCE_ID = /S\s*(\d+)/gi;
/** هر برچسب [S#] پاسخ پرسش حقوقی به نشانِ پیوند منبع همان صفحه تبدیل می‌شود (فقط شناسه عددی؛ متن دیگری وارد HTML نمی‌شود) */
const linkSourceTags = (html: string): string => html.replace(SOURCE_TAG, (tag) => [...tag.matchAll(SOURCE_ID)]
  .map((m) => `<a class="cite-tag" href="#src-S${Number(m[1])}">S${Number(m[1])}</a>`).join(""));
const responseHtml = (kind: string, response: string): string => {
  if (JSON_KINDS.has(kind)) return renderAiMarkdown(`\`\`\`json\n${response.replace(FENCE_LINE, "").trim()}\n\`\`\``);
  return kind === "assistant.legal_qa" ? linkSourceTags(renderAiMarkdown(response)) : renderAiMarkdown(response);
};

export async function jobSnapshot(id: string, user: SessionUser): Promise<JobSnapshot> {
  const job = await getJobForUser(id, user);
  const meta = (job.meta ?? {}) as JobMeta;
  const [queue, ahead] = await Promise.all([
    getQueueState(),
    job.status === "QUEUED" ? db.aiInteraction.count({ where: { status: "QUEUED", createdAt: { lt: job.createdAt } } }) : Promise.resolve(0),
  ]);
  return {
    id: job.id, kind: job.kind, title: job.title, status: job.status, html: job.response ? responseHtml(job.kind, job.response) : "",
    error: job.error, provider: job.provider, model: job.model, inputTokens: job.inputTokens, outputTokens: job.outputTokens,
    durationMs: job.durationMs, createdAt: job.createdAt.toISOString(), startedAt: job.startedAt?.toISOString() ?? null, attempts: job.attempts,
    queueAhead: ahead, workerAlive: queue.workerAlive, truncated: meta.truncated === true, retryAt: typeof meta.retryAt === "string" ? meta.retryAt : null,
  };
}
