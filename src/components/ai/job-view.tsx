"use client";
// نمایش زنده کار هوش مصنوعی: وضعیت صف، متن در حال تولید، لغو و نوسازی صفحه پس از پایان.
import { Ban, Clock, Cpu, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Notice } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { faNum, toFaDigits } from "@/lib/text";
import type { JobSnapshot } from "@/server/ai/snapshot";
import { cancelAiJobAction } from "@/app/(app)/skills/actions";

const POLL_MS = 1_500;
const MS_PER_SEC = 1_000;
const ACTIVE = new Set(["QUEUED", "RUNNING"]);

const STATUS: Record<string, { label: string; tone: "info" | "accent" | "success" | "danger" | "neutral" }> = {
  QUEUED: { label: "در صف", tone: "info" },
  RUNNING: { label: "در حال تولید", tone: "accent" },
  DONE: { label: "آماده — نیازمند بررسی", tone: "success" },
  FAILED: { label: "ناموفق", tone: "danger" },
  CANCELED: { label: "لغوشده", tone: "neutral" },
};

const secs = (ms: number): string => toFaDigits(Math.max(0, Math.round(ms / MS_PER_SEC)));

export function JobView({ initial, path, canCancel, showOutput = true }: { initial: JobSnapshot; path: string; canCancel: boolean; showOutput?: boolean }) {
  const router = useRouter();
  const [job, setJob] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const wasActive = useRef(ACTIVE.has(initial.status));

  useEffect(() => setJob(initial), [initial]);

  useEffect(() => {
    if (!ACTIVE.has(job.status)) return;
    const ctrl = new AbortController();
    const timer = setInterval(async () => {
      setNow(Date.now());
      try {
        const res = await fetch(`/api/ai/jobs/${job.id}`, { signal: ctrl.signal, cache: "no-store" });
        if (res.ok) setJob((await res.json()) as JobSnapshot);
      } catch {
        // قطع موقت شبکه: تلاش بعدی
      }
    }, POLL_MS);
    return () => { clearInterval(timer); ctrl.abort(); };
  }, [job.id, job.status]);

  useEffect(() => {
    if (wasActive.current && !ACTIVE.has(job.status)) {
      wasActive.current = false;
      router.refresh();
    }
  }, [job.status, router]);

  const st = STATUS[job.status] ?? { label: job.status, tone: "neutral" as const };
  const started = job.startedAt ? new Date(job.startedAt).getTime() : null;
  const elapsed = started ? now - started : now - new Date(job.createdAt).getTime();

  return (
    <div className="flex flex-col gap-3" data-testid="job-view" data-status={job.status}>
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
        <Seal tone={st.tone} dot>{st.label}</Seal>
        {job.status === "QUEUED" && <span className="flex items-center gap-1"><Clock className="size-4" />{job.queueAhead ? `${toFaDigits(job.queueAhead)} کار جلوتر در صف` : "نفر اول صف"}</span>}
        {job.status === "RUNNING" && <span className="flex items-center gap-1"><Loader2 className="size-4 animate-spin" />{secs(elapsed)} ثانیه</span>}
        <span className="flex items-center gap-1" dir="ltr"><Cpu className="size-4" />{job.model}</span>
        {job.durationMs !== null && !ACTIVE.has(job.status) && <span>زمان: {secs(job.durationMs)} ثانیه</span>}
        {job.inputTokens !== null && <span>ورودی: {faNum(job.inputTokens)} توکن</span>}
        {job.outputTokens !== null && <span>خروجی: {faNum(job.outputTokens)} توکن</span>}
        {canCancel && ACTIVE.has(job.status) && (
          <ActionButton action={cancelAiJobAction} payload={{ id: job.id, path }} size="sm" variant="ghost" confirm={{ title: "لغو اجرا", body: "تولید پاسخ متوقف و این اجرا لغو می‌شود." }} successMessage="لغو شد.">
            <Ban />لغو
          </ActionButton>
        )}
      </div>
      {ACTIVE.has(job.status) && !job.workerAlive && (
        <Notice tone="warning" title="سرویس پس‌زمینه پاسخ نمی‌دهد">کارهای هوش مصنوعی را سرویس پس‌زمینه (worker) اجرا می‌کند. تا راه‌اندازی آن، این کار در صف می‌ماند و از بین نمی‌رود.</Notice>
      )}
      {job.status === "QUEUED" && job.retryAt && <Notice tone="info">تلاش قبلی موقتاً ناموفق بود ({job.error}). تلاش دوباره به‌طور خودکار انجام می‌شود.</Notice>}
      {job.status === "FAILED" && <Notice tone="danger" title="اجرا ناموفق بود">{job.error ?? "علت نامشخص"}</Notice>}
      {job.truncated && job.status === "DONE" && <Notice tone="warning">خروجی به سقف توکن خروجی رسید و ممکن است ناقص باشد.</Notice>}
      {showOutput && (job.html || ACTIVE.has(job.status)) && (
        <div className="rounded-lg border border-line bg-surface p-4">
          {/* job.html روی سرور با sanitize-html و فهرست سفید برچسب‌ها (بدون ویژگی، پیوند، تصویر یا اسکریپت) پاک‌سازی شده است */}
          {job.html
            ? <div className="prose-md" data-testid="job-output" dangerouslySetInnerHTML={{ __html: job.html }} />
            : <p className="text-sm text-ink-3">{job.status === "QUEUED" ? "در انتظار نوبت…" : "در حال آماده‌سازی پاسخ…"}</p>}
        </div>
      )}
    </div>
  );
}
