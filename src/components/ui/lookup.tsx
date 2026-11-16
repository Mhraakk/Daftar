"use client";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface LookupItem { id: string; label: string; sub?: string }
export type LookupType = "user" | "client" | "case" | "department";

/** انتخابگر جست‌وجوپذیر با واکشی از سرور (با رعایت سطح دسترسی کاربر) */
export function Lookup({
  type, value, onChange, initialLabel, placeholder = "انتخاب کنید…", invalid, id, disabled, extraQuery,
}: {
  type: LookupType; value: string; onChange: (id: string, item?: LookupItem) => void; initialLabel?: string;
  placeholder?: string; invalid?: boolean; id?: string; disabled?: boolean; extraQuery?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState(initialLabel ?? "");
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => { if (!value) setLabel(""); }, [value]);
  useEffect(() => { if (initialLabel) setLabel(initialLabel); }, [initialLabel]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      setLoading(true);
      try {
        const r = await fetch(`/api/lookup?type=${type}&q=${encodeURIComponent(q)}${extraQuery ? `&${extraQuery}` : ""}`, { signal: ctrl.current.signal });
        if (r.ok) setItems((await r.json()).items);
      } catch { /* لغو درخواست */ } finally { setLoading(false); }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open, type, extraQuery]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className="relative">
        <Popover.Trigger asChild>
          <button id={id} type="button" disabled={disabled} role="combobox" aria-expanded={open}
            className={cn("input flex items-center justify-between gap-2 text-start", invalid && "input-error", !label && "text-ink-3")}>
            <span className="truncate">{label || placeholder}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-ink-3" />
          </button>
        </Popover.Trigger>
        {value && !disabled && (
          <button type="button" aria-label="حذف انتخاب" onClick={() => { onChange(""); setLabel(""); }}
            className="absolute end-8 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-3 hover:text-mohr"><X className="size-3.5" /></button>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} dir="rtl"
          className="z-[60] w-[var(--radix-popover-trigger-width)] min-w-[260px] animate-rise-in rounded-lg border border-line bg-surface shadow-pop">
          <div className="relative border-b border-line p-2">
            <Search className="absolute start-4 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو…" className="input h-9 ps-8" />
          </div>
          <ul className="max-h-60 overflow-y-auto p-1" role="listbox">
            {loading && items.length === 0 && <li className="px-3 py-3 text-sm text-ink-3">در حال جست‌وجو…</li>}
            {!loading && items.length === 0 && <li className="px-3 py-3 text-sm text-ink-3">موردی یافت نشد.</li>}
            {items.map((it) => (
              <li key={it.id}>
                <button type="button" role="option" aria-selected={it.id === value}
                  onClick={() => { onChange(it.id, it); setLabel(it.label); setOpen(false); setQ(""); }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-start hover:bg-firuze-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{it.label}</span>
                    {it.sub && <span className="block truncate text-xs text-ink-3">{it.sub}</span>}
                  </span>
                  {it.id === value && <Check className="size-4 text-firuze" />}
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
