import { FolderOpen, FolderPlus } from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { StatusSeal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { formatJalali } from "@/lib/jalali";
import { CASE_STATUS, PRIORITY } from "@/lib/labels";
import { OPT } from "@/lib/options";
import { faNum } from "@/lib/text";
import { userNames } from "@/server/access";
import { listCases } from "@/server/cases";

export const metadata = { title: "پرونده‌ها" };
type SP = { q?: string; status?: string; category?: string; priority?: string; mine?: string; page?: string };

export default async function CasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePagePerm("case.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const { total, rows } = await listCases(user, { ...sp, page, pageSize: 20 });
  const names = await userNames(rows.map((r) => r.responsibleId));
  const filtered = Object.keys(sp).some((k) => k !== "page" && sp[k as keyof SP]);
  return (
    <>
      <PageHeader title="پرونده‌ها" subtitle={`${faNum(total)} پرونده در محدوده دسترسی شما`}
        actions={<>
          {can(user, "report.export") && <LinkButton href={`/api/export/cases?${new URLSearchParams(sp as Record<string, string>)}`}>خروجی Excel</LinkButton>}
          {can(user, "case.create") && <LinkButton href="/cases/new" variant="primary"><FolderPlus />پرونده جدید</LinkButton>}
        </>} />
      <div className="panel">
        <FilterBar searchPlaceholder="عنوان، شماره پرونده، کلاسه، نام مراجعه‌کننده یا طرف دعوا…" filters={[
          { name: "status", label: "وضعیت", options: [...Object.entries(CASE_STATUS).map(([value, v]) => ({ value, label: v.label })), { value: "all", label: "همه (با بایگانی)" }] },
          { name: "category", label: "دسته", options: OPT.caseCategory },
          { name: "priority", label: "اولویت", options: OPT.priority },
          { name: "mine", label: "مسئول", options: [{ value: "1", label: "پرونده‌های من" }, { value: "unassigned", label: "بدون مسئول" }] },
        ]} />
        {rows.length === 0 ? (
          <EmptyState icon={<FolderOpen />} title={filtered ? "پرونده‌ای با این فیلترها یافت نشد" : "هنوز پرونده‌ای ثبت نشده است"}
            hint="پرونده، محل تجمیع اسناد، وظایف، مهلت‌ها و مکاتبات یک موضوع است."
            action={can(user, "case.create") && <LinkButton href="/cases/new" variant="primary">ایجاد پرونده</LinkButton>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>عنوان پرونده</th><th>شماره</th><th>مراجعه‌کننده</th><th>دسته</th><th>مسئول</th><th>وضعیت</th><th>اولویت</th><th>به‌روزرسانی</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="max-w-[320px]"><Link href={`/cases/${c.id}`} className="block truncate font-bold hover:text-lapis">{c.title}</Link>
                      <span className="text-xs text-ink-3">{faNum(c._count.documents)} سند · {faNum(c._count.tasks)} وظیفه</span></td>
                    <td><span className="mono-code">{c.number}</span></td>
                    <td><Link href={`/clients/${c.client.id}`} className="hover:text-lapis">{c.client.displayName}</Link></td>
                    <td>{c.category}</td>
                    <td>{c.responsibleId ? names[c.responsibleId] ?? "—" : <span className="text-zafaran">بدون مسئول</span>}</td>
                    <td><StatusSeal map={CASE_STATUS} value={c.status} /></td>
                    <td><StatusSeal map={PRIORITY} value={c.priority} /></td>
                    <td className="num text-ink-2">{formatJalali(c.updatedAt, "date")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={20} total={total} params={sp} basePath="/cases" />
      </div>
    </>
  );
}
