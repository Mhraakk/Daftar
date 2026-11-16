import { ACTION_LABELS } from "@/lib/labels";
import { formatJalali, relativeTime } from "@/lib/jalali";
import { EmptyState } from "./page";
import { History } from "lucide-react";

export interface TimelineItem { id: string; action: string; actorName: string | null; entityLabel: string | null; createdAt: Date; detail?: string | null }

export function Timeline({ items, empty = "هنوز فعالیتی ثبت نشده است." }: { items: TimelineItem[]; empty?: string }) {
  if (!items.length) return <EmptyState icon={<History />} title={empty} />;
  return (
    <ol className="relative ms-2 border-s border-line-strong">
      {items.map((it) => (
        <li key={it.id} className="relative pb-4 ps-5 last:pb-0">
          <span className="absolute -start-[5px] top-2 size-2.5 rounded-full border-2 border-surface bg-firuze" aria-hidden />
          <p className="text-base">
            <span className="font-bold">{ACTION_LABELS[it.action] ?? it.action}</span>
            {it.entityLabel && <span className="text-ink-2"> — {it.entityLabel}</span>}
          </p>
          {it.detail && <p className="text-sm text-ink-2">{it.detail}</p>}
          <p className="text-xs text-ink-3" title={formatJalali(it.createdAt, "datetime")}>
            {it.actorName ?? "سامانه"} · {relativeTime(it.createdAt)} · {formatJalali(it.createdAt, "datetime")}
          </p>
        </li>
      ))}
    </ol>
  );
}
