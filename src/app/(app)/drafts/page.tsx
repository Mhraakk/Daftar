import { FilePlus2, PenLine } from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { EmptyState, LinkTabs, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { DRAFT_STATUS, LEGAL_DOC_TYPES } from "@/lib/labels";
import { faNum } from "@/lib/text";
import { userNames } from "@/server/access";
import { listDrafts } from "@/server/drafts";

export const metadata = { title: "اسناد حقوقی" };
type SP = { q?: string; status?: string; docType?: string; view?: string; page?: string };

export default async function DraftsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePagePerm("draft.view");
  const sp = await searchParams;
  const view = sp.view ?? "all";
  const page = Math.max(1, Number(sp.page ?? 1));
  const [{ total, rows }, toReview] = await Promise.all([
    listDrafts(user, { ...sp, view, page, pageSize: 20 }),
    db.legalDraft.count({ where: { reviewerId: user.id, status: "IN_REVIEW" } }),
  ]);
  const names = await userNames(rows.flatMap((r) => [r.authorId, r.reviewerId]));
  return (
    <>
      <PageHeader title="اسناد حقوقی" subtitle="دادخواست، لایحه، اظهارنامه، شکواییه و سایر اسناد — با نسخه‌بندی، بررسی و تأیید"
        actions={can(user, "draft.create") && <LinkButton href="/drafts/new" variant="primary"><FilePlus2 />تنظیم سند جدید</LinkButton>} />
      <LinkTabs active={view} tabs={[
        { key: "all", label: "همه", href: "/drafts" }, { key: "mine", label: "تنظیم‌شده توسط من", href: "/drafts?view=mine" },
        { key: "review", label: "منتظر بررسی من", href: "/drafts?view=review", count: toReview ? faNum(toReview) : undefined },
      ]} />
      <div className="panel">
        <FilterBar searchPlaceholder="عنوان یا کد سند…" filters={[
          { name: "status", label: "وضعیت", options: Object.entries(DRAFT_STATUS).map(([value, v]) => ({ value, label: v.label })) },
          { name: "docType", label: "نوع", options: Object.entries(LEGAL_DOC_TYPES).map(([value, label]) => ({ value, label })) },
        ]} />
        {rows.length === 0 ? <EmptyState icon={<PenLine />} title="سندی در این نما وجود ندارد" hint="از قالب‌های آماده یا سند خالی، دادخواست و لایحه تنظیم کنید." action={can(user, "draft.create") && <LinkButton href="/drafts/new" variant="primary">تنظیم سند</LinkButton>} /> : (
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>عنوان</th><th>کد</th><th>نوع</th><th>پرونده</th><th>تنظیم‌کننده</th><th>بررسی‌کننده</th><th>وضعیت</th><th>به‌روزرسانی</th></tr></thead>
            <tbody>{rows.map((d) => (
              <tr key={d.id}>
                <td className="max-w-[320px]"><Link href={`/drafts/${d.id}`} className="block truncate font-bold hover:text-lapis">{d.title}</Link>{d.aiAssisted && <Seal tone="warning">با کمک هوش مصنوعی</Seal>}</td>
                <td><span className="mono-code">{d.code}</span></td><td>{LEGAL_DOC_TYPES[d.docType] ?? d.docType}</td>
                <td>{d.case ? <Link href={`/cases/${d.case.id}?tab=drafts`} className="hover:text-lapis"><span className="mono-code">{d.case.number}</span></Link> : d.client?.displayName ?? "—"}</td>
                <td>{names[d.authorId] ?? "—"}</td><td>{d.reviewerId ? names[d.reviewerId] : "—"}</td>
                <td><StatusSeal map={DRAFT_STATUS} value={d.status} /></td><td className="num text-ink-2">{formatJalali(d.updatedAt, "date")}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        <Pagination page={page} pageSize={20} total={total} params={{ ...sp, view: view === "all" ? undefined : view }} basePath="/drafts" />
      </div>
    </>
  );
}
