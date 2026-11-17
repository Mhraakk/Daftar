// پنل‌های بینش پرونده (رندر سمت سرور): اقدام‌های پیشنهادی، پرونده‌های مرتبط و تعارض منافع، خط زمانی
import { AlertOctagon, ArrowLeft, GitCompareArrows, Lightbulb } from "lucide-react";
import Link from "next/link";
import { Timeline } from "@/components/charts";
import { Panel } from "@/components/ui/page";
import { StatusSeal } from "@/components/ui/seal";
import type { ActionTone, NextAction } from "@/lib/case-next-actions";
import { cn } from "@/lib/cn";
import { formatJalali } from "@/lib/jalali";
import { CASE_STATUS } from "@/lib/labels";
import { toFaDigits } from "@/lib/text";
import type { CaseTimeline, ConflictHit, RelatedCase } from "@/server/case-insights";

/** با کمتر از دو ردیف، خط زمانی چیزی بیش از مشخصات پرونده نمی‌گوید */
const MIN_TIMELINE_ROWS = 2;
const TONE_DOT: Record<ActionTone, string> = { danger: "bg-mohr", warning: "bg-zafaran", accent: "bg-firuze", info: "bg-lapis" };
const TONE_LABEL: Record<ActionTone, string> = { danger: "فوری", warning: "نیازمند توجه", accent: "گام بعد", info: "اطلاع" };

export function NextActionsPanel({ actions }: { actions: NextAction[] }) {
  return (
    <Panel title="اقدام‌های پیشنهادی" icon={<Lightbulb />} bodyClass="p-0">
      {actions.length === 0
        ? <p className="px-4 py-3 text-sm text-ink-3">موردی که اقدام فوری بخواهد دیده نشد.</p>
        : (
          <ul>
            {actions.map((a) => (
              <li key={a.id} className="border-b border-line last:border-0">
                <Link href={a.href} className="group flex items-start gap-3 px-4 py-2.5 hover:bg-ink/[0.03]">
                  <span className={cn("mt-2 size-2 shrink-0 rounded-full", TONE_DOT[a.tone])} aria-label={TONE_LABEL[a.tone]} role="img" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium group-hover:text-lapis">{a.title}</span>
                    <span className="block text-xs leading-5 text-ink-3">{a.detail}</span>
                  </span>
                  <ArrowLeft className="mt-1 size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      <p className="border-t border-line px-4 py-2 text-2xs text-ink-3">پیشنهادها از قاعده‌های ثابت (مهلت، وظیفه، سند، نشانی طرفین) ساخته می‌شود، نه هوش مصنوعی.</p>
    </Panel>
  );
}

const STRENGTH: Record<ConflictHit["strength"], string> = { ID: "با شناسه یا کد ملی", NAME: "فقط با نام — احتمالی" };

function ConflictItem({ hit }: { hit: ConflictHit }) {
  const what = hit.kind === "OPPONENT_IS_CLIENT"
    ? <>طرف مقابل، «{hit.person}»، مراجعه‌کننده دفتر است{hit.clientId && <> — <Link href={`/clients/${hit.clientId}`} className="text-lapis hover:underline">پرونده مراجعه‌کننده</Link></>}.</>
    : <>مراجعه‌کننده این پرونده در پرونده دیگری از دفتر طرف مقابل بوده است{hit.caseId ? <>: <Link href={`/cases/${hit.caseId}`} className="text-lapis hover:underline">{hit.caseLabel}</Link></> : " (پرونده‌ای که به آن دسترسی ندارید)"}.</>;
  return (
    <li className="rounded-ctl border border-mohr/25 bg-mohr-50 px-3 py-2 text-sm leading-6">
      <p>{what}</p>
      <p className="text-xs text-ink-3">تطبیق {STRENGTH[hit.strength]}{!hit.accessible && " · موضوع را با مدیر دفتر بررسی کنید"}</p>
    </li>
  );
}

export function RelatedPanel({ related, conflicts }: { related: RelatedCase[]; conflicts: ConflictHit[] }) {
  return (
    <Panel title="پرونده‌های مرتبط و تعارض منافع" icon={<GitCompareArrows />}>
      {conflicts.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-mohr"><AlertOctagon className="size-4" aria-hidden />احتمال تعارض منافع ({toFaDigits(String(conflicts.length))})</p>
          <ul className="flex flex-col gap-1.5">{conflicts.map((h, i) => <ConflictItem key={`${h.kind}-${h.person}-${h.caseId ?? h.clientId ?? i}`} hit={h} />)}</ul>
        </div>
      )}
      {conflicts.length === 0 && <p className="mb-3 text-sm text-sabz">در پرونده‌ها و مراجعه‌کنندگان دفتر، تعارض منافعی برای طرفین این پرونده یافت نشد.</p>}
      {related.length === 0 ? <p className="text-sm text-ink-3">پرونده مرتبطی در دسترس شما نیست.</p> : (
        <ul className="flex flex-col divide-y divide-line">
          {related.map((r) => (
            <li key={r.id} className="py-2">
              <div className="flex items-center gap-2">
                <Link href={`/cases/${r.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-lapis">{r.title}</Link>
                <StatusSeal map={CASE_STATUS} value={r.status} />
              </div>
              <p className="text-xs leading-5 text-ink-3"><span className="mono-code">{r.number}</span> · {r.reasons.join("؛ ")}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function CaseTimelineChart({ timeline, now }: { timeline: CaseTimeline; now: Date }) {
  if (timeline.rows.length < MIN_TIMELINE_ROWS) return null;
  const points = timeline.rows.filter((r) => !r.end).length;
  return (
    <section className="panel p-4 sm:p-5">
      <Timeline title="خط زمانی پرونده" rows={timeline.rows} from={timeline.from} to={timeline.to} today={now}
        summary={`از ${formatJalali(timeline.from, "date")} تا ${formatJalali(timeline.to, "date")}: ${toFaDigits(String(timeline.rows.length - points))} بازه (عمر پرونده و وظایف) و ${toFaDigits(String(points))} نقطه (مهلت و جلسه).`} />
      <p className="mt-2 text-xs leading-5 text-ink-3">بازه‌ها از ثبت تا سررسید یا انجام؛ نقطه‌ها سررسید مهلت یا زمان جلسه؛ مهلت بازِ گذشته با رنگ هشدار. خط عمودی امروز است.</p>
    </section>
  );
}
