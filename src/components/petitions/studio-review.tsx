"use client";
// بازبینی دادخواست: بررسی‌های ماده ۵۱/۵۳ با پیوند به متن قانون، کارت مهلت، و جدول «کپی برای ثبت در سامانه»
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, Info, XCircle } from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/components/research/copy-button";
import { Seal } from "@/components/ui/seal";
import { cn } from "@/lib/cn";
import { toFaDigits } from "@/lib/text";
import type { PetitionDeadline } from "@/server/petitions/drafting";
import { ANCHORS, type CheckStatus, type PetitionCheck, type PetitionValidation } from "@/server/petitions/validate";

const ACP = "ACP";
export const articleHref = (lawCode: string | null, n: string) => `/research/laws/${lawCode ?? ACP}?a=${n}#a-${n}`;

const STATUS_UI: Record<CheckStatus, { title: string; icon: typeof XCircle; tone: string }> = {
  missing: { title: "ناقص", icon: XCircle, tone: "text-mohr" },
  warning: { title: "نیازمند توجه", icon: AlertTriangle, tone: "text-zafaran" },
  info: { title: "یادآوری", icon: Info, tone: "text-lapis" },
  ok: { title: "کامل", icon: CheckCircle2, tone: "text-sabz" },
};
const ORDER: CheckStatus[] = ["missing", "warning", "info", "ok"];

function CheckRow({ c, lawCode, onGo }: { c: PetitionCheck; lawCode: string | null; onGo?: () => void }) {
  const ui = STATUS_UI[c.status];
  const Icon = ui.icon;
  return (
    <li className="flex items-start gap-2.5 py-2.5">
      <Icon className={cn("mt-1 size-4 shrink-0", ui.tone)} aria-label={ui.title} />
      <div className="min-w-0 flex-1 text-sm leading-6">
        <p className="font-medium">{c.label}</p>
        {c.message && <p className="text-ink-2">{c.message}</p>}
        <details className="group mt-0.5">
          <summary className="cursor-pointer list-none text-xs text-ink-3 hover:text-lapis [&::-webkit-details-marker]:hidden">
            ماده {toFaDigits(c.article)}{c.band ? ` — ${c.band}` : ""} <span className="group-open:hidden">· متن</span>
          </summary>
          <blockquote className="mt-1 border-s-2 border-line-strong ps-2.5 text-xs leading-6 text-ink-2">
            «{c.anchor}» <Link href={articleHref(lawCode, c.article)} className="text-lapis hover:underline" target="_blank">متن کامل ماده</Link>
          </blockquote>
        </details>
      </div>
      {onGo && (c.status === "missing" || c.status === "warning") && (
        <button type="button" onClick={onGo} className="press inline-flex shrink-0 items-center gap-0.5 rounded-ctl px-2 py-1 text-xs text-lapis hover:bg-lapis-50">
          اصلاح<ChevronLeft className="size-3.5" aria-hidden />
        </button>
      )}
    </li>
  );
}

export function ChecksPanel({ validation, lawCode, onGo }: { validation: PetitionValidation; lawCode: string | null; onGo: (c: PetitionCheck) => void }) {
  const defect = validation.checks.some((c) => c.defect53 && c.status === "missing");
  return (
    <div className="flex flex-col gap-3">
      {defect && (
        <div className="rounded-card border border-mohr/30 bg-mohr-50 p-3 text-sm leading-7 text-ink">
          <p className="font-bold text-mohr">نقص موضوع بند ۲ ماده ۵۳</p>
          <p>«{ANCHORS.defect.text}». به موجب ماده ۵۳ چنین دادخواستی پذیرفته می‌شود ولی تا تکمیل به جریان نمی‌افتد؛ طبق ماده ۵۴ مدیر دفتر نقص را اخطار می‌کند و اگر ظرف ده روز از ابلاغ رفع نشود، دادخواست با قرار مدیر دفتر رد می‌شود.</p>
          <p className="mt-1 text-xs"><Link href={articleHref(ACP, "53")} target="_blank" className="text-lapis hover:underline">ماده ۵۳</Link> · <Link href={articleHref(ACP, "54")} target="_blank" className="text-lapis hover:underline">ماده ۵۴</Link></p>
        </div>
      )}
      {ORDER.map((status) => {
        const items = validation.checks.filter((c) => c.status === status);
        if (items.length === 0) return null;
        const ui = STATUS_UI[status];
        return (
          <details key={status} open={status !== "ok"} className="rounded-card border border-line bg-surface px-4 py-1">
            <summary className={cn("cursor-pointer py-2 text-sm font-bold", ui.tone)}>{ui.title} ({toFaDigits(items.length)})</summary>
            <ul className="divide-y divide-line">{items.map((c) => <CheckRow key={c.id} c={c} lawCode={lawCode} onGo={() => onGo(c)} />)}</ul>
          </details>
        );
      })}
    </div>
  );
}

const DEADLINE_TONE: Record<string, { tone: "success" | "warning" | "danger" | "info" | "neutral"; label: string }> = {
  OPEN: { tone: "success", label: "در مهلت" },
  LAST_DAY: { tone: "warning", label: "امروز روز آخر مهلت است" },
  PASSED: { tone: "danger", label: "مهلت گذشته است" },
  NEED_DATE: { tone: "info", label: "تاریخ شروع مهلت را وارد کنید" },
  INFO: { tone: "neutral", label: "قاعده مهلت" },
};

export function DeadlineCard({ deadline, loading }: { deadline: PetitionDeadline; loading?: boolean }) {
  if (deadline.status === "NO_RULE") return null;
  const t = DEADLINE_TONE[deadline.status];
  return (
    <section className="rounded-card border border-line bg-surface p-4" aria-live="polite" aria-busy={loading}>
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <CalendarClock className="size-4 text-ink-3" aria-hidden />
        <h3 className="flex-1 font-bold">{deadline.title ?? "مهلت تقدیم"}</h3>
        {t && <Seal tone={t.tone}>{t.label}</Seal>}
      </header>
      {deadline.dueDateLabel && (
        <p className="text-sm">روز آخر: <span className="font-bold">{deadline.dueDateLabel}</span>
          {deadline.daysLeft !== null && deadline.daysLeft > 0 && <span className="text-ink-2"> — {toFaDigits(deadline.daysLeft)} روز مانده</span>}</p>
      )}
      {deadline.status === "NEED_DATE" && deadline.triggerLabel && <p className="text-sm text-ink-2">«{deadline.triggerLabel}» را در بخش «مرجع و سوابق» وارد کنید.</p>}
      {deadline.basis && <p className="mt-1 text-xs leading-5 text-ink-3">{deadline.basis}</p>}
      {deadline.explanation.length > 0 && <ul className="mt-2 list-disc ps-5 text-xs leading-5 text-ink-2">{deadline.explanation.map((e) => <li key={e}>{e}</li>)}</ul>}
      {!deadline.verified && <p className="mt-2 text-xs text-zafaran">قاعده این مهلت هنوز به تأیید مسئول حقوقی نرسیده است؛ پیش از اتکا بازبینی کنید.</p>}
    </section>
  );
}

export function CopyForSystem({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="tbl-scroll rounded-card border border-line">
      <table className="tbl">
        <caption className="sr-only">مقدار هر خانه سامانه ثبت دادخواست برای کپی</caption>
        <thead><tr><th scope="col" className="w-32">خانه</th><th scope="col">مقدار</th><th scope="col" className="w-28"><span className="sr-only">کپی</span></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="align-top font-medium">{r.label}</th>
              <td className="max-w-0 align-top"><p className="line-clamp-4 whitespace-pre-wrap text-sm leading-6">{r.value}</p></td>
              <td className="align-top"><CopyButton text={r.value} label="کپی" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
