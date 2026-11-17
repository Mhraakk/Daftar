"use client";
// اجزای فرم استودیوی دادخواست: فیلد، گزینه، انتخاب دوتایی، فهرست انتخابی و کارت؛ همه بدون تغییر درجای داده
import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";

const DEFAULT_ROWS = 3;

/** جایگزینی، حذف و جابه‌جایی عضو فهرست بدون تغییر فهرست اصلی */
export const replaceAt = <T,>(list: readonly T[], i: number, v: T): T[] => list.map((x, j) => (j === i ? v : x));
export const removeAt = <T,>(list: readonly T[], i: number): T[] => list.filter((_, j) => j !== i);
export function moveBy<T>(list: readonly T[], i: number, by: number): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return [...list];
  const swap = new Map<number, T>([[i, list[j]], [j, list[i]]]);
  return list.map((x, k) => swap.get(k) ?? x);
}

type InputMode = React.HTMLAttributes<HTMLInputElement>["inputMode"];

export function Field({ label, value, onChange, disabled, ltr, placeholder, hint, className, multiline, rows, inputMode, id, invalid }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; ltr?: boolean; placeholder?: string; hint?: React.ReactNode;
  className?: string; multiline?: boolean; rows?: number; inputMode?: InputMode; id?: string; invalid?: boolean;
}) {
  const auto = useId();
  const fid = id ?? auto;
  const cls = cn("input", ltr && "ltr text-left", invalid && "input-error");
  const change = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value);
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={fid} className="mb-1 block text-sm font-medium text-ink-2">{label}</label>
      {multiline
        ? <textarea id={fid} rows={rows ?? DEFAULT_ROWS} value={value} onChange={change} disabled={disabled} placeholder={placeholder} className={cls} />
        : <input id={fid} value={value} onChange={change} disabled={disabled} placeholder={placeholder} inputMode={inputMode} className={cls} />}
      {hint && <p className="mt-1 text-xs leading-5 text-ink-3">{hint}</p>}
    </div>
  );
}

export function Check({ checked, onChange, label, detail, disabled, badge }: {
  checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; detail?: React.ReactNode; disabled?: boolean; badge?: React.ReactNode;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-ctl px-2 py-1.5 hover:bg-ink/[0.03]", disabled && "cursor-default opacity-80")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-1.5 size-4 shrink-0 accent-lapis" />
      <span className="min-w-0 flex-1 text-sm leading-7">{label}{detail && <span className="block text-xs text-ink-3">{detail}</span>}</span>
      {badge}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, disabled }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-ctl bg-ink/[0.06] p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} disabled={disabled} onClick={() => onChange(o.value)}
          className={cn("press rounded-[calc(var(--radius-ctl)-2px)] px-3 py-1.5 text-sm transition-colors", o.value === value ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-2 hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, icon, action, children, className, note }: {
  title: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; note?: React.ReactNode;
}) {
  return (
    <section className={cn("panel p-4 sm:p-5", className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-bold [&_svg]:size-4 [&_svg]:text-ink-3">{icon}{title}</h3>
          {note && <p className="mt-0.5 text-xs leading-5 text-ink-3">{note}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function AddButton({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="press inline-flex items-center gap-1.5 rounded-ctl border border-dashed border-line-strong px-3 py-2 text-sm text-ink-2 hover:border-lapis/50 hover:text-lapis disabled:opacity-50 [&_svg]:size-4">
      <Plus aria-hidden />{children}
    </button>
  );
}

/** گزینه‌های فرم (با تیک) به‌علاوه موردهای افزوده کاربر */
export function PickList({ options, selected, onChange, disabled, addPlaceholder, emptyHint }: {
  options: string[]; selected: string[]; onChange: (v: string[]) => void; disabled?: boolean; addPlaceholder: string; emptyHint?: string;
}) {
  const [draft, setDraft] = useState("");
  const custom = selected.filter((s) => !options.includes(s));
  const toggle = (o: string, on: boolean) => onChange(on ? [...selected, o] : selected.filter((s) => s !== o));
  const add = () => {
    const v = draft.trim();
    if (v && !selected.includes(v)) onChange([...selected, v]);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-1">
      {options.length === 0 && emptyHint && <p className="text-sm text-ink-3">{emptyHint}</p>}
      {options.map((o) => <Check key={o} checked={selected.includes(o)} onChange={(on) => toggle(o, on)} label={o} disabled={disabled} />)}
      {custom.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {custom.map((c) => (
            <li key={c} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-1 pe-1 ps-3 text-sm">
              {c}
              {!disabled && <button type="button" onClick={() => toggle(c, false)} aria-label={`حذف «${c}»`} className="rounded-full p-0.5 text-ink-3 hover:bg-mohr-50 hover:text-mohr"><X className="size-3.5" /></button>}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="mt-2 flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={addPlaceholder} className="input h-9 text-sm"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} aria-label={addPlaceholder} />
          <button type="button" onClick={add} className="press h-9 shrink-0 rounded-ctl border border-line-strong/70 px-3 text-sm hover:bg-surface-2">افزودن</button>
        </div>
      )}
    </div>
  );
}
