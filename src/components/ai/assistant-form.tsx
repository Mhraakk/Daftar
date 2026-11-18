"use client";
// فرم دستیار حقوقی: انتخاب کار، پرونده، اسناد و متن، با نمایش داده ارسالی و تأیید ارسال به سرور بیرونی.
import { Send, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Lookup } from "@/components/ui/lookup";
import { Notice } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { startAssistantAction } from "@/app/(app)/assistant/actions";
import { DocumentPicker, type PickedDoc } from "./document-picker";

const REWRITE_ROWS = 8;
const TEXT_ROWS = 4;

type Task = "case_analysis" | "doc_summary" | "question" | "legal_qa" | "rewrite" | "draft" | "dates";

/**
 * sendsCase: خلاصه پرونده در درخواست به مدل می‌رود؛ برای استخراج تاریخ پرونده فقط برای انتخاب سند و ثبت مهلت است.
 * retrieval: فقط قطعه‌های مرتبط کتابخانه قانون، اسناد و پرونده فرستاده می‌شود (پرسش حقوقی از منابع دفتر).
 */
interface TaskUi { needsCase: boolean; caseOptional: boolean; sendsCase?: false; retrieval?: true; docs: "none" | "single" | "multi"; text: "none" | "required" | "optional"; textLabel: string; placeholder: string }
const UI: Record<Task, TaskUi> = {
  case_analysis: { needsCase: true, caseOptional: false, docs: "multi", text: "optional", textLabel: "تمرکز تحلیل (اختیاری)", placeholder: "مثلاً: با تأکید بر مهلت‌های پیش رو و مدارک ناقص" },
  doc_summary: { needsCase: false, caseOptional: true, docs: "single", text: "optional", textLabel: "نکته مورد توجه (اختیاری)", placeholder: "مثلاً: تعهدات مالی و مهلت‌ها را برجسته کن" },
  question: { needsCase: false, caseOptional: true, docs: "multi", text: "required", textLabel: "پرسش", placeholder: "پرسش خود را درباره پرونده یا اسناد بنویسید" },
  legal_qa: { needsCase: false, caseOptional: true, retrieval: true, docs: "multi", text: "required", textLabel: "پرسش حقوقی", placeholder: "مثلاً: مهلت تجدیدنظرخواهی از رأی دادگاه بدوی چقدر است؟" },
  rewrite: { needsCase: false, caseOptional: false, docs: "none", text: "required", textLabel: "متن برای بازنویسی رسمی", placeholder: "متن را اینجا وارد کنید؛ واقعیت‌ها، نام‌ها، اعداد و تاریخ‌ها بدون تغییر می‌مانند" },
  draft: { needsCase: false, caseOptional: true, docs: "multi", text: "optional", textLabel: "شرح سند موردنیاز", placeholder: "مثلاً: اظهارنامه مطالبه اجاره‌بهای معوق سه ماه اخیر خطاب به مستأجر" },
  dates: { needsCase: false, caseOptional: true, sendsCase: false, docs: "single", text: "none", textLabel: "", placeholder: "" },
};

export interface AssistantFormProps {
  tasks: Record<string, string>;
  docTypes: Record<string, string>;
  external: boolean;
  destination: string;
  canConfidential: boolean;
  canDraft: boolean;
  maxDocs: number;
  initial: { task: Task; caseId?: string; caseLabel?: string; docs?: PickedDoc[]; draftId?: string; draftTitle?: string };
}

export function AssistantForm(p: AssistantFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [task, setTask] = useState<Task>(p.initial.task);
  const [caseId, setCaseId] = useState(p.initial.caseId ?? "");
  const [docIds, setDocIds] = useState<string[]>(p.initial.docs?.map((d) => d.id) ?? []);
  const [docs, setDocs] = useState<PickedDoc[]>(p.initial.docs ?? []);
  const [text, setText] = useState("");
  const [docType, setDocType] = useState("");
  const [title, setTitle] = useState("");
  const [includeConfidential, setIncludeConfidential] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ui = UI[task];
  const fromDraft = task === "rewrite" && !!p.initial.draftId;

  const submit = () => start(async () => {
    setError(null);
    const res = await startAssistantAction({
      task, caseId: ui.needsCase || ui.caseOptional ? caseId : "", documentIds: ui.docs === "none" ? [] : docIds,
      draftId: fromDraft ? p.initial.draftId : "", text: ui.text === "none" ? "" : text, docType, title, includeConfidential, confirmSend,
    });
    if (res.ok) {
      toast.success("درخواست در صف قرار گرفت.");
      router.push(`/assistant/${res.data.jobId}`);
      return;
    }
    setError(res.error);
    toast.error(res.error);
  });

  return (
    <div className="flex flex-col gap-4" data-testid="assistant-form">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="نوع کار">
        {(Object.keys(UI) as Task[]).filter((t) => t !== "draft" || p.canDraft).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={task === t} onClick={() => setTask(t)}
            className={cn("rounded-lg border px-3 py-2 text-start text-sm transition-colors", task === t ? "border-lapis bg-lapis-50 font-bold text-lapis" : "border-line hover:bg-surface-2")}>
            {p.tasks[t]}
          </button>
        ))}
      </div>

      {(ui.needsCase || ui.caseOptional) && (
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="as-case">پرونده{ui.needsCase ? " (الزامی)" : " (اختیاری)"}</label>
          <Lookup id="as-case" type="case" value={caseId} initialLabel={p.initial.caseLabel} onChange={(id) => { setCaseId(id); setDocIds([]); setDocs([]); }} placeholder="انتخاب پرونده…" />
        </div>
      )}

      {task === "draft" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="as-type">نوع سند</label>
            <select id="as-type" className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="">انتخاب کنید…</option>
              {Object.entries(p.docTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="as-title">عنوان پیش‌نویس (اختیاری)</label>
            <input id="as-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
      )}

      {ui.docs !== "none" && (
        <div>
          <p className="mb-1 text-sm font-medium">{ui.docs === "single" ? "سند (یک مورد)" : "اسناد (اختیاری)"}</p>
          <DocumentPicker caseId={caseId} value={docIds} single={ui.docs === "single"} max={p.maxDocs} initial={p.initial.docs} onChange={(ids, d) => { setDocIds(ids); setDocs(d); }} />
        </div>
      )}

      {fromDraft && <Notice tone="info">متن پیش‌نویس «{p.initial.draftTitle}» بازنویسی می‌شود. پس از بررسی نتیجه، می‌توانید آن را به‌صورت نسخه تازه روی پیش‌نویس اعمال کنید.</Notice>}
      {ui.text !== "none" && !fromDraft && (
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="as-text">{ui.textLabel}</label>
          <textarea id="as-text" className="input" rows={task === "rewrite" ? REWRITE_ROWS : TEXT_ROWS} value={text} onChange={(e) => setText(e.target.value)} placeholder={ui.placeholder} />
        </div>
      )}
      {ui.retrieval && (
        <Notice tone="info" title="فقط از منابع دفتر، با ارجاع">
          پاسخ فقط از مواد کتابخانه قانون دفتر، اسناد انتخاب‌شده و خلاصه پرونده ساخته می‌شود و هر بند باید به منبعش ([S1]، [S2]…) ارجاع دهد. اگر منبعی پیدا نشود، مدل فراخوانی نمی‌شود؛ پاسخ بدون منبع یا با ماده، مبلغ، مهلت یا تاریخی که در منابع نیست «مردود» نمایش داده می‌شود.
        </Notice>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2/60 p-3 text-sm">
        <p className="flex items-center gap-1 font-bold"><ShieldAlert className="size-4" />آنچه ارسال می‌شود</p>
        <ul className="list-disc ps-5 text-ink-2">
          <li>دستورالعمل دستیار (بدون داده شخصی)</li>
          {ui.retrieval && <li>چند قطعه مرتبط از کتابخانه قانون دفتر (حداکثر ۸ منبع، همراه قطعه‌های اسناد و پرونده انتخاب‌شده)</li>}
          {caseId && (ui.needsCase || ui.caseOptional) && ui.sendsCase !== false && <li>{ui.retrieval ? "قطعه‌های مرتبط خلاصه پرونده" : "خلاصه پرونده انتخاب‌شده"} (کد ملی پوشانده می‌شود)</li>}
          {ui.docs !== "none" && docs.map((d) => <li key={d.id}>{ui.retrieval ? "قطعه‌های مرتبط سند" : "متن سند"} «{d.label}»{d.confidential ? " — محرمانه" : ""}</li>)}
          {fromDraft && <li>متن پیش‌نویس «{p.initial.draftTitle}»</li>}
          {text.trim() && ui.text !== "none" && <li>متن واردشده شما</li>}
        </ul>
        <p className="text-ink-2">مقصد: <span dir="ltr">{p.destination}</span></p>
        {docs.some((d) => d.confidential) && ui.docs !== "none" && (
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={includeConfidential} disabled={!p.canConfidential} onChange={(e) => setIncludeConfidential(e.target.checked)} />آگاهانه ارسال اسناد محرمانه را تأیید می‌کنم.</label>
        )}
        {p.external && (
          <label className="flex items-start gap-2 font-medium text-zafaran"><input type="checkbox" className="mt-1" checked={confirmSend} onChange={(e) => setConfirmSend(e.target.checked)} />می‌دانم این داده‌ها به سروری بیرون از شبکه دفتر ارسال می‌شود و ارسال آن را تأیید می‌کنم.</label>
        )}
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex justify-end">
        <Button variant="primary" onClick={submit} loading={pending} data-testid="assistant-submit"><Send />ارسال به دستیار</Button>
      </div>
    </div>
  );
}
