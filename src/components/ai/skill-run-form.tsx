"use client";
// فرم اجرای مهارت حقوقی: پرونده، اسناد، پرسش‌های دروازه‌ای خود مهارت و تأیید آگاهانه داده ارسالی.
import { Play, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Lookup } from "@/components/ui/lookup";
import { Notice } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { formatBytes, toFaDigits } from "@/lib/text";
import { startSkillRunAction } from "@/app/(app)/skills/actions";
import { DocumentPicker, type PickedDoc } from "./document-picker";

export interface SkillFormProps {
  skill: { slug: string; title: string; requiresCase: boolean; argumentHint: string | null; sizeBytes: number; askPosition: boolean; askDisclosure: boolean };
  positions: Record<string, string>;
  disclosureOptions: Record<string, string>;
  external: boolean;
  destination: string;
  canConfidential: boolean;
  initialCase?: { id: string; label: string } | null;
  initialDocs?: PickedDoc[];
  maxDocs: number;
}

export function SkillRunForm(p: SkillFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [caseId, setCaseId] = useState(p.initialCase?.id ?? "");
  const [docIds, setDocIds] = useState<string[]>(p.initialDocs?.map((d) => d.id) ?? []);
  const [docs, setDocs] = useState<PickedDoc[]>(p.initialDocs ?? []);
  const [request, setRequest] = useState("");
  const [position, setPosition] = useState("");
  const [disclosure, setDisclosure] = useState("");
  const [conflictReviewed, setConflictReviewed] = useState(false);
  const [includeConfidential, setIncludeConfidential] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [gateError, setGateError] = useState<{ code?: string; message: string } | null>(null);
  const anyConfidential = docs.some((d) => d.confidential);

  const submit = () => start(async () => {
    setErrors({});
    setGateError(null);
    const res = await startSkillRunAction({ skillSlug: p.skill.slug, caseId, documentIds: docIds, request, position, disclosure, conflictReviewed, includeConfidential, confirmSend });
    if (res.ok) {
      toast.success("اجرا در صف قرار گرفت.");
      router.push(`/skills/runs/${res.data.runId}`);
      return;
    }
    setErrors(res.fieldErrors ?? {});
    setGateError({ code: res.code, message: res.error });
    toast.error(res.error);
  });

  return (
    <div className="flex flex-col gap-4" data-testid="skill-run-form">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="sr-case">پرونده{p.skill.requiresCase ? " (الزامی)" : " (اختیاری)"}</label>
          <Lookup id="sr-case" type="case" value={caseId} initialLabel={p.initialCase?.label} invalid={!!errors.caseId} onChange={(id) => { setCaseId(id); setDocIds([]); setDocs([]); }} placeholder="انتخاب پرونده…" />
          {errors.caseId && <p className="mt-1 text-xs text-mohr">{errors.caseId}</p>}
          <p className="mt-1 text-xs text-ink-3">{p.skill.requiresCase ? "مهارت‌های دعاوی فقط روی پرونده ثبت‌شده و پس از بررسی تعارض اجرا می‌شوند." : "در صورت انتخاب، خلاصه پرونده (با پوشاندن کد ملی) به مدل داده می‌شود."}</p>
        </div>
        {p.skill.askPosition && (
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="sr-pos">شما کدام طرف قرارداد هستید؟ (پرسش مهارت)</label>
            <select id="sr-pos" className={`input ${errors.position ? "input-error" : ""}`} value={position} onChange={(e) => setPosition(e.target.value)}>
              <option value="">انتخاب کنید…</option>
              {Object.entries(p.positions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {errors.position && <p className="mt-1 text-xs text-mohr">{errors.position}</p>}
            <p className="mt-1 text-xs text-ink-3">آنچه «پرخطر» است به موقعیت شما بستگی دارد.</p>
          </div>
        )}
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">اسناد ({toFaDigits(docIds.length)} از حداکثر {toFaDigits(p.maxDocs)})</p>
        <DocumentPicker caseId={caseId} value={docIds} max={p.maxDocs} initial={p.initialDocs} onChange={(ids, d) => { setDocIds(ids); setDocs(d); }} />
        <p className="mt-1 text-xs text-ink-3">فقط متن استخراج‌شده آخرین نسخه هر سند ارسال می‌شود. اسناد اسکن‌شده پس از OCR قابل انتخاب‌اند.</p>
      </div>

      {p.skill.askDisclosure && (
        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-sm font-medium">آیا هیچ‌یک از این اسناد از طریق افشای مدارک (disclosure / discovery) در دادرسی به دست آمده است؟</legend>
          {Object.entries(p.disclosureOptions).map(([k, v]) => (
            <label key={k} className="flex items-start gap-2 py-1 text-sm"><input type="radio" name="disclosure" className="mt-1" checked={disclosure === k} onChange={() => setDisclosure(k)} />{v}</label>
          ))}
          {errors.disclosure && <p className="text-xs text-mohr">{errors.disclosure}</p>}
        </fieldset>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="sr-req">درخواست شما</label>
        <textarea id="sr-req" className="input" rows={4} value={request} onChange={(e) => setRequest(e.target.value)} placeholder="مثلاً: ریسک‌های این قرارداد را از دید مستأجر بررسی و پیشنهاد اصلاح بده." />
        {p.skill.argumentHint && <p className="mt-1 text-xs text-ink-3" dir="ltr">argument-hint: {p.skill.argumentHint}</p>}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2/60 p-3 text-sm">
        <p className="flex items-center gap-1 font-bold"><ShieldAlert className="size-4" />آنچه ارسال می‌شود</p>
        <ul className="list-disc ps-5 text-ink-2">
          <li>متن کامل مهارت «{p.skill.title}» ({formatBytes(p.skill.sizeBytes)}) و نمایه دفتر</li>
          {caseId && <li>خلاصه پرونده انتخاب‌شده (طرفین، مهلت‌ها، وظایف و یادداشت‌ها؛ کد ملی پوشانده می‌شود)</li>}
          {docs.map((d) => <li key={d.id}>متن سند «{d.label}»{d.confidential ? " — محرمانه" : ""}</li>)}
          {request.trim() && <li>متن درخواست شما</li>}
        </ul>
        <p className="text-ink-2">مقصد: <span dir="ltr">{p.destination}</span></p>
        {p.skill.requiresCase && (
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={conflictReviewed} onChange={(e) => setConflictReviewed(e.target.checked)} />
            تعارض‌های احتمالی که بررسی خودکار دفتر بیابد، توسط دفتر بررسی شده است (دروازه تعارض منافع).</label>
        )}
        {anyConfidential && (
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={includeConfidential} disabled={!p.canConfidential} onChange={(e) => setIncludeConfidential(e.target.checked)} />
            آگاهانه ارسال اسناد محرمانه را تأیید می‌کنم.</label>
        )}
        {p.external && (
          <label className="flex items-start gap-2 font-medium text-zafaran"><input type="checkbox" className="mt-1" checked={confirmSend} onChange={(e) => setConfirmSend(e.target.checked)} />
            می‌دانم این داده‌ها به سروری بیرون از شبکه دفتر ارسال می‌شود و ارسال آن را تأیید می‌کنم.</label>
        )}
      </div>

      {gateError && <Notice tone={gateError.code === "CONFLICT_GATE" || gateError.code === "GATE" ? "warning" : "danger"}>{gateError.message}</Notice>}
      <div className="flex justify-end">
        <Button variant="primary" onClick={submit} loading={pending} data-testid="run-skill"><Play />اجرای مهارت</Button>
      </div>
    </div>
  );
}
