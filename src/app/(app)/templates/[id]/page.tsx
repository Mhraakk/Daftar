import { FilePlus2, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { LinkButton } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { DL, Notice, PageHeader, Panel } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { LEGAL_DOC_TYPES } from "@/lib/labels";
import { extractFields } from "@/lib/template-fields";
import { faNum } from "@/lib/text";
import { userNames } from "@/server/access";
import { updateTemplateAction } from "../actions";
import { TemplateVersionEditor } from "../template-form";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = await db.legalTemplate.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: t?.name ?? "قالب" };
}

export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const user = await requirePagePerm("template.view");
  const { id } = await params;
  const sp = await searchParams;
  const t = await db.legalTemplate.findUnique({ where: { id }, include: { versions: { orderBy: { versionNo: "desc" } }, _count: { select: { drafts: true } } } });
  if (!t || (!t.isActive && !can(user, "template.manage"))) notFound();
  const latest = t.versions[0];
  const shown = t.versions.find((v) => v.versionNo === Number(sp.v)) ?? latest;
  const names = await userNames([t.createdById, ...t.versions.map((v) => v.createdById)]);
  const manage = can(user, "template.manage");
  const meta = { name: t.name, docType: t.docType, category: t.category ?? "", description: t.description ?? "", legalBasis: t.legalBasis ?? "" };
  return (
    <>
      <PageHeader title={t.name} crumbs={[{ label: "قالب‌ها", href: "/templates" }, { label: t.name }]}
        meta={<><Seal>{LEGAL_DOC_TYPES[t.docType]}</Seal><Seal tone="info">نسخه {faNum(latest.versionNo)}</Seal>{t.isSystem && <Seal>قالب پایه</Seal>}{!t.isActive && <Seal tone="warning">غیرفعال</Seal>}</>}
        actions={<>
          {t.isActive && can(user, "draft.create") && <LinkButton href={`/drafts/new?templateId=${t.id}`} variant="primary"><FilePlus2 />ساخت سند از این قالب</LinkButton>}
          {manage && <FormDialog trigger="ویرایش مشخصات" triggerVariant="secondary" icon={<Pencil />} title="مشخصات قالب" action={updateTemplateAction} hidden={{ id }} successMessage="ذخیره شد." initial={meta}
            fields={[{ name: "name", label: "نام قالب", required: true, span: 2 }, { name: "docType", label: "نوع سند", type: "select", required: true, options: Object.entries(LEGAL_DOC_TYPES).map(([value, label]) => ({ value, label })) }, { name: "category", label: "دسته" }, { name: "legalBasis", label: "مستند قانونی (برای بررسی)", span: 2 }, { name: "description", label: "توضیح کاربرد", type: "textarea", rows: 2 }]} />}
          {manage && <ActionButton action={updateTemplateAction} payload={{ id, ...meta, isActive: !t.isActive }} variant={t.isActive ? "danger" : "secondary"} successMessage={t.isActive ? "قالب غیرفعال شد." : "قالب فعال شد."}
            confirm={t.isActive ? { title: "غیرفعال‌سازی قالب", body: "قالب در فهرست ساخت سند نمایش داده نمی‌شود؛ اسناد ساخته‌شده و تاریخچه نسخه‌ها حفظ می‌شود." } : undefined}>{t.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}</ActionButton>}
        </>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {manage && shown.versionNo === latest.versionNo
            ? <TemplateVersionEditor key={latest.id} id={t.id} html={latest.contentHtml} />
            : <>
                {shown.versionNo !== latest.versionNo && <div className="mb-3"><Notice tone="warning">نمایش نسخه قدیمی {faNum(shown.versionNo)}. <Link href={`/templates/${id}`} className="font-bold underline">بازگشت به آخرین نسخه</Link></Notice></div>}
                <div className="mx-auto w-full max-w-[210mm] rounded border border-line-strong sheet-paper px-6 py-8 shadow-pop sm:px-[22mm]"><div className="legal-doc" dir="rtl" dangerouslySetInnerHTML={{ __html: shown.contentHtml.replace(/\{\{([^{}<>]+)\}\}/g, '<span class="field-token">{{$1}}</span>') }} /></div>
              </>}
        </div>
        <aside className="flex flex-col gap-4">
          <Panel title="مشخصات">
            <DL cols={1} items={[{ label: "توضیح کاربرد", value: t.description }, { label: "مستند قانونی (برای بررسی)", value: t.legalBasis }, { label: "دسته", value: t.category },
              { label: "اسناد ساخته‌شده", value: faNum(t._count.drafts) }, { label: "فیلدها", value: faNum(extractFields(shown.contentHtml).length) }, { label: "ایجادکننده", value: t.createdById ? names[t.createdById] : "سامانه" }]} />
          </Panel>
          <Panel title={`نسخه‌ها (${faNum(t.versions.length)})`} bodyClass="p-0">
            <ul>{t.versions.map((v) => (
              <li key={v.id}><Link href={`/templates/${id}?v=${v.versionNo}`} className={cn("flex gap-2 border-b border-line px-4 py-2.5 text-sm hover:bg-surface-2", v.versionNo === shown.versionNo && "bg-firuze-50")}>
                <span className="num font-bold">{faNum(v.versionNo)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate">{v.note ?? "—"}</span><span className="text-xs text-ink-3">{v.createdById ? names[v.createdById] : "سامانه"} · {formatJalali(v.createdAt, "date")}{v.sourceFileName ? ` · از ${v.sourceFileName}` : ""}</span></span>
              </Link></li>))}</ul>
          </Panel>
        </aside>
      </div>
    </>
  );
}
