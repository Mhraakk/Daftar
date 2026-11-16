import { LayoutTemplate, Plus } from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { LEGAL_DOC_TYPES } from "@/lib/labels";
import { extractFields } from "@/lib/template-fields";
import { faNum, normalizeFa } from "@/lib/text";

export const metadata = { title: "قالب‌های حقوقی" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ q?: string; docType?: string; state?: string }> }) {
  const user = await requirePagePerm("template.view");
  const sp = await searchParams;
  const manage = can(user, "template.manage");
  const rows = await db.legalTemplate.findMany({
    where: { ...(sp.docType ? { docType: sp.docType } : {}), ...(manage && sp.state === "inactive" ? { isActive: false } : manage && sp.state === "all" ? {} : { isActive: true }) },
    orderBy: [{ docType: "asc" }, { name: "asc" }],
    include: { versions: { orderBy: { versionNo: "desc" }, take: 1 }, _count: { select: { drafts: true } } },
  });
  const n = normalizeFa(sp.q);
  const list = n ? rows.filter((t) => normalizeFa(`${t.name} ${t.description ?? ""} ${t.category ?? ""}`).includes(n)) : rows;
  return (
    <>
      <PageHeader title="قالب‌های حقوقی" subtitle={`${faNum(list.length)} قالب · متن قالب‌ها چارچوب نگارشی است و پیش از استفاده باید توسط مسئول حقوقی دفتر بازبینی شود.`}
        actions={manage && <LinkButton href="/templates/new" variant="primary"><Plus />قالب جدید</LinkButton>} />
      <div className="panel">
        <FilterBar searchPlaceholder="نام یا شرح قالب…" filters={[
          { name: "docType", label: "نوع", options: Object.entries(LEGAL_DOC_TYPES).map(([value, label]) => ({ value, label })) },
          ...(manage ? [{ name: "state", label: "وضعیت", options: [{ value: "inactive", label: "غیرفعال" }, { value: "all", label: "همه" }] }] : []),
        ]} />
        {list.length === 0 ? <EmptyState icon={<LayoutTemplate />} title="قالبی یافت نشد" /> : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((t) => {
              const v = t.versions[0];
              return (
                <Link key={t.id} href={`/templates/${t.id}`} className="group flex flex-col rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-2/60">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-md font-bold group-hover:text-lapis">{t.name}</h2>
                    {!t.isActive && <Seal tone="neutral">غیرفعال</Seal>}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-3">{LEGAL_DOC_TYPES[t.docType]}{t.category ? ` · ${t.category}` : ""} · نسخه {faNum(v?.versionNo ?? 1)}{t.isSystem ? " · قالب پایه" : ""}</p>
                  {t.description && <p className="mt-2 line-clamp-2 text-sm text-ink-2">{t.description}</p>}
                  <p className="mt-auto pt-3 text-xs text-ink-3">{faNum(v ? extractFields(v.contentHtml).length : 0)} فیلد · {faNum(t._count.drafts)} سند ساخته‌شده · {formatJalali(t.updatedAt, "date")}</p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
