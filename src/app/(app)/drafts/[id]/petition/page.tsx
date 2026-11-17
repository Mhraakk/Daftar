// استودیوی دادخواست یک سند: داده ساخت‌یافته دادخواست، برگ زنده، بررسی ماده ۵۱/۵۳ و مهلت
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PetitionStudio } from "@/components/petitions/studio";
import { LinkButton } from "@/components/ui/button";
import { Notice, PageHeader } from "@/components/ui/page";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { can, getSessionUser, requirePagePerm, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { DRAFT_STATUS, PETITION_KIND } from "@/lib/labels";
import { draftScope } from "@/server/access";
import { plainSpec } from "@/server/petitions/data";
import { petitionReport } from "@/server/petitions/drafting";

const EDITABLE = ["DRAFT", "CHANGES_REQUESTED"];

/** گزارش دادخواست؛ اگر نوع دادخواست حذف شده باشد null */
async function loadReport(id: string, user: SessionUser) {
  try {
    return await petitionReport(id, user);
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const [u, { id }] = await Promise.all([getSessionUser(), params]);
  if (!u) return { title: "استودیوی دادخواست" };
  const r = await db.legalDraft.findFirst({ where: { id, AND: [draftScope(u)] }, select: { title: true } });
  return { title: r ? `استودیو — ${r.title}` : "استودیوی دادخواست" };
}

export default async function PetitionStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePerm("draft.view");
  const { id } = await params;
  const d = await db.legalDraft.findFirst({
    where: { id, AND: [draftScope(user)] },
    select: { id: true, code: true, title: true, status: true, version: true, petitionTypeId: true, case: { select: { id: true, number: true, title: true } } },
  });
  if (!d) notFound();
  if (!d.petitionTypeId) redirect(`/drafts/${id}`);
  const report = await loadReport(id, user);
  const crumbs = [{ label: "اسناد حقوقی", href: "/drafts" }, ...(d.case ? [{ label: d.case.number, href: `/cases/${d.case.id}?tab=drafts` }] : []), { label: d.code, href: `/drafts/${id}` }, { label: "استودیوی دادخواست" }];
  if (!report) {
    return (
      <>
        <PageHeader title={d.title} crumbs={crumbs} />
        <Notice tone="danger" title="نوع دادخواست این سند در دسترس نیست">نوع دادخواستی که این سند از آن ساخته شده حذف شده است؛ متن سند در صفحه سند همچنان قابل ویرایش است. <Link href={`/drafts/${id}`} className="text-lapis hover:underline">بازگشت به سند</Link></Notice>
      </>
    );
  }
  const editable = EDITABLE.includes(d.status) && can(user, "draft.create");
  return (
    <>
      <PageHeader title={d.title} crumbs={crumbs}
        subtitle={<>از نوع <Link href={`/petitions/${report.spec.id}`} className="font-medium text-lapis hover:underline">{report.spec.title}</Link></>}
        meta={<><span className="mono-code">{d.code}</span><Seal>{PETITION_KIND[report.spec.kind]?.label ?? report.spec.kind}</Seal><StatusSeal map={DRAFT_STATUS} value={d.status} />
          {d.case && <span className="text-sm text-ink-2">پرونده: <Link href={`/cases/${d.case.id}`} className="font-bold text-lapis hover:underline">{d.case.title}</Link></span>}</>}
        actions={<LinkButton href={`/drafts/${id}`} variant="secondary">صفحه سند</LinkButton>} />
      {!editable && (
        <div className="mb-4"><Notice tone="info" title="فقط خواندنی">{EDITABLE.includes(d.status) ? "برای ویرایش، مجوز تنظیم سند لازم است." : `سند در وضعیت «${DRAFT_STATUS[d.status]?.label ?? d.status}» است؛ برای تغییر، ابتدا آن را به پیش‌نویس بازگردانید.`}</Notice></div>
      )}
      <PetitionStudio draftId={id} version={d.version} editable={editable} spec={plainSpec(report.spec)} initialData={report.data} initialDeadline={report.deadline} />
    </>
  );
}
