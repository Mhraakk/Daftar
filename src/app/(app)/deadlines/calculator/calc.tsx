"use client";
import { Calculator, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { JalaliDateInput } from "@/components/ui/date-picker";
import { Lookup } from "@/components/ui/lookup";
import { Notice } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { createDeadlineAction, suggestDeadlineAction } from "../actions";

interface Rule { key: string; title: string; basis: string; days: number; monthsAbroad: number | null; verified: boolean; description: string | null }
interface Suggestion { rule: { key: string; title: string; basis: string; verified: boolean; period: string }; dueDate: string; dueDateLabel: string; explanation: string[]; holidaysKnown: number }

export function DeadlineCalculator({ rules, caseId, caseLabel }: { rules: Rule[]; caseId?: string; caseLabel?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [ruleKey, setRuleKey] = useState(rules[0]?.key ?? "");
  const [triggerDate, setTriggerDate] = useState("");
  const [abroad, setAbroad] = useState(false);
  const [theCase, setCase] = useState(caseId ?? "");
  const [s, setS] = useState<Suggestion | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rule = rules.find((r) => r.key === ruleKey);

  const calc = () => start(async () => {
    setErr(null); setS(null);
    const r = await suggestDeadlineAction({ ruleKey, triggerDate, abroad });
    if (!r.ok) { setErr(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.error); return; }
    setS(r.data as Suggestion);
  });
  const save = () => start(async () => {
    if (!s) return;
    const r = await createDeadlineAction({
      title: `${s.rule.title}`, type: s.rule.key.includes("OBJECTION") ? "OBJECTION" : s.rule.key.includes("APPEAL") || s.rule.key.includes("CASSATION") ? "APPEAL" : "RESPONSE",
      dueDate: s.dueDate, dueTime: "23:59", caseId: theCase, priority: "HIGH", isLegal: true, legalBasis: s.rule.basis, source: "RULE", ruleKey: s.rule.key, triggerDate,
      reminderOffsets: ["10080", "4320", "1440", "120"], description: `محاسبه از تاریخ ابلاغ ${triggerDate} (${s.rule.period}${abroad ? "، مقیم خارج از کشور" : ""}).\n${s.explanation.join("\n")}`,
    });
    if (!r.ok) { setErr(r.error); return; }
    toast.success("مهلت با وضعیت «نیازمند تأیید» ثبت شد.");
    router.push(theCase ? `/cases/${theCase}?tab=deadlines` : "/deadlines?view=unverified");
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel p-4">
        <div className="flex flex-col gap-3.5">
          <label className="block"><span className="mb-1 block text-sm font-medium text-ink-2">نوع مهلت</span>
            <select className="input" value={ruleKey} onChange={(e) => { setRuleKey(e.target.value); setS(null); }}>{rules.map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}</select></label>
          {rule && <div className="rounded-md border border-line bg-surface-2/60 p-3 text-sm leading-7"><p><span className="text-ink-3">مستند:</span> {rule.basis}</p>{rule.description && <p className="text-ink-2">{rule.description}</p>}
            <p className={rule.verified ? "text-sabz" : "text-zafaran"}>{rule.verified ? "این قاعده توسط مسئول حقوقی دفتر تأیید شده است." : "این قاعده هنوز توسط مسئول حقوقی دفتر با متن رسمی قانون تطبیق و تأیید نشده است."}</p></div>}
          <label className="block"><span className="mb-1 block text-sm font-medium text-ink-2">تاریخ ابلاغ <span className="text-mohr">*</span></span><JalaliDateInput value={triggerDate} onChange={(v) => { setTriggerDate(v); setS(null); }} /></label>
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={abroad} onChange={(e) => { setAbroad(e.target.checked); setS(null); }} className="size-4 accent-[rgb(var(--firuze))]" disabled={!rule?.monthsAbroad} />
            <span>مخاطب مقیم خارج از کشور است{!rule?.monthsAbroad && <span className="text-xs text-ink-3"> (برای این قاعده تعریف نشده)</span>}</span></label>
          <label className="block"><span className="mb-1 block text-sm font-medium text-ink-2">پرونده مرتبط</span><Lookup type="case" value={theCase} onChange={setCase} initialLabel={caseLabel} placeholder="انتخاب پرونده (اختیاری)" /></label>
          {err && <p role="alert" className="rounded-md border border-mohr/30 bg-mohr-50 px-3 py-2 text-sm text-mohr">{err}</p>}
          <Button variant="primary" onClick={calc} loading={pending && !s} disabled={!triggerDate || !ruleKey}><Calculator />محاسبه</Button>
        </div>
      </div>
      <div className="panel p-4">
        {!s ? <p className="py-10 text-center text-sm text-ink-3">نوع مهلت و تاریخ ابلاغ را وارد کنید تا موعد پیشنهادی محاسبه شود.</p> : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-2">آخرین روز مهلت (پیشنهادی)</p>
            <p className="text-2xl font-extrabold text-lapis">{s.dueDateLabel}</p>
            <ul className="list-disc ps-5 text-sm leading-7 text-ink-2">{s.explanation.map((x, i) => <li key={i}>{x}</li>)}</ul>
            {s.holidaysKnown === 0 && <Notice tone="warning">تعطیلات رسمی در تنظیمات دفتر ثبت نشده است؛ فقط جمعه‌ها در محاسبه لحاظ شده‌اند.</Notice>}
            <Notice tone="warning" title="این تاریخ قطعی نیست">سامانه موعد قانونی را به‌طور خودکار قطعی نمی‌کند. مهلت با برچسب «نیازمند تأیید» ثبت می‌شود و کارمند دارای مجوز باید آن را با قانون حاکم، نوع ابلاغ و تعطیلات تطبیق و تأیید کند.</Notice>
            <Button variant="accent" onClick={save} loading={pending}><CircleCheck />ثبت به‌عنوان مهلت (نیازمند تأیید)</Button>
          </div>
        )}
      </div>
    </div>
  );
}
