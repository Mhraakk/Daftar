"use client";
import { Bookmark, History, Trash2 } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { FormDialog } from "@/components/ui/form-dialog";
import { toFaDigits } from "@/lib/text";
import { deleteSavedSearchAction, saveSearchAction } from "./actions";

export function SearchTools({ q, type, history, saved }: { q: string; type?: string; history: { id: string; query: string; results: number }[]; saved: { id: string; name: string; query: { q: string; type?: string } }[] }) {
  return (
    <aside className="flex flex-col gap-4">
      <section className="panel p-4">
        <h2 className="mb-2 flex items-center gap-2 text-md"><Bookmark className="size-4 text-firuze" />جست‌وجوهای ذخیره‌شده</h2>
        {saved.length === 0 ? <p className="text-sm text-ink-3">موردی ذخیره نشده است.</p> : (
          <ul className="flex flex-col gap-1">{saved.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-1">
              <Link href={`/search?q=${encodeURIComponent(s.query.q)}${s.query.type ? `&type=${s.query.type}` : ""}`} className="truncate text-lapis hover:underline">{s.name}</Link>
              <ActionButton action={deleteSavedSearchAction} payload={{ id: s.id }} size="icon" variant="ghost" aria-label="حذف" successMessage="حذف شد."><Trash2 /></ActionButton>
            </li>))}</ul>
        )}
        {q.length >= 2 && <div className="mt-3"><FormDialog trigger="ذخیره این جست‌وجو" triggerVariant="secondary" triggerSize="sm" title="ذخیره جست‌وجو" size="sm" cols={1} action={saveSearchAction} hidden={{ q, type }} successMessage="ذخیره شد." fields={[{ name: "name", label: "نام", required: true }]} initial={{ name: q }} /></div>}
      </section>
      <section className="panel p-4">
        <h2 className="mb-2 flex items-center gap-2 text-md"><History className="size-4 text-firuze" />جست‌وجوهای اخیر</h2>
        {history.length === 0 ? <p className="text-sm text-ink-3">سابقه‌ای وجود ندارد.</p> : (
          <ul className="flex flex-col gap-1">{history.map((h) => <li key={h.id} className="flex justify-between gap-2"><Link href={`/search?q=${encodeURIComponent(h.query)}`} className="truncate hover:text-lapis">{h.query}</Link><span className="num text-xs text-ink-3">{toFaDigits(h.results)}</span></li>)}</ul>
        )}
      </section>
    </aside>
  );
}
