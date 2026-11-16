"use client";
// انتخاب چند سند برای ارسال به هوش مصنوعی: اسناد پرونده انتخاب‌شده، یا جست‌وجو در اسناد قابل‌دسترسی.
import { FileText, Lock, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export interface PickedDoc { id: string; label: string; sub?: string; confidential?: boolean; hasText?: boolean }

const SEARCH_DELAY_MS = 250;

export function DocumentPicker({ caseId, value, onChange, max, single, initial = [] }: {
  caseId: string; value: string[]; onChange: (ids: string[], docs: PickedDoc[]) => void; max: number; single?: boolean; initial?: PickedDoc[];
}) {
  const [items, setItems] = useState<PickedDoc[]>(initial);
  const [known, setKnown] = useState<Record<string, PickedDoc>>(() => Object.fromEntries(initial.map((d) => [d.id, d])));
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ type: "document", q, ...(caseId ? { caseId } : {}) });
        const res = await fetch(`/api/lookup?${params.toString()}`, { signal: ctrl.signal });
        const data = (await res.json()) as { items: PickedDoc[] };
        setItems(data.items);
        setKnown((k) => ({ ...k, ...Object.fromEntries(data.items.map((d) => [d.id, d])) }));
      } catch {
        // درخواست قبلی لغو شد
      } finally {
        setLoading(false);
      }
    }, SEARCH_DELAY_MS);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [caseId, q]);

  const nextSelection = (id: string): string[] => {
    const has = value.includes(id);
    if (single) return has ? [] : [id];
    return has ? value.filter((x) => x !== id) : [...value, id].slice(0, max);
  };
  const toggle = (d: PickedDoc) => {
    const next = nextSelection(d.id);
    onChange(next, next.map((id) => known[id] ?? { id, label: id }));
  };

  return (
    <div className="rounded-lg border border-line">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Search className="size-4 text-ink-3" />
        <input className="w-full bg-transparent text-sm outline-none" placeholder={caseId ? "جست‌وجو در اسناد این پرونده…" : "جست‌وجوی سند با عنوان یا کد…"} value={q} onChange={(e) => setQ(e.target.value)} aria-label="جست‌وجوی سند" />
        {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent text-ink-3" aria-hidden />}
      </div>
      <ul className="max-h-60 overflow-y-auto p-1" data-testid="doc-picker">
        {items.length === 0 && !loading && <li className="px-3 py-3 text-sm text-ink-3">{caseId ? "این پرونده سندی ندارد." : "سندی یافت نشد."}</li>}
        {items.map((d) => {
          const checked = value.includes(d.id);
          return (
            <li key={d.id}>
              <label className={cn("flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-surface-2", !d.hasText && "opacity-60")}>
                <input type={single ? "radio" : "checkbox"} className="mt-1" checked={checked} disabled={!d.hasText} onChange={() => toggle(d)} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 font-medium">{d.confidential ? <Lock className="size-3.5 text-mohr" /> : <FileText className="size-3.5 text-ink-3" />}{d.label}</span>
                  {d.sub && <span className="block truncate text-xs text-ink-3">{d.sub}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
