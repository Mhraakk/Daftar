import { FileUp, Files } from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { formatJalali } from "@/lib/jalali";
import { CONFIDENTIALITY } from "@/lib/labels";
import { OPT } from "@/lib/options";
import { faNum, formatBytes } from "@/lib/text";
import { listDocuments } from "@/server/documents";

export const metadata = { title: "اسناد و بایگانی" };
type SP = { q?: string; category?: string; confidentiality?: string; state?: string; tag?: string; page?: string };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePagePerm("document.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const { total, rows } = await listDocuments(user, { ...sp, page, pageSize: 20 });
  return (
    <>
      <PageHeader title="اسناد و بایگانی" subtitle={`${faNum(total)} سند در محدوده دسترسی شما`}
        actions={can(user, "document.upload") && <LinkButton href="/documents/new" variant="primary"><FileUp />بارگذاری سند</LinkButton>} />
      <div className="panel">
        <FilterBar searchPlaceholder="عنوان، کد سند، نام فایل یا برچسب…" filters={[
          { name: "category", label: "نوع", options: OPT.docCategory },
          { name: "confidentiality", label: "محرمانگی", options: Object.entries(CONFIDENTIALITY).map(([value, v]) => ({ value, label: v.label })) },
          ...(can(user, "document.delete") ? [{ name: "state", label: "نمایش", options: [{ value: "deleted", label: "حذف‌شده‌ها (قابل بازیابی)" }] }] : []),
        ]} />
        {sp.tag && <p className="border-b border-line px-4 py-2 text-sm">برچسب: <Seal tone="accent">{sp.tag}</Seal> <Link href="/documents" className="text-lapis hover:underline">حذف</Link></p>}
        {rows.length === 0 ? <EmptyState icon={<Files />} title="سندی یافت نشد" hint="اسناد را به پرونده، مراجعه‌کننده، مکاتبه یا وظیفه متصل کنید تا همیشه در بستر خود در دسترس باشند." /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>عنوان</th><th>کد</th><th>نوع</th><th>متصل به</th><th>فایل</th><th>نسخه</th><th>محرمانگی</th><th>به‌روزرسانی</th></tr></thead>
              <tbody>
                {rows.map((d) => {
                  const v = d.versions[0];
                  return (
                    <tr key={d.id}>
                      <td className="max-w-[300px]"><Link href={`/documents/${d.id}`} className="block truncate font-bold hover:text-lapis">{d.title}</Link>
                        {d.tags.length > 0 && <span className="mt-0.5 flex flex-wrap gap-1">{d.tags.slice(0, 3).map((t) => <Link key={t} href={`/documents?tag=${encodeURIComponent(t)}`} className="rounded bg-ink/5 px-1.5 text-2xs text-ink-2 hover:bg-firuze-50">{t}</Link>)}</span>}</td>
                      <td><span className="mono-code">{d.code}</span></td><td>{d.category}</td>
                      <td>{d.case ? <Link href={`/cases/${d.case.id}?tab=documents`} className="hover:text-lapis"><span className="mono-code">{d.case.number}</span></Link> : d.client ? <Link href={`/clients/${d.client.id}`} className="hover:text-lapis">{d.client.displayName}</Link> : "—"}</td>
                      <td className="max-w-[180px] truncate text-sm text-ink-2">{v?.fileName}<span className="block text-xs text-ink-3">{v && formatBytes(v.size)}</span></td>
                      <td className="num">{faNum(v?.versionNo ?? 1)}</td>
                      <td><StatusSeal map={CONFIDENTIALITY} value={d.confidentiality} />{d.deletedAt && <Seal tone="danger">حذف‌شده</Seal>}</td>
                      <td className="num text-ink-2">{formatJalali(d.updatedAt, "date")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={20} total={total} params={sp} basePath="/documents" />
      </div>
    </>
  );
}
