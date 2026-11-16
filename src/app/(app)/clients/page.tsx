import { UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { Seal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { formatJalali } from "@/lib/jalali";
import { faNum } from "@/lib/text";
import { listClients } from "@/server/clients";

export const metadata = { title: "مراجعان" };
type SP = { q?: string; type?: string; state?: string; page?: string };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePagePerm("client.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const { total, rows } = await listClients(user, { ...sp, page, pageSize: 20 });
  return (
    <>
      <PageHeader title="مراجعان" subtitle={`${faNum(total)} مراجعه‌کننده در محدوده دسترسی شما`}
        actions={<>
          {can(user, "report.export") && <LinkButton href={`/api/export/clients?${new URLSearchParams(sp as Record<string, string>)}`}>خروجی Excel</LinkButton>}
          {can(user, "client.create") && <LinkButton href="/clients/new" variant="primary"><UserPlus />ثبت مراجعه‌کننده</LinkButton>}
        </>} />
      <div className="panel">
        <FilterBar searchPlaceholder="نام، کد ملی، تلفن همراه یا کد مراجعه‌کننده…" filters={[
          { name: "type", label: "نوع", options: [{ value: "PERSON", label: "حقیقی" }, { value: "LEGAL", label: "حقوقی" }] },
          { name: "state", label: "وضعیت", options: [{ value: "archived", label: "بایگانی‌شده" }, { value: "all", label: "فعال و بایگانی" }] },
        ]} />
        {rows.length === 0 ? (
          <EmptyState icon={<Users />} title={sp.q || sp.type || sp.state ? "مراجعه‌کننده‌ای با این مشخصات یافت نشد" : "هنوز مراجعه‌کننده‌ای ثبت نشده است"}
            hint="با ثبت نخستین مراجعه‌کننده، می‌توانید برای او پرونده ایجاد و مدارک را بارگذاری کنید."
            action={can(user, "client.create") && <LinkButton href="/clients/new" variant="primary">ثبت مراجعه‌کننده</LinkButton>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>مراجعه‌کننده</th><th>کد</th><th>کد / شناسه ملی</th><th>تلفن همراه</th><th>پرونده</th><th>سند</th><th>تاریخ ثبت</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/clients/${c.id}`} className="font-bold hover:text-lapis">{c.displayName}</Link>
                      <span className="ms-2 inline-flex gap-1"><Seal tone="neutral">{c.type === "PERSON" ? "حقیقی" : "حقوقی"}</Seal>{c.archivedAt && <Seal tone="warning">بایگانی</Seal>}</span>
                    </td>
                    <td><span className="mono-code">{c.code}</span></td>
                    <td className="num ltr text-right">{c.nationalId ?? "—"}</td>
                    <td className="num ltr text-right">{c.mobile ?? "—"}</td>
                    <td className="num">{faNum(c._count.cases)}</td>
                    <td className="num">{faNum(c._count.documents)}</td>
                    <td className="num text-ink-2">{formatJalali(c.createdAt, "date")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={20} total={total} params={sp} basePath="/clients" />
      </div>
    </>
  );
}
