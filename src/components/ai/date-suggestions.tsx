// فهرست تاریخ‌های پیشنهادی (استخراج قطعی از متن یا پیشنهاد هوش مصنوعی) با ثبت مهلت پس از تأیید کاربر.
// هیچ مهلتی خودکار ساخته نمی‌شود و مهلت قانونی تا تأیید مسئول حقوقی «تأییدنشده» می‌ماند.
import { CalendarPlus } from "lucide-react";
import { FormDialog } from "@/components/ui/form-dialog";
import { Seal } from "@/components/ui/seal";
import { DEADLINE_TYPE, PRIORITY } from "@/lib/labels";
import { toFaDigits } from "@/lib/text";
import { createSuggestedDeadlineAction } from "@/app/(app)/assistant/actions";

export interface DateItem { date: string; type: string; title: string; quote: string; relative?: boolean }

const TYPE_OPTIONS = Object.entries(DEADLINE_TYPE).map(([value, label]) => ({ value, label }));
const PRIORITY_OPTIONS = Object.entries(PRIORITY).map(([value, p]) => ({ value, label: p.label }));
const DESCRIPTION_ROWS = 3;
const MAX_DESCRIPTION = 2_900;
// eslint-disable-next-line ts-patterns/no-magic-numbers -- FieldDef.span needs the literal type 2
const FULL = 2 as const;

export function DateSuggestions({ items, source, caseId, canCreate, testId }: {
  items: DateItem[]; source: "EXTRACTED" | "AI_SUGGESTED"; caseId: string | null; canCreate: boolean; testId?: string;
}) {
  if (!items.length) return <p className="text-sm text-ink-3">تاریخی یافت نشد.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line" data-testid={testId}>
      {items.map((it, i) => (
        <li key={`${it.date}-${i}`} className="flex flex-wrap items-start justify-between gap-2 py-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2"><span className="num font-bold">{toFaDigits(it.date)}</span><span className="font-medium">{it.title}</span><Seal tone="neutral">{DEADLINE_TYPE[it.type] ?? "سایر"}</Seal>{it.relative && <Seal tone="warning">مهلت نسبی</Seal>}</p>
            {it.quote && <p className="mt-1 text-xs leading-6 text-ink-2">«{it.quote}»</p>}
          </div>
          {canCreate && (
            <FormDialog trigger="ثبت به‌عنوان مهلت" triggerVariant="secondary" triggerSize="sm" icon={<CalendarPlus />} title="ثبت مهلت از سند"
              description="مشخصات را بررسی و در صورت نیاز اصلاح کنید. مهلت قانونی تا تأیید مسئول حقوقی دفتر «تأییدنشده» می‌ماند."
              action={createSuggestedDeadlineAction} successMessage="مهلت ثبت شد." hidden={{ source, caseId: caseId ?? "" }}
              initial={{ title: it.title, type: it.type in DEADLINE_TYPE ? it.type : "OTHER", dueDate: it.date, priority: "NORMAL", isLegal: false, description: it.quote.slice(0, MAX_DESCRIPTION) }}
              fields={[
                { name: "title", label: "عنوان مهلت", required: true, span: FULL },
                { name: "dueDate", label: "تاریخ سررسید", type: "jdate", required: true },
                { name: "type", label: "نوع", type: "select", required: true, options: TYPE_OPTIONS },
                { name: "priority", label: "اولویت", type: "select", options: PRIORITY_OPTIONS },
                { name: "isLegal", label: "مهلت قانونی است (نیازمند تأیید مسئول حقوقی)", type: "checkbox" },
                { name: "description", label: "توضیح / متن مستند", type: "textarea", rows: DESCRIPTION_ROWS, span: FULL },
              ]} />
          )}
        </li>
      ))}
    </ul>
  );
}
