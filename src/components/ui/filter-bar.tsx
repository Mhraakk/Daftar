"use client";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export interface FilterDef { name: string; label: string; options: { value: string; label: string }[] }

/** نوار فیلتر مبتنی بر URL: وضعیت فهرست قابل اشتراک و بازگشت‌پذیر است. */
export function FilterBar({ searchPlaceholder = "جست‌وجو…", filters = [], children }: { searchPlaceholder?: string; filters?: FilterDef[]; children?: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [pending, start] = useTransition();
  const first = useRef(true);

  const apply = (name: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(name, value); else next.delete(name);
    next.delete("page");
    start(() => router.replace(`${path}?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => apply("q", q.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = filters.some((f) => sp.get(f.name)) || !!sp.get("q");
  return (
    <div className="no-print flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="input ps-9" aria-label="جست‌وجو" />
        {pending && <span className="absolute end-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-firuze border-t-transparent" />}
      </div>
      {filters.map((f) => (
        <select key={f.name} value={sp.get(f.name) ?? ""} onChange={(e) => apply(f.name, e.target.value)} className="input w-auto min-w-[130px]" aria-label={f.label}>
          <option value="">{f.label}: همه</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
      {children}
      {active && (
        <button onClick={() => { setQ(""); start(() => router.replace(path, { scroll: false })); }}
          className="flex h-10 items-center gap-1 rounded-md px-2 text-sm text-ink-2 hover:bg-ink/5">
          <X className="size-4" /> حذف فیلترها
        </button>
      )}
    </div>
  );
}
