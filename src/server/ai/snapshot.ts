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

export async function jobSnapshot(id: string, user: SessionUser): Promise<JobSnapshot> {
  const job = await getJobForUser(id, user);
  const meta = (job.meta ?? {}) as JobMeta;
  const [queue, ahead] = await Promise.all([
    getQueueState(),
    job.status === "QUEUED" ? db.aiInteraction.count({ where: { status: "QUEUED", createdAt: { lt: job.createdAt } } }) : Promise.resolve(0),
  ]);
  return {
    id: job.id, kind: job.kind, title: job.title, status: job.status, html: job.response ? renderAiMarkdown(job.response) : "",
    error: job.error, provider: job.provider, model: job.model, inputTokens: job.inputTokens, outputTokens: job.outputTokens,
    durationMs: job.durationMs, createdAt: job.createdAt.toISOString(), startedAt: job.startedAt?.toISOString() ?? null, attempts: job.attempts,
    queueAhead: ahead, workerAlive: queue.workerAlive, truncated: meta.truncated === true, retryAt: typeof meta.retryAt === "string" ? meta.retryAt : null,
  };
}
