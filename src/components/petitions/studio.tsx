"use client";
// استودیوی دادخواست: تکمیل گام‌به‌گام داده، پیش‌نمایش زنده برگ A4، حلقه بررسی ماده ۵۱ و ۵۳، مهلت زنده و ذخیره نسخه‌دار.
// ذخیره دستی است (دکمه یا Ctrl/⌘+S) چون هر تغییر برگ یک نسخه شماره‌دار می‌سازد؛ خروج با تغییر ذخیره‌نشده هشدار می‌دهد.
import { ChevronLeft, ChevronRight, ClipboardCopy, Eye, FileDown, Landmark, ListPlus, Paperclip, PenLine, Save, Scale, ScrollText, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { petitionDeadlineAction, savePetitionAction } from "@/app/(app)/petitions/actions";
import { Ring } from "@/components/charts";
import { Button, buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { toFaDigits } from "@/lib/text";
import type { PetitionData, PetitionSpec } from "@/server/petitions/data";
import type { PetitionDeadline } from "@/server/petitions/drafting";
import { renderPetitionHtml, sideLabels } from "@/server/petitions/render";
import { validatePetition, type PetitionCheck } from "@/server/petitions/validate";
import { PartiesEditor } from "./party-editor";
import { BodyStep, ClaimStep, CourtStep, EvidenceStep, ExtrasStep } from "./studio-steps";
import { countSteps, stepOf, systemRows, type StepId } from "./studio-model";
import { ChecksPanel, CopyForSystem, DeadlineCard } from "./studio-review";
import { Card } from "./studio-ui";

const STEPS: { id: StepId; label: string; icon: typeof Users }[] = [
  { id: "parties", label: "طرفین", icon: Users },
  { id: "claim", label: "خواسته و بها", icon: Scale },
  { id: "evidence", label: "دلایل و گواهان", icon: Paperclip },
  { id: "extras", label: "تحقیقات و فرعی", icon: ListPlus },
  { id: "court", label: "مرجع و سوابق", icon: Landmark },
  { id: "body", label: "شرح خواسته", icon: ScrollText },
  { id: "review", label: "بازبینی", icon: ShieldCheck },
];
const DEADLINE_DEBOUNCE_MS = 500;
const RING_SIZE = 46;
const FIRST_SESSION = "تاریخ جلسه اول";
/** عرض و ارتفاع برگ A4 در ۹۶ نقطه بر اینچ (۲۱۰×۲۹۷ میلی‌متر) */
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

function Stepper({ step, onStep, missing }: { step: StepId; onStep: (s: StepId) => void; missing: Partial<Record<StepId, number>> }) {
  return (
    <nav aria-label="گام‌های دادخواست" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const n = missing[s.id] ?? 0;
        const active = s.id === step;
        return (
          <button key={s.id} type="button" onClick={() => onStep(s.id)} aria-current={active ? "step" : undefined}
            className={cn("press flex shrink-0 items-center gap-2 rounded-ctl px-3 py-2 text-sm transition-colors", active ? "bg-night text-on-night" : "text-ink-2 hover:bg-ink/5 hover:text-ink")}>
            <span className={cn("flex size-6 items-center justify-center rounded-full text-xs", active ? "bg-on-night/15" : "bg-ink/[0.06]")}><Icon className="size-3.5" aria-hidden /></span>
            <span className="whitespace-nowrap">{toFaDigits(i + 1)}. {s.label}</span>
            {n > 0 && <span className="num rounded-full bg-mohr px-1.5 text-2xs font-bold leading-5 text-on-mohr" aria-label={`${toFaDigits(n)} مورد ناقص`}>{toFaDigits(n)}</span>}
          </button>
        );
      })}
    </nav>
  );
}

/** برگ A4 با اندازه واقعی که با تغییر مقیاس در ستون پیش‌نمایش جا می‌شود (مانند نمای صفحه در نرم‌افزار واژه‌پرداز) */
function ScaledSheet({ html }: { html: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 0 });
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return undefined;
    const measure = () => {
      const scale = Math.min(1, o.clientWidth / A4_WIDTH_PX);
      setBox({ scale, height: i.offsetHeight * scale });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    measure();
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} className="relative overflow-hidden" style={{ height: box.height || undefined }}>
      <div ref={inner} className="sheet-paper absolute start-0 top-0 origin-top-right rounded-sm px-[22mm] py-[25mm] shadow-pop"
        style={{ width: A4_WIDTH_PX, minHeight: A4_HEIGHT_PX, transform: `scale(${box.scale})` }}>
        {/* renderPetitionHtml همه مقادیر کاربر را escape می‌کند (esc/show)؛ سرور همین برگ را پیش از ذخیره sanitize هم می‌کند */}
        <div className="legal-doc" dir="rtl" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}

function SaveState({ dirty, saving, error, editable }: { dirty: boolean; saving: boolean; error: string | null; editable: boolean }) {
  if (!editable) return <span className="text-xs text-ink-3">فقط خواندنی</span>;
  if (saving) return <span className="text-xs text-ink-3">در حال ذخیره…</span>;
  if (error) return <span className="max-w-60 truncate text-xs text-mohr" title={error}>{error}</span>;
  return <span className={cn("text-xs", dirty ? "text-zafaran" : "text-sabz")}>{dirty ? "تغییرات ذخیره‌نشده" : "ذخیره شده"}</span>;
}

export function PetitionStudio({ draftId, version, editable, spec, initialData, initialDeadline }: {
  draftId: string; version: number; editable: boolean; spec: PetitionSpec; initialData: PetitionData; initialDeadline: PetitionDeadline;
}) {
  const toast = useToast();
  const [data, setData] = useState(initialData);
  const [saved, setSaved] = useState(initialData);
  const [ver, setVer] = useState(version);
  const [step, setStep] = useState<StepId>("parties");
  const [pane, setPane] = useState<"form" | "preview">("form");
  const [deadline, setDeadline] = useState(initialDeadline);
  const [deadlineLoading, setDeadlineLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const latest = useRef(data);
  const sides = sideLabels(spec);
  const dirty = useMemo(() => JSON.stringify(data) !== JSON.stringify(saved), [data, saved]);
  const validation = useMemo(() => validatePetition(spec, data), [spec, data]);
  const html = useMemo(() => renderPetitionHtml(spec, data), [spec, data]);
  const rows = useMemo(() => systemRows(spec, data, sides), [spec, data, sides]);
  const missing = useMemo(() => countSteps(validation.checks), [validation]);
  const disabled = !editable;

  useEffect(() => { latest.current = data; }, [data]);

  const save = useCallback(() => {
    if (!editable || saving) return;
    const snapshot = latest.current;
    setError(null);
    startSave(async () => {
      const r = await savePetitionAction({ id: draftId, version: ver, data: snapshot });
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      setVer(r.data.version);
      setSaved(snapshot);
      setDeadline(r.data.deadline);
      toast.success(`ذخیره شد — نسخه ${toFaDigits(r.data.versionNo)}`);
    });
  }, [draftId, editable, saving, toast, ver]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  useEffect(() => {
    if (!dirty) return undefined;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  // مهلت زنده: با تغییر تاریخ ابلاغ، تاریخ جلسه اول یا اقامت خارج، روز آخر دوباره از سرور (تقویم تعطیلات) گرفته می‌شود
  const trigger = `${data.decision.serviceDate}|${data.blanks[FIRST_SESSION] ?? ""}|${data.abroad}`;
  const firstTrigger = useRef(trigger);
  useEffect(() => {
    if (!spec.deadlineRuleKey || trigger === firstTrigger.current) return undefined;
    let cancelled = false;
    setDeadlineLoading(true);
    const run = async () => {
      const r = await petitionDeadlineAction({ id: draftId, data: latest.current });
      if (cancelled) return;
      setDeadlineLoading(false);
      if (r.ok) setDeadline(r.data);
    };
    const timer = setTimeout(() => { void run(); }, DEADLINE_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [draftId, spec.deadlineRuleKey, trigger]);

  const index = STEPS.findIndex((s) => s.id === step);
  const go = (s: StepId) => { setStep(s); setPane("form"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const goCheck = (c: PetitionCheck) => go(stepOf(c.field));
  const stepProps = { spec, data, onChange: setData, disabled, checks: validation.checks };
  const views: Record<StepId, () => React.ReactNode> = {
    parties: () => <PartiesEditor data={data} onChange={setData} sides={sides} disabled={disabled} checks={validation.checks} />,
    claim: () => <ClaimStep {...stepProps} />,
    evidence: () => <EvidenceStep {...stepProps} />,
    extras: () => <ExtrasStep {...stepProps} />,
    court: () => <CourtStep {...stepProps} deadline={deadline} deadlineLoading={deadlineLoading} />,
    body: () => <BodyStep {...stepProps} />,
    review: () => (
      <div className="flex flex-col gap-4">
        <Card title="بررسی شکلی دادخواست" icon={<ShieldCheck />} note="هر بررسی به ماده و بند قانون آیین دادرسی مدنی و عبارت دقیق آن پیوند دارد. بررسی جای نظر حقوقی را نمی‌گیرد.">
          <ChecksPanel validation={validation} lawCode={spec.lawCode} onGo={goCheck} />
        </Card>
        <DeadlineCard deadline={deadline} loading={deadlineLoading} />
        <Card title="کپی برای ثبت در سامانه" icon={<ClipboardCopy />} note="مقدار هر خانه را جداگانه کپی و در سامانه ثبت دادخواست وارد کنید.">
          <CopyForSystem rows={rows} />
        </Card>
        <Card title="خروجی و گردش کار" icon={<FileDown />} note="خروجی از آخرین نسخه ذخیره‌شده ساخته می‌شود؛ پیش از دریافت ذخیره کنید.">
          <div className="flex flex-wrap gap-2">
            <a href={`/api/drafts/${draftId}/export?format=docx`} className={buttonClass("secondary", "sm")}><FileDown />Word</a>
            <a href={`/api/drafts/${draftId}/export?format=pdf&inline=1`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}><FileDown />PDF</a>
            <Link href={`/drafts/${draftId}`} className={buttonClass("primary", "sm")}><PenLine />ارسال برای بررسی و نهایی‌سازی</Link>
          </div>
        </Card>
      </div>
    ),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="panel z-20 flex flex-col gap-2 px-3 py-2.5 md:sticky md:top-14">
        <div className="flex flex-wrap items-center gap-3">
          <Ring ratio={validation.required ? validation.ok / validation.required : 1} label="بررسی ماده ۵۱ و ۵۳" size={RING_SIZE} token={validation.missing ? "chart-1" : "chart-pos"}
            center={`${toFaDigits(validation.ok)}/${toFaDigits(validation.required)}`} />
          <button type="button" onClick={() => go("review")} className="min-w-[11rem] flex-1 text-start">
            <p className="text-sm font-bold">{validation.missing ? `${toFaDigits(validation.missing)} الزام ناقص` : "الزام‌های شکلی کامل است"}</p>
            <p className="text-xs text-ink-3">{toFaDigits(validation.warnings)} مورد نیازمند توجه · مشاهده بررسی‌ها</p>
          </button>
          <div className="ms-auto flex flex-wrap items-center gap-2">
          <SaveState dirty={dirty} saving={saving} error={error} editable={editable} />
          <div className="flex rounded-ctl bg-ink/[0.06] p-0.5 xl:hidden" role="tablist" aria-label="نما">
            <button type="button" role="tab" aria-selected={pane === "form"} onClick={() => setPane("form")} className={cn("rounded-[calc(var(--radius-ctl)-2px)] px-2.5 py-1 text-sm", pane === "form" && "bg-surface shadow-sm")}>فرم</button>
            <button type="button" role="tab" aria-selected={pane === "preview"} onClick={() => setPane("preview")} className={cn("flex items-center gap-1 rounded-[calc(var(--radius-ctl)-2px)] px-2.5 py-1 text-sm", pane === "preview" && "bg-surface shadow-sm")}><Eye className="size-3.5" aria-hidden />برگ</button>
          </div>
          {editable && <Button variant="primary" size="sm" onClick={save} disabled={!dirty || saving} title="Ctrl+S"><Save />ذخیره</Button>}
          </div>
        </div>
        <Stepper step={step} onStep={go} missing={missing} />
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className={cn("min-w-0", pane === "preview" && "hidden xl:block")}>
          {views[step]()}
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => go(STEPS[index - 1]?.id ?? step)} disabled={index === 0}><ChevronRight />گام قبل</Button>
            {index < STEPS.length - 1 && <Button variant="secondary" onClick={() => go(STEPS[index + 1].id)}>گام بعد: {STEPS[index + 1].label}<ChevronLeft /></Button>}
          </div>
        </div>
        <aside aria-label="پیش‌نمایش برگ دادخواست" className={cn("min-w-0 xl:sticky xl:top-48", pane === "form" && "hidden xl:block")}>
          <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto rounded-card border border-line-strong bg-ink/[0.04] p-3">
            <ScaledSheet html={html} />
          </div>
          <p className="mt-2 text-center text-xs text-ink-3">پیش‌نمایش زنده؛ برگ نهایی با سربرگ دفتر در Word و PDF ساخته می‌شود.</p>
        </aside>
      </div>
    </div>
  );
}
