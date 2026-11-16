import { History } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { ACTION_LABELS } from "@/lib/labels";
import { faNum } from "@/lib/text";

export const metadata = { title: "تاریخچه فعالیت‌ها" };
type SP = { q?: string; group?: string; actor?: string; page?: string };
const GROUPS = [["auth", "ورود و امنیت"], ["security", "دسترسی غیرمجاز"], ["user", "کاربران"], ["role", "نقش‌ها"], ["client", "مراجعان"], ["case", "پرونده‌ها"], ["document", "اسناد"], ["correspondence", "مکاتبات"], ["task", "وظایف"], ["deadline", "مهلت‌ها"], ["draft", "اسناد حقوقی"], ["ai", "هوش مصنوعی"], ["skill", "مهارت‌ها"], ["settings", "تنظیمات"], ["backup", "پشتیبان"]];

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requirePagePerm("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const where = {
    ...(sp.group ? { action: { startsWith: `${sp.group}.` } } : {}), ...(sp.actor ? { actorId: sp.actor } : {}),
    ...(sp.q ? { OR: [{ entityLabel: { contains: sp.q, mode: "insensitive" as const } }, { actor: { fullName: { contains: sp.q, mode: "insensitive" as const } } }] } : {}),
  };
  const [total, rows, actors] = await Promise.all([
    db.activityLog.count({ where }),
    db.activityLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 40, take: 40, include: { actor: { select: { fullName: true } } } }),
    db.user.findMany({ select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="تاریخچه فعالیت‌ها" subtitle={`${faNum(total)} رویداد · این تاریخچه فقط-افزودنی است و در سطح پایگاه داده از ویرایش و حذف محافظت می‌شود.`}
        actions={can(me, "report.export") && <LinkButton href={`/api/export/audit?${new URLSearchParams(sp as Record<string, string>)}`}>خروجی Excel</LinkButton>} />
      <div className="panel">
        <FilterBar searchPlaceholder="عنوان رکورد یا نام کاربر…" filters={[{ name: "group", label: "حوزه", options: GROUPS.map(([value, label]) => ({ value, label })) }, { name: "actor", label: "کاربر", options: actors.map((a) => ({ value: a.id, label: a.fullName })) }]} />
        {rows.length === 0 ? <EmptyState icon={<History />} title="رویدادی یافت نشد" /> : (
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>زمان</th><th>کاربر</th><th>عملیات</th><th>رکورد</th><th>جزئیات</th><th>نشانی IP</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className={r.action.startsWith("security") || r.action === "auth.login_failed" ? "bg-mohr-50/40" : ""}>
                <td className="num whitespace-nowrap text-ink-2">{formatJalali(r.createdAt, "datetime")}</td><td>{r.actor?.fullName ?? "سامانه"}</td>
                <td className="font-medium">{ACTION_LABELS[r.action] ?? r.action}</td><td className="max-w-[260px] truncate">{r.entityLabel ?? "—"}</td>
                <td className="max-w-[320px] truncate text-xs text-ink-3 ltr text-right" title={r.meta ? JSON.stringify(r.meta) : ""}>{r.meta ? JSON.stringify(r.meta).slice(0, 110) : ""}</td>
                <td className="num ltr text-right text-xs text-ink-3">{r.ip ?? ""}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        <Pagination page={page} pageSize={40} total={total} params={sp} basePath="/admin/audit" />
      </div>
    </>
  );
}
