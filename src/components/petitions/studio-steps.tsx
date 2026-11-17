"use client";
// گام‌های استودیوی دادخواست جز طرفین: خواسته و بها، دلایل و گواهان، تحقیقات و خواسته‌های فرعی، مرجع و سوابق، شرح خواسته
import { Gavel, Landmark, ListPlus, Paperclip, Scale, ScrollText, Search, Users } from "lucide-react";
import { JalaliDateInput } from "@/components/ui/date-picker";
import { Seal } from "@/components/ui/seal";
import { cn } from "@/lib/cn";
import { toFaDigits } from "@/lib/text";
import { evidenceRequired, type PetitionData, type PetitionSpec } from "@/server/petitions/data";
import type { PetitionDeadline } from "@/server/petitions/drafting";
import { EMPTY_BLANK, fillBody, formatAmount, userBlanks } from "@/server/petitions/render";
import type { PetitionCheck } from "@/server/petitions/validate";
import { DeadlineCard } from "./studio-review";
import { AddButton, Card, Check, Field, PickList, removeAt, replaceAt, Segmented } from "./studio-ui";

export interface StepProps { spec: PetitionSpec; data: PetitionData; onChange: (d: PetitionData) => void; disabled?: boolean; checks: PetitionCheck[] }

const SUBJECT_ROWS = 2;
const ADDRESS_ROWS = 2;
const LONG_BLANK_ROWS = 5;
/** جاهای خالی که متن بلند می‌گیرند */
const LONG_WORDS = ["دلایل", "شرح", "توضیح", "جهات", "خلاصه", "مشخصات"];
const DATE_WORD = "تاریخ";

function CheckNotes({ checks, ids }: { checks: PetitionCheck[]; ids: string[] }) {
  const items = checks.filter((c) => ids.includes(c.id) && c.status !== "ok" && c.message);
  if (items.length === 0) return null;
  return <ul className="mb-3 flex flex-col gap-1 rounded-ctl bg-zafaran-50 px-3 py-2 text-xs leading-5 text-zafaran">{items.map((c) => <li key={c.id}>{c.label}: {c.message}</li>)}</ul>;
}

const VALUE_TYPES = [{ value: "MALI" as const, label: "مالی" }, { value: "GHEIR_MALI" as const, label: "غیرمالی" }];

export function ClaimStep({ spec, data, onChange, disabled, checks }: StepProps) {
  const claim = data.claim;
  const set = (patch: Partial<PetitionData["claim"]>) => onChange({ ...data, claim: { ...claim, ...patch } });
  const amount = claim.value.trim() ? formatAmount(claim.value) : "";
  return (
    <Card title="خواسته و بهای آن" icon={<Scale />} note="بند ۳ ماده ۵۱: تعیین خواسته و بهای آن، مگر آن‌که تعیین بها ممکن نباشد یا خواسته مالی نباشد.">
      <CheckNotes checks={checks} ids={["claim.subject", "claim.value", "claim.valueType"]} />
      <div className="flex flex-col gap-4">
        <Field label="خواسته" value={claim.subject} onChange={(subject) => set({ subject })} disabled={disabled} multiline rows={SUBJECT_ROWS} placeholder={spec.title} />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-2">نوع خواسته</span>
          <Segmented label="نوع خواسته" value={claim.valueType ?? "MALI"} options={VALUE_TYPES} onChange={(valueType) => set({ valueType })} disabled={disabled} />
          {!claim.valueType && <span className="ms-2 text-xs text-mohr">هنوز انتخاب نشده است</span>}
          {spec.valueOptions.length > 0 && (
            <p className="mt-2 text-xs text-ink-3">در فرم نمونه: {spec.valueOptions.map((o) => `${o.label}${o.checked ? " ✓" : ""}`).join("، ")}</p>
          )}
        </div>
        {claim.valueType === "MALI" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="بهای خواسته (ریال)" value={claim.value} onChange={(value) => set({ value })} disabled={disabled} inputMode="numeric" ltr
              hint={amount ? `${amount} ریال` : "عدد را بدون جداکننده بنویسید."} />
            <Field label="مبنای تقویم" value={claim.valueBasis} onChange={(valueBasis) => set({ valueBasis })} disabled={disabled} placeholder="مثلاً «به نرخ روز» یا «تقویم برای هزینه دادرسی»" />
          </div>
        )}
        {claim.valueType === "GHEIR_MALI" && (
          <Field label="توضیح بها (اختیاری)" value={claim.valueBasis} onChange={(valueBasis) => set({ valueBasis })} disabled={disabled}
            hint="خواسته غیرمالی بها ندارد؛ اگر برای هزینه دادرسی تقویم لازم است، اینجا بنویسید." />
        )}
      </div>
    </Card>
  );
}

export function EvidenceStep({ spec, data, onChange, disabled, checks }: StepProps) {
  const ev = data.evidence;
  const setEv = (evidence: PetitionData["evidence"]) => onChange({ ...data, evidence });
  const missingSpec = spec.evidence.filter((l) => !ev.some((e) => e.label === l));
  const setW = (witnesses: PetitionData["witnesses"]) => onChange({ ...data, witnesses });
  return (
    <div className="flex flex-col gap-4">
      <Card title="دلایل و منضمات" icon={<Paperclip />} note="بند ۶ ماده ۵۱: ذکر ادله و وسایلی که خواهان برای اثبات ادعای خود دارد."
        action={!disabled && <AddButton onClick={() => setEv([...ev, { label: "", detail: "", include: true }])}>دلیل دیگر</AddButton>}>
        <CheckNotes checks={checks} ids={["evidence"]} />
        <ul className="flex flex-col divide-y divide-line">
          {ev.map((e, i) => {
            const fromSpec = spec.evidence.includes(e.label);
            const required = fromSpec && evidenceRequired(spec, e.label) === true;
            const set = (patch: Partial<PetitionData["evidence"][number]>) => setEv(replaceAt(ev, i, { ...e, ...patch }));
            return (
              <li key={`ev-${i}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  {fromSpec
                    ? <Check checked={e.include} onChange={(include) => set({ include })} disabled={disabled} label={e.label} badge={required && <Seal tone="danger">الزامی</Seal>} />
                    : <Field label={`دلیل ${toFaDigits(i + 1)}`} value={e.label} onChange={(label) => set({ label })} disabled={disabled} placeholder="مثلاً «اصل چک شماره …»" />}
                </div>
                <Field label="جزئیات (شماره، تاریخ، مرجع صدور)" value={e.detail} onChange={(detail) => set({ detail })} disabled={disabled || !e.include} className="sm:w-72" />
                {!fromSpec && !disabled && (
                  <button type="button" onClick={() => setEv(removeAt(ev, i))} className="self-end rounded-ctl px-2 py-2 text-xs text-mohr hover:bg-mohr-50">حذف</button>
                )}
              </li>
            );
          })}
        </ul>
        {missingSpec.length > 0 && !disabled && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-ink-3">از فرم نمونه:</span>
            {missingSpec.map((l) => (
              <button key={l} type="button" onClick={() => setEv([...ev, { label: l, detail: "", include: true }])} className="rounded-full border border-dashed border-line-strong px-3 py-1 text-ink-2 hover:border-lapis/50 hover:text-lapis">+ {l}</button>
            ))}
          </div>
        )}
        {spec.evidenceInfo.length > 0 && <ul className="mt-3 list-disc rounded-ctl bg-surface-2 py-2 pe-3 ps-7 text-xs leading-6 text-ink-2">{spec.evidenceInfo.map((x) => <li key={x}>{x}</li>)}</ul>}
      </Card>
      <Card title="گواهان" icon={<Users />} note="اگر دلیل، گواهی گواه باشد، اسامی، مشخصات و محل اقامت گواهان باید به‌طور صحیح معین شود (بند ۶ ماده ۵۱)."
        action={!disabled && <AddButton onClick={() => setW([...data.witnesses, { name: "", details: "", address: "" }])}>افزودن گواه</AddButton>}>
        <CheckNotes checks={checks} ids={["witnesses"]} />
        <div className="flex flex-col gap-3">
          {data.witnesses.map((w, i) => {
            const set = (patch: Partial<PetitionData["witnesses"][number]>) => setW(replaceAt(data.witnesses, i, { ...w, ...patch }));
            return (
              <div key={`w-${i}`} className="grid gap-3 rounded-card border border-line p-3 sm:grid-cols-2">
                <Field label={`نام گواه ${toFaDigits(i + 1)}`} value={w.name} onChange={(name) => set({ name })} disabled={disabled} />
                <Field label="مشخصات (نام پدر، کد ملی، شغل)" value={w.details} onChange={(details) => set({ details })} disabled={disabled} />
                <Field label="محل اقامت" value={w.address} onChange={(address) => set({ address })} disabled={disabled} multiline rows={ADDRESS_ROWS} className="sm:col-span-2" />
                {!disabled && <button type="button" onClick={() => setW(removeAt(data.witnesses, i))} className="justify-self-start rounded-ctl px-2 py-1 text-xs text-mohr hover:bg-mohr-50">حذف گواه</button>}
              </div>
            );
          })}
          {data.witnesses.length === 0 && <p className="text-sm text-ink-3">گواهی ثبت نشده است.</p>}
        </div>
      </Card>
    </div>
  );
}

export function ExtrasStep({ spec, data, onChange, disabled }: StepProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="تحقیقات و اقدامات" icon={<Search />} note="درخواست تحقیق محلی، کارشناسی، استعلام و مانند آن.">
        <PickList options={spec.investigations} selected={data.investigations} onChange={(investigations) => onChange({ ...data, investigations })} disabled={disabled}
          addPlaceholder="اقدام دیگر، مثلاً «ارجاع به کارشناس»" emptyHint="فرم نمونه موردی پیشنهاد نکرده است." />
      </Card>
      <Card title="خواسته‌های فرعی" icon={<ListPlus />} note="مانند خسارات دادرسی، تأخیر تأدیه یا حق‌الوکاله.">
        <PickList options={spec.ancillary} selected={data.ancillary} onChange={(ancillary) => onChange({ ...data, ancillary })} disabled={disabled}
          addPlaceholder="خواسته فرعی دیگر" emptyHint="فرم نمونه موردی پیشنهاد نکرده است." />
      </Card>
    </div>
  );
}

const DECISION_KINDS = [{ value: "حکم", label: "حکم" }, { value: "قرار", label: "قرار" }];

function DateField({ label, value, onChange, disabled, hint }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; hint?: string }) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-sm font-medium text-ink-2">{label}</span>
      <JalaliDateInput value={value} onChange={onChange} disabled={disabled} />
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export function CourtStep({ spec, data, onChange, disabled, checks, deadline, deadlineLoading }: StepProps & { deadline: PetitionDeadline; deadlineLoading: boolean }) {
  const setCourt = (patch: Partial<PetitionData["court"]>) => onChange({ ...data, court: { ...data.court, ...patch } });
  const setDecision = (patch: Partial<PetitionData["decision"]>) => onChange({ ...data, decision: { ...data.decision, ...patch } });
  const setMain = (patch: Partial<PetitionData["mainCase"]>) => onChange({ ...data, mainCase: { ...data.mainCase, ...patch } });
  const lawChecks = checks.filter((c) => c.id.startsWith("law.") || c.id === "court");
  return (
    <div className="flex flex-col gap-4">
      <Card title="مرجع رسیدگی" icon={<Landmark />} note={spec.courtBasis ?? "ماده ۴۸: دادخواست به دفتر دادگاه صالح تقدیم می‌شود."}>
        <CheckNotes checks={lawChecks} ids={lawChecks.map((c) => c.id)} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="دادگاه" value={data.court.name} onChange={(name) => setCourt({ name })} disabled={disabled} placeholder={spec.court ?? "دادگاه عمومی حقوقی"} />
          <Field label="شعبه" value={data.court.branch} onChange={(branch) => setCourt({ branch })} disabled={disabled} placeholder="در صورت اطلاع" />
          <Field label="شهر" value={data.court.city} onChange={(city) => setCourt({ city })} disabled={disabled} />
        </div>
      </Card>
      {spec.kind === "OBJECTION" && (
        <Card title="رأی مورد اعتراض" icon={<Gavel />}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><span className="mb-1.5 block text-sm font-medium text-ink-2">نوع رأی</span><Segmented label="نوع رأی" value={data.decision.kind} options={DECISION_KINDS} onChange={(kind) => setDecision({ kind })} disabled={disabled} /></div>
            <Field label="شماره دادنامه" value={data.decision.number} onChange={(number) => setDecision({ number })} disabled={disabled} inputMode="numeric" ltr />
            <DateField label="تاریخ دادنامه" value={data.decision.date} onChange={(date) => setDecision({ date })} disabled={disabled} />
            <Field label="دادگاه صادرکننده" value={data.decision.court} onChange={(court) => setDecision({ court })} disabled={disabled} />
            <Field label="شعبه صادرکننده" value={data.decision.branch} onChange={(branch) => setDecision({ branch })} disabled={disabled} />
            <DateField label="تاریخ ابلاغ رأی" value={data.decision.serviceDate} onChange={(serviceDate) => setDecision({ serviceDate })} disabled={disabled} hint="آغاز مهلت از همین تاریخ حساب می‌شود." />
          </div>
        </Card>
      )}
      {spec.kind === "INCIDENTAL" && (
        <Card title="پرونده اصلی" icon={<ScrollText />}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="کلاسه پرونده" value={data.mainCase.number} onChange={(number) => setMain({ number })} disabled={disabled} ltr />
            <Field label="دادگاه" value={data.mainCase.court} onChange={(court) => setMain({ court })} disabled={disabled} />
            <Field label="شعبه" value={data.mainCase.branch} onChange={(branch) => setMain({ branch })} disabled={disabled} />
            <Field label="خواهان دعوای اصلی" value={data.mainCase.plaintiff} onChange={(plaintiff) => setMain({ plaintiff })} disabled={disabled} />
            <Field label="خوانده دعوای اصلی" value={data.mainCase.defendant} onChange={(defendant) => setMain({ defendant })} disabled={disabled} />
            <Field label="خواسته دعوای اصلی" value={data.mainCase.subject} onChange={(subject) => setMain({ subject })} disabled={disabled} />
          </div>
        </Card>
      )}
      {spec.deadlineRuleKey && (
        <div className="flex flex-col gap-2">
          <Check checked={data.abroad} onChange={(abroad) => onChange({ ...data, abroad })} disabled={disabled} label="دادخواست‌دهنده مقیم خارج از کشور است" detail="برای مهلت‌هایی که برای مقیم خارج مدت جداگانه دارند." />
          <DeadlineCard deadline={deadline} loading={deadlineLoading} />
        </div>
      )}
    </div>
  );
}

const isLong = (label: string) => LONG_WORDS.some((w) => label.includes(w));

export function BodyStep({ spec, data, onChange, disabled, checks }: StepProps) {
  const blanks = userBlanks(spec);
  const body = fillBody(spec, data);
  const setBlank = (key: string, v: string) => onChange({ ...data, blanks: { ...data.blanks, [key]: v } });
  const toggleClause = (condition: string, on: boolean) => onChange({ ...data, clauses: on ? [...data.clauses, condition] : data.clauses.filter((c) => c !== condition) });
  return (
    <div className="flex flex-col gap-4">
      <Card title="جاهای خالی شرح خواسته" icon={<ScrollText />} note="بند ۴ و ۵ ماده ۵۱: جهات استحقاق به‌گونه‌ای که مقصود روشن باشد، و آنچه از دادگاه درخواست می‌شود.">
        <CheckNotes checks={checks} ids={["body.grounds", "body.request"]} />
        {blanks.length === 0 ? <p className="text-sm text-ink-3">متن این نوع جای خالی دستی ندارد؛ بخش‌های پیوندی از اطلاعات دیگر پر می‌شود.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {blanks.map((b, i) => b.includes(DATE_WORD) && !isLong(b)
              ? <DateField key={b} label={b} value={data.blanks[b] ?? ""} onChange={(v) => setBlank(b, v)} disabled={disabled} />
              : <Field key={b} id={`blank-${i}`} label={b} value={data.blanks[b] ?? ""} onChange={(v) => setBlank(b, v)} disabled={disabled} multiline={isLong(b)}
                rows={LONG_BLANK_ROWS} className={cn(isLong(b) && "sm:col-span-2")} invalid={body.unfilled.includes(b)} />)}
          </div>
        )}
      </Card>
      {spec.optionalClauses.length > 0 && (
        <Card title="بندهای اختیاری" note="هر بند در صورت انتخاب پیش از عبارت پایانی به متن افزوده می‌شود.">
          <div className="flex flex-col gap-1">
            {spec.optionalClauses.map((c) => <Check key={c.condition} checked={data.clauses.includes(c.condition)} onChange={(on) => toggleClause(c.condition, on)} disabled={disabled} label={c.condition} detail={c.text} />)}
          </div>
        </Card>
      )}
      <Card title="متن نهایی شرح خواسته" note={body.unfilled.length > 0 ? `${toFaDigits(body.unfilled.length)} جای خالی پر نشده است.` : "همه جاهای خالی پر شده است."}>
        <div className="sheet-paper rounded-card p-4 text-[15px] leading-8">
          {body.lines.map((line, i) => (
            <p key={`${i}-${line.length}`} className="min-h-[1.5em]">
              {line.split(EMPTY_BLANK).flatMap((seg, j) => (j === 0
                ? [<span key={`t${j}`}>{seg}</span>]
                : [<mark key={`m${j}`} className="rounded bg-zafaran-50 px-1 text-zafaran">{EMPTY_BLANK}</mark>, <span key={`t${j}`}>{seg}</span>]))}
            </p>
          ))}
        </div>
      </Card>
    </div>
  );
}
