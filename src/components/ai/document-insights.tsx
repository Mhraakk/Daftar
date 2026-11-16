// بینش‌های سند: تاریخ‌های مندرج در متن و فهرست بررسی قرارداد (هر دو قطعی و بدون هوش مصنوعی) و میان‌برهای دستیار
import { CalendarSearch, FileSearch, Scale, Sparkles } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Panel } from "@/components/ui/page";
import { DEADLINE_TYPE } from "@/lib/labels";
import { extractJalaliDates } from "@/server/deadline-calc";
import { renderAiMarkdown } from "@/server/ai/markdown";
import { contractPreflight, detectDocumentType, preflightMarkdown } from "@/server/ai/preflight";
import { DateSuggestions, type DateItem } from "./date-suggestions";

const PAD = 2;
const CONTRACT_CATEGORY = "قرارداد";

export function DocumentInsights({ doc, text, canDeadline, canAi, canSkill }: {
  doc: { id: string; title: string; category: string; caseId: string | null };
  text: string | null; canDeadline: boolean; canAi: boolean; canSkill: boolean;
}) {
  if (!text?.trim()) return null;
  const dates: DateItem[] = extractJalaliDates(text).map((d) => ({
    date: `${d.jy}/${String(d.jm).padStart(PAD, "0")}/${String(d.jd).padStart(PAD, "0")}`,
    type: d.hint ?? "OTHER",
    title: d.hint ? `${DEADLINE_TYPE[d.hint]} — مندرج در سند` : "تاریخ مندرج در سند",
    quote: d.context,
  }));
  const isContract = doc.category === CONTRACT_CATEGORY || !!detectDocumentType(text);
  const caseQuery = doc.caseId ? `&case=${doc.caseId}` : "";
  return (
    <>
      {(canAi || canSkill) && (
        <Panel title="هوش مصنوعی" icon={<Sparkles />}>
          <div className="flex flex-wrap gap-2">
            {canAi && <LinkButton href={`/assistant?task=doc_summary&doc=${doc.id}${caseQuery}`} size="sm"><FileSearch />خلاصه و نکات کلیدی</LinkButton>}
            {canAi && <LinkButton href={`/assistant?task=dates&doc=${doc.id}${caseQuery}`} size="sm"><CalendarSearch />پیشنهاد مهلت با دستیار</LinkButton>}
            {canSkill && isContract && <LinkButton href={`/skills/claude-legal-skill.contract-review?doc=${doc.id}${caseQuery}`} size="sm"><Scale />بررسی ریسک قرارداد (مهارت)</LinkButton>}
            {canSkill && <LinkButton href={`/skills?case=${doc.caseId ?? ""}`} size="sm" variant="ghost">سایر مهارت‌ها</LinkButton>}
          </div>
        </Panel>
      )}
      <Panel title="تاریخ‌های مندرج در متن (استخراج خودکار، بدون هوش مصنوعی)" icon={<CalendarSearch />}>
        <p className="mb-2 text-xs text-ink-3">تاریخ‌های شمسی متن سند با برچسب پیشنهادی از واژه‌های نزدیک به آن. هر مورد را با متن سند تطبیق دهید.</p>
        <DateSuggestions items={dates} source="EXTRACTED" caseId={doc.caseId} canCreate={canDeadline} testId="extracted-dates" />
      </Panel>
      {isContract && (
        <Panel title="بررسی سریع قرارداد (بدون هوش مصنوعی)" icon={<Scale />}>
          {/* گزارش از متن سند و فهرست ثابت نشانه‌ها ساخته و پیش از نمایش پاک‌سازی می‌شود */}
          <div className="prose-md text-sm" data-testid="contract-preflight" dangerouslySetInnerHTML={{ __html: renderAiMarkdown(preflightMarkdown(contractPreflight(text), doc.title)) }} />
        </Panel>
      )}
    </>
  );
}
