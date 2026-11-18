"use client";
// پیشنهاد هوش مصنوعی برای جاهای خالی شرح خواسته؛ هر پیشنهاد تا «اعمال» کاربر در داده سند نمی‌نشیند
import { Check, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { bodySuggestionAction, requestBodySuggestionAction } from "@/app/(app)/petitions/actions";
import { Button } from "@/components/ui/button";
import { toFaDigits } from "@/lib/text";
import { Card, Check as CheckRow } from "./studio-ui";

const POLL_MS = 2_000;
const DONE_STATES = ["DONE", "FAILED", "CANCELED"];

type Phase = { kind: "idle" } | { kind: "running"; jobId: string } | { kind: "done"; suggestions: Record<string, string>; dropped: string[]; model: string | null } | { kind: "error"; message: string };

export function BodySuggestions({ draftId, external, disabled, onApply }: {
  draftId: string; external: boolean; disabled?: boolean; onApply: (values: Record<string, string>) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [consent, setConsent] = useState(false);
  const [applied, setApplied] = useState<string[]>([]);
  const jobId = phase.kind === "running" ? phase.jobId : null;

  useEffect(() => {
    if (!jobId) return undefined;
    let stopped = false;
    const poll = async () => {
      const r = await bodySuggestionAction({ jobId });
      if (stopped) return;
      if (!r.ok) { setPhase({ kind: "error", message: r.error }); return; }
      if (!DONE_STATES.includes(r.data.status)) return;
      setPhase(r.data.status === "DONE"
        ? { kind: "done", suggestions: r.data.suggestions, dropped: r.data.dropped, model: r.data.model }
        : { kind: "error", message: r.data.error ?? "اجرای هوش مصنوعی ناموفق بود." });
    };
    const timer = setInterval(() => { void poll(); }, POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [jobId]);

  const start = async () => {
    setApplied([]);
    const r = await requestBodySuggestionAction({ id: draftId, confirmSend: consent });
    setPhase(r.ok ? { kind: "running", jobId: r.data.jobId } : { kind: "error", message: r.error });
  };
  const apply = (values: Record<string, string>) => {
    onApply(values);
    setApplied((a) => [...a, ...Object.keys(values)]);
  };

  const suggestions = phase.kind === "done" ? Object.entries(phase.suggestions) : [];
  return (
    <Card title="پیشنهاد هوش مصنوعی" icon={<Sparkles />} note="فقط از داده همین دادخواست، شرح پرونده و متن مواد استنادشده در منابع سند؛ تا «اعمال» نکنید در سند نمی‌نشیند و پس از اعمال باید بازبینی شود.">
      {external && phase.kind !== "running" && (
        <CheckRow checked={consent} onChange={setConsent} label="ارسال داده این دادخواست به ارائه‌دهنده بیرون از شبکه دفتر را تأیید می‌کنم" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => { void start(); }} disabled={disabled || phase.kind === "running" || (external && !consent)}>
          {phase.kind === "running" ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {phase.kind === "running" ? "در حال تهیه پیشنهاد…" : "پیشنهاد برای جاهای خالی"}
        </Button>
        {suggestions.length > 1 && <Button variant="ghost" size="sm" onClick={() => apply(Object.fromEntries(suggestions))}><Check />اعمال همه</Button>}
      </div>
      {phase.kind === "error" && <p className="mt-2 text-sm text-mohr" role="alert">{phase.message}</p>}
      {phase.kind === "done" && suggestions.length === 0 && <p className="mt-2 text-sm text-ink-3">مدل برای جاهای خالی، پیشنهادی که با داده‌ها پشتیبانی شود نداد.</p>}
      {suggestions.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-line rounded-card border border-zafaran/30 bg-zafaran-50/40">
          {suggestions.map(([label, value]) => (
            <li key={label} className="flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1 text-sm leading-7">
                <p className="text-xs font-medium text-ink-3">{label}</p>
                <p className="whitespace-pre-wrap">{value}</p>
              </div>
              <Button size="sm" variant={applied.includes(label) ? "ghost" : "secondary"} disabled={disabled || applied.includes(label)} onClick={() => apply({ [label]: value })}>
                {applied.includes(label) ? "اعمال شد" : "اعمال"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {phase.kind === "done" && phase.dropped.length > 0 && (
        <p className="mt-2 text-xs leading-6 text-mohr" data-testid="body-dropped">
          پیشنهاد مدل برای {phase.dropped.map((b) => `«${b}»`).join("، ")} کنار گذاشته شد، چون عدد یا تاریخی داشت که در داده‌های دادخواست و پرونده نبود، یا مقدارش با نوع جای خالی نمی‌خواند.
        </p>
      )}
      {phase.kind === "done" && (
        <p className="mt-2 text-2xs text-ink-3">پیشنهاد هوش مصنوعی{phase.model ? ` (${phase.model})` : ""} — {toFaDigits(String(suggestions.length))} مورد؛ نادرستی احتمالی را پیش از ذخیره بررسی کنید.</p>
      )}
    </Card>
  );
}
