import { Bell } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { requireUser } from "@/lib/auth/guard";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";

export const metadata = { title: "اعلان‌ها" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const page = Math.max(1, Number((await searchParams).page ?? 1));
  const [total, rows] = await Promise.all([
    db.notification.count({ where: { userId: user.id } }),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30 }),
  ]);
  return (
    <>
      <PageHeader title="اعلان‌ها" subtitle="همه اعلان‌های ارجاع، مهلت، وظیفه و پیام" />
      <div className="panel">
        {rows.length === 0 ? <EmptyState icon={<Bell />} title="اعلانی وجود ندارد" /> : (
          <ul>
            {rows.map((n) => (
              <li key={n.id} className={cn("flex gap-3 border-b border-line px-4 py-3 last:border-0", !n.readAt && "bg-firuze-50/40")}>
                <span className={cn("mt-2 size-2 shrink-0 rounded-full", n.readAt ? "bg-line-strong" : n.important ? "bg-mohr" : "bg-firuze")} />
                <div className="min-w-0 flex-1">
                  {n.link ? <Link href={n.link} className={cn("hover:text-lapis", !n.readAt && "font-bold")}>{n.title}</Link> : <span className={cn(!n.readAt && "font-bold")}>{n.title}</span>}
                  {n.body && <p className="text-sm text-ink-2">{n.body}</p>}
                  <p className="text-xs text-ink-3">{formatJalali(n.createdAt, "datetime")}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} pageSize={30} total={total} params={{}} basePath="/notifications" />
      </div>
    </>
  );
}
