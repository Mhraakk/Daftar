// نتیجه «پرسش حقوقی از منابع دفتر»: وضعیت سنجش پاسخ (مستند، پیدا نشد، مردود با دلیل) و فهرست منابعی که برای مدل
// فرستاده شده با پیوند به متن اصلی؛ برچسب [S#] در پاسخ به همین فهرست پیوند دارد.
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Notice, Panel } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { SOURCE_STATUS } from "@/lib/labels";
import { faNum, toFaDigits } from "@/lib/text";
import type { Grounding, QaSource, RetrievalInfo } from "@/server/ai/legal-qa";

/** دلیل‌های مردود شدن پاسخ، به زبان کاربر */
export function rejectionReasons(g: Grounding): string[] {
  return [
    ...(g.claims === 0 ? ["پاسخ هیچ بند قابل‌سنجشی ندارد."] : []),
    ...(g.claims > 0 && g.cited.length === 0 ? ["پاسخ به هیچ‌یک از منابع فرستاده‌شده ارجاع نداده است."] : []),
    ...(g.untagged > 0 ? [`${faNum(g.untagged)} بند پاسخ بدون ارجاع به منبع است.`] : []),
    ...(g.unknown.length ? [`ارجاع به منبعی که فرستاده نشده بود: ${g.unknown.join("، ")}`] : []),
    ...(g.articles.length ? [`ماده یا تبصره‌ای که در منابع ارجاع‌شده نیامده: ${g.articles.map(toFaDigits).join("، ")}`] : []),
    ...(g.figures.length ? [`عدد، تاریخ یا مدتی که در منابع ارجاع‌شده نیامده: ${g.figures.map(toFaDigits).join("، ")}`] : []),
    ...garbledReason(g),
  ];
}

/** واژه‌های درهم (حروف لاتین درون واژه فارسی) در پاسخ؛ برای پاسخ‌های پیش از این سنجش، فهرست خالی */
const garbledReason = (g: Grounding): string[] => ((g.garbled ?? []).length
  ? [`متن پاسخ واژه درهم دارد (حروف لاتین درون واژه فارسی): ${(g.garbled ?? []).join("، ")}`] : []);

export function GroundingBanner({ grounding }: { grounding: Grounding }) {
  if (grounding.status === "grounded") {
    return (
      <div data-testid="qa-grounding" data-status="grounded">
        <Notice tone="success" title="مستند به منابع دفتر">
          هر بند پاسخ به یکی از منابع زیر ارجاع داده و ماده، عدد، تاریخ و مدت آن در همان منابع آمده است ({grounding.cited.join("، ")}). این سنجش درستیِ برداشت حقوقی را تضمین نمی‌کند؛ پیش از هر استفاده، متن منابع را بخوانید.
        </Notice>
        {garbledReason(grounding).map((r) => <p key={r} className="mt-2 text-sm font-medium text-zafaran" data-testid="qa-garbled">{r} — پیش از استفاده اصلاح کنید.</p>)}
      </div>
    );
  }
  if (grounding.status === "not_found") {
    return (
      <div data-testid="qa-grounding" data-status="not_found">
        <Notice tone="warning" title="در منابع دفتر پیدا نشد">
          مدل در منابع بازیابی‌شده پاسخی نیافت و حدسی ننوشت. پرسش را دقیق‌تر کنید، سند مرتبط را انتخاب کنید یا متن قانون لازم را به کتابخانه دفتر بیفزایید.
        </Notice>
      </div>
    );
  }
  return (
    <div data-testid="qa-grounding" data-status="rejected">
      <Notice tone="danger" title="پاسخ مردود شد">
        <span className="block">پاسخ مدل شرط «فقط از منابع دفتر، با ارجاع» را نداشت و قابل استفاده نیست:</span>
        <ul className="mt-1 list-disc ps-5">{rejectionReasons(grounding).map((r) => <li key={r}>{r}</li>)}</ul>
      </Notice>
    </div>
  );
}

const retrievalLine = (r: RetrievalInfo): string => {
  const method = r.method === "hybrid" ? `واژگانی (BM25) و معنایی با مدل ${r.embeddingModel}` : "واژگانی (BM25)";
  const fallback = r.fallback ? ` — مرتب‌سازی معنایی با ${r.embeddingModel} انجام نشد و رتبه واژگانی به کار رفت (${r.fallback})` : "";
  return `روش بازیابی: ${method}؛ ${faNum(r.candidates)} قطعه نامزد${fallback}`;
};

export function QaSources({ sources, retrieval, cited }: { sources: QaSource[]; retrieval: RetrievalInfo | null; cited: string[] }) {
  return (
    <Panel title="منابع فرستاده‌شده به مدل" icon={<BookOpen />}>
      <ol className="flex flex-col gap-3">
        {sources.map((s) => (
          <li key={s.id} id={`src-${s.id}`} className="scroll-mt-24 rounded-lg border border-line p-3" data-testid="qa-source">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold text-lapis" dir="ltr">{s.id}</span>
              <Seal tone="neutral">{s.kindLabel}</Seal>
              <Link className="font-bold text-lapis hover:underline" href={s.href}>{s.title}</Link>
              {s.status && <Seal tone={SOURCE_STATUS[s.status]?.tone ?? "neutral"}>{SOURCE_STATUS[s.status]?.label ?? s.status}</Seal>}
              {s.kind === "law" && !s.verified && <Seal tone="warning">تأییدنشده توسط مسئول حقوقی</Seal>}
              {cited.includes(s.id) && <Seal tone="success">ارجاع‌شده در پاسخ</Seal>}
            </div>
            <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-ink-2">{s.text}</p>
          </li>
        ))}
      </ol>
      {retrieval && <p className="mt-3 text-xs leading-6 text-ink-3" data-testid="qa-retrieval">{retrievalLine(retrieval)}</p>}
    </Panel>
  );
}
