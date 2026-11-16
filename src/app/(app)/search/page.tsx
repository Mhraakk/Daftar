import { Search as SearchIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { requireUser } from "@/lib/auth/guard";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { faNum } from "@/lib/text";
import { ENTITY_LABELS, recordSearch, searchInternal } from "@/server/search";
import { SearchTools } from "./tools";

export const metadata = { title: "جست‌وجو" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const types = sp.type ? [sp.type] : undefined;
  const hits = q.length >= 2 ? await searchInternal(user, q, { types, limit: 60 }) : [];
  if (q.length >= 2) await recordSearch(user, q, hits.length);
  const [history, saved] = await Promise.all([
    db.searchHistory.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.savedSearch.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const all = q.length >= 2 && types ? await searchInternal(user, q, { limit: 60 }) : hits;
  const counts = new Map<string, number>();
  for (const h of all) counts.set(h.type, (counts.get(h.type) ?? 0) + 1);
  return (
    <>
      <PageHeader title="جست‌وجوی یکپارچه" subtitle="جست‌وجوی متنی فارسی در مراجعان، پرونده‌ها، اسناد (متن فایل‌ها)، مکاتبات، وظایف و اسناد حقوقی — فقط در محدوده دسترسی شما" />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="panel min-w-0">
          <form action="/search" className="flex gap-2 border-b border-line p-3">
            <div className="relative flex-1"><SearchIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><input name="q" defaultValue={q} autoFocus placeholder="عبارت جست‌وجو…" className="input h-11 ps-9" aria-label="عبارت جست‌وجو" /></div>
            <button className="h-11 rounded-md bg-lapis px-5 font-medium text-white hover:bg-lapis-600">جست‌وجو</button>
          </form>
          {q.length >= 2 && (
            <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2.5">
              <Link href={`/search?q=${encodeURIComponent(q)}`} className={cn("seal", !sp.type ? "seal-accent" : "seal-neutral")}>همه · {faNum(all.length)}</Link>
              {[...counts].map(([t, n]) => <Link key={t} href={`/search?q=${encodeURIComponent(q)}&type=${t}`} className={cn("seal", sp.type === t ? "seal-accent" : "seal-neutral")}>{ENTITY_LABELS[t]} · {faNum(n)}</Link>)}
            </div>
          )}
          {q.length < 2 ? <EmptyState icon={<SearchIcon />} title="عبارتی برای جست‌وجو وارد کنید" hint="نام، کد ملی، شماره پرونده، بخشی از متن یک سند یا موضوع مکاتبه." />
            : hits.length === 0 ? <EmptyState icon={<SearchIcon />} title="نتیجه‌ای یافت نشد" hint="املای عبارت را بررسی کنید یا عبارت کوتاه‌تری امتحان کنید. نگارش‌های مختلف «ی/ک» و نیم‌فاصله یکسان در نظر گرفته می‌شوند." /> : (
              <ul>
                {hits.map((h) => (
                  <li key={h.type + h.id} className="border-b border-line px-4 py-3 last:border-0">
                    <div className="flex items-center gap-2"><Seal>{h.typeLabel}</Seal><Link href={h.link} className="truncate font-bold hover:text-lapis">{h.title}</Link></div>
                    {h.subtitle && <p className="mt-0.5 truncate text-sm text-ink-2">{h.subtitle}</p>}
                    {h.snippet && <p className="mt-0.5 line-clamp-2 text-sm leading-6 text-ink-3">{h.snippet}</p>}
                    <p className="mt-1 text-2xs text-ink-3">منبع: {h.source} · آخرین به‌روزرسانی {formatJalali(h.updatedAt, "datetime")}</p>
                  </li>
                ))}
              </ul>
            )}
        </div>
        <SearchTools q={q} type={sp.type} history={history.map((h) => ({ id: h.id, query: h.query, results: h.results }))} saved={saved.map((s) => ({ id: s.id, name: s.name, query: s.query as { q: string; type?: string } }))} />
      </div>
    </>
  );
}
