import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { faNum } from "@/lib/text";
import { cn } from "@/lib/cn";

export function Pagination({ page, pageSize, total, params, basePath }: { page: number; pageSize: number; total: number; params: Record<string, string | undefined>; basePath: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const btn = "flex size-8 items-center justify-center rounded-md border border-line-strong bg-surface text-ink-2 hover:bg-surface-2";
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-sm text-ink-2">
      <span className="num">
        {faNum((page - 1) * pageSize + 1)} تا {faNum(Math.min(page * pageSize, total))} از {faNum(total)} مورد
      </span>
      <div className="flex items-center gap-1.5">
        {page > 1 ? <Link href={href(page - 1)} className={btn} aria-label="صفحه قبل"><ChevronRight className="size-4" /></Link>
          : <span className={cn(btn, "opacity-40")}><ChevronRight className="size-4" /></span>}
        <span className="num px-2">صفحه {faNum(page)} از {faNum(pages)}</span>
        {page < pages ? <Link href={href(page + 1)} className={btn} aria-label="صفحه بعد"><ChevronLeft className="size-4" /></Link>
          : <span className={cn(btn, "opacity-40")}><ChevronLeft className="size-4" /></span>}
      </div>
    </div>
  );
}
