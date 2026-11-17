"use client";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { J_MONTHS, J_WEEKDAYS_SHORT, isValidJalali, jParts, monthMatrix, shiftMonth } from "@/lib/jalali";
import { toEnDigits, toFaDigits } from "@/lib/text";

const p2 = (n: number) => String(n).padStart(2, "0");

/** ورودی تاریخ شمسی: مقدار به شکل «1405/08/25» (ارقام لاتین) نگهداری می‌شود. */
export function JalaliDateInput({
  value, onChange, id, invalid, placeholder = "مثلاً ۱۴۰۵/۰۸/۲۵", disabled,
}: { value: string; onChange: (v: string) => void; id?: string; invalid?: boolean; placeholder?: string; disabled?: boolean }) {
  const today = useMemo(() => jParts(new Date()), []);
  const parsed = useMemo(() => {
    const m = toEnDigits(value || "").match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!m) return null;
    const [jy, jm, jd] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidJalali(jy, jm, jd) ? { jy, jm, jd } : null;
  }, [value]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ jy: parsed?.jy ?? today.jy, jm: parsed?.jm ?? today.jm });
  const weeks = monthMatrix(view.jy, view.jm);

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) setView({ jy: parsed?.jy ?? today.jy, jm: parsed?.jm ?? today.jm }); }}>
      <div className="relative">
        <input id={id} dir="ltr" inputMode="numeric" autoComplete="off" disabled={disabled}
          value={toFaDigits(value)} placeholder={placeholder}
          onChange={(e) => onChange(toEnDigits(e.target.value).replace(/[^\d/]/g, "").slice(0, 10))}
          className={cn("input pe-10 text-right", invalid && "input-error")} />
        <Popover.Trigger asChild>
          <button type="button" disabled={disabled} aria-label="انتخاب از تقویم"
            className="absolute end-1 top-1 flex size-8 items-center justify-center rounded text-ink-3 hover:bg-ink/5 hover:text-firuze">
            <CalendarDays className="size-4" />
          </button>
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} dir="rtl" className="z-[60] w-[292px] animate-rise-in rounded-lg border border-line bg-surface p-3 shadow-pop">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setView((v) => shiftMonth(v.jy, v.jm, -1))} className="rounded p-1.5 hover:bg-ink/5" aria-label="ماه قبل"><ChevronRight className="size-4" /></button>
            <span className="font-bold">{J_MONTHS[view.jm - 1]} {toFaDigits(view.jy)}</span>
            <button type="button" onClick={() => setView((v) => shiftMonth(v.jy, v.jm, 1))} className="rounded p-1.5 hover:bg-ink/5" aria-label="ماه بعد"><ChevronLeft className="size-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {J_WEEKDAYS_SHORT.map((w, i) => <span key={w} className={cn("py-1 text-2xs font-bold", i === 6 ? "text-mohr" : "text-ink-3")}>{w}</span>)}
            {weeks.flat().map((d, i) => {
              if (!d) return <span key={i} />;
              const sel = parsed && parsed.jy === view.jy && parsed.jm === view.jm && parsed.jd === d;
              const isToday = today.jy === view.jy && today.jm === view.jm && today.jd === d;
              return (
                <button key={i} type="button"
                  onClick={() => { onChange(`${view.jy}/${p2(view.jm)}/${p2(d)}`); setOpen(false); }}
                  className={cn("num h-9 rounded text-sm transition-colors hover:bg-firuze-50",
                    i % 7 === 6 && "text-mohr", isToday && "ring-1 ring-inset ring-firuze", sel && "bg-firuze font-bold text-on-firuze hover:bg-firuze")}>
                  {toFaDigits(d)}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between border-t border-line pt-2 text-sm">
            <button type="button" className="text-firuze hover:underline"
              onClick={() => { onChange(`${today.jy}/${p2(today.jm)}/${p2(today.jd)}`); setOpen(false); }}>امروز</button>
            <button type="button" className="text-ink-3 hover:text-ink" onClick={() => { onChange(""); setOpen(false); }}>پاک‌کردن</button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
