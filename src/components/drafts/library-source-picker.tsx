"use client";
// افزودن استناد از کتابخانه حقوقی دفتر به منابع سند؛ فقط مواد قابل استناد (غیرمنسوخ) جست‌وجو می‌شود
import { BookOpenText, Check, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addLibrarySourceAction } from "@/app/(app)/drafts/actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Seal } from "@/components/ui/seal";
import { useToast } from "@/components/ui/toast";
import { SOURCE_STATUS } from "@/lib/labels";

interface Item { id: string; citation: string; title: string; status: string; verified: boolean; snippet: string; lawCode: string | null; articleNo: string | null }

const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;

export function LibrarySourcePicker({ draftId, cited }: { draftId: string; cited: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < MIN_QUERY) return undefined;
    const ctrl = new AbortController();
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/library/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const body = (await res.json()) as { items?: Item[]; error?: string };
        setError(res.ok ? null : body.error ?? "جست‌وجو ناموفق بود.");
        setItems(body.items ?? []);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setError("ارتباط با سرور برقرار نشد.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    };
    const timer = setTimeout(() => { void run(); }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [q, open]);

  const add = (item: Item) => start(async () => {
    const r = await addLibrarySourceAction({ draftId, legalSourceId: item.id });
    if (!r.ok) { toast.error(r.error); return; }
    setAdded((a) => [...a, item.id]);
    toast.success(`«${item.citation}» به منابع افزوده شد.`);
    router.refresh();
  });

  const short = q.trim().length < MIN_QUERY;
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><BookOpenText />از کتابخانه</Button>
      <Modal open={open} onOpenChange={setOpen} title="استناد از کتابخانه حقوقی" size="lg"
        description="ماده یا منبع را با شماره («ماده ۵۱») یا واژه جست‌وجو کنید. مواد منسوخ نمایش داده نمی‌شوند؛ تطبیق نهایی با بررسی‌کننده است.">
        <label className="relative block">
          <span className="sr-only">جست‌وجو در کتابخانه</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="مثلاً «ماده ۳۳۶» یا «تجدیدنظر»" className="input ps-9" />
        </label>
        <div className="mt-3 max-h-[55vh] overflow-y-auto" aria-live="polite" aria-busy={loading}>
          {error && <p className="text-sm text-mohr">{error}</p>}
          {short && <p className="py-6 text-center text-sm text-ink-3">دست‌کم دو نویسه بنویسید.</p>}
          {!short && !loading && !error && items.length === 0 && <p className="py-6 text-center text-sm text-ink-3">منبع قابل استنادی یافت نشد.</p>}
          {!short && (
            <ul className="flex flex-col divide-y divide-line">
              {items.map((it) => {
                const done = added.includes(it.id) || cited.includes(it.id);
                return (
                  <li key={it.id} className="flex items-start gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{it.citation}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm leading-6 text-ink-2">{it.snippet}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {it.status !== "VALID" && <Seal tone="warning">{SOURCE_STATUS[it.status]?.label ?? it.status}</Seal>}
                        <Seal tone={it.verified ? "success" : "neutral"}>{it.verified ? "متن تأییدشده" : "متن تأییدنشده"}</Seal>
                      </div>
                    </div>
                    <Button size="sm" variant={done ? "ghost" : "secondary"} disabled={done || pending} onClick={() => add(it)} aria-label={`افزودن ${it.citation}`}>
                      {done ? <><Check />افزوده شد</> : <><Plus />افزودن</>}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>
    </>
  );
}
