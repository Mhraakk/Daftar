// جدول داده استاندارد: caption و scope برای صفحه‌خوان، مرتب‌سازی با پیوند سرستون (در نشانی صفحه، aria-sort)،
// سرستون چسبان درون ظرف پیمایش خود جدول، اعداد هم‌عرض و راست‌چین (انتهای خط)، ردیف جمع و پیوند خروجی Excel.
import { ArrowDownNarrowWide, ArrowUpNarrowWide, ArrowUpDown, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { ariaSort, sortHref, type SortDir, type SortState } from "@/lib/table-sort";

export interface Column<T> {
  key: string;
  label: string;
  numeric?: boolean;
  /** نخستین جهت هنگام کلیک (برای تاریخ و عدد معمولاً نزولی) */
  sortable?: SortDir;
  cell: (row: T) => React.ReactNode;
  total?: React.ReactNode;
  className?: string;
}

const SORT_ICONS: Record<"ascending" | "descending" | "none", typeof ArrowUpDown> = { ascending: ArrowUpNarrowWide, descending: ArrowDownNarrowWide, none: ArrowUpDown };

export function DataTable<T>({ caption, columns, rows, rowKey, sort, path, params = {}, exportHref, empty, maxHeight = "70vh", captionHidden = false }: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sort?: SortState;
  path?: string;
  params?: Record<string, string | undefined>;
  exportHref?: string;
  empty?: React.ReactNode;
  maxHeight?: string;
  captionHidden?: boolean;
}) {
  const hasTotals = columns.some((c) => c.total !== undefined);
  return (
    <div className="flex flex-col gap-2">
      {exportHref && (
        <div className="no-print flex justify-end">
          <a href={exportHref} className="inline-flex items-center gap-1.5 text-xs text-lapis hover:underline"><FileSpreadsheet className="size-4" aria-hidden />خروجی Excel همین فهرست</a>
        </div>
      )}
      <div className="tbl-scroll" style={{ maxHeight }} tabIndex={0} role="region" aria-label={caption}>
        <table className="tbl">
          <caption className={cn("px-3 pb-2 text-start text-sm font-bold text-ink", captionHidden && "sr-only")}>{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const state = sort ? ariaSort(c.key, sort) : "none";
                const Icon = SORT_ICONS[state];
                const label = c.sortable && sort && path
                  ? (
                    <Link href={sortHref(path, params, c.key, sort, c.sortable)} className="inline-flex items-center gap-1 hover:text-ink">
                      {c.label}<Icon className={cn("size-3.5", state === "none" && "opacity-40")} aria-hidden />
                    </Link>
                  )
                  : c.label;
                return <th key={c.key} scope="col" aria-sort={c.sortable ? state : undefined} className={cn(c.numeric && "is-num", c.className)}>{label}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={columns.length} className="py-10 text-center text-sm text-ink-3">{empty ?? "موردی برای نمایش نیست."}</td></tr>}
            {rows.map((r) => (
              <tr key={rowKey(r)}>
                {columns.map((c, i) => (i === 0
                  ? <th key={c.key} scope="row" className={cn("text-start font-normal", c.numeric && "is-num", c.className)}>{c.cell(r)}</th>
                  : <td key={c.key} className={cn(c.numeric && "is-num", c.className)}>{c.cell(r)}</td>))}
              </tr>
            ))}
          </tbody>
          {hasTotals && rows.length > 0 && (
            <tfoot>
              <tr>{columns.map((c, i) => <td key={c.key} className={cn("font-bold", c.numeric && "is-num")}>{i === 0 ? "جمع" : c.total}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
