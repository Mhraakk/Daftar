import { Download, Pencil, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { LinkButton } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { DL, Notice, PageHeader, Panel } from "@/components/ui/page";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { Timeline } from "@/components/ui/timeline";
import { NewVersionForm } from "@/components/upload-form";
import { DocumentInsights } from "@/components/ai/document-insights";
import { can, requirePagePerm, getSessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { CONFIDENTIALITY } from "@/lib/labels";
import { OPT } from "@/lib/options";
import { ALLOWED_EXTENSIONS } from "@/lib/storage";
import { faNum, formatBytes } from "@/lib/text";
import { documentScope, userNames } from "@/server/access";
import { activityFor } from "@/server/activity";
import { deleteDocumentAction, documentAccessAction, updateDocumentAction } from "../actions";

const TIMELINE_LIMIT = 40;
const PREVIEW_CHARS = 20_000;
const DEFAULT_MAX_UPLOAD_MB = 25;
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? DEFAULT_MAX_UPLOAD_MB);
const DESCRIPTION_ROWS = 2;
// eslint-disable-next-line ts-patterns/no-magic-numbers -- FieldDef.span needs the literal type 2
const FULL = 2 as const;
const INLINE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function Preview({ mimeType, fileUrl, title, text }: { mimeType: string | null; fileUrl: string; title: string; text: string | null }) {
  if (mimeType === "application/pdf") return <iframe src={`${fileUrl}?inline=1`} title={`پیش‌نمایش ${title}`} className="h-[72vh] w-full rounded-b-lg" />;
  // eslint-disable-next-line @next/next/no-img-element
  if (mimeType) return <img src={`${fileUrl}?inline=1`} alt={title} className="mx-auto max-h-[72vh] rounded-b-lg" />;
  if (text) return <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap p-4 font-sans leading-8">{text.slice(0, PREVIEW_CHARS)}</pre>;
  return <p className="p-8 text-center text-sm text-ink-3">پیش‌نمایش برای این نوع فایل در مرورگر ممکن نیست؛ فایل را دریافت کنید.</p>;
}

const TEXT_STATUS: Record<string, string> = { EXTRACTED: "متن استخراج و نمایه شد", OCR_DONE: "متن با OCR استخراج شد", OCR_PENDING: "در صف OCR", OCR_UNAVAILABLE: "سند تصویری است؛ موتور OCR روی سرور نصب نیست", NONE: "این نوع فایل متن قابل استخراج ندارد", FAILED: "استخراج متن ناموفق بود", PENDING: "در انتظار پردازش" };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser();
  if (!u) return { title: "سند" };
  const r = await db.document.findFirst({ where: { id: (await params).id, AND: [documentScope(u)] }, select: { title: true } });
  return { title: r?.title ?? "سند" };
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePerm("document.view");
  const { id } = await params;
  const d = await db.document.findFirst({
    where: { id, AND: [documentScope(user, { includeDeleted: can(user, "document.delete") })] },
    include: { versions: { orderBy: { versionNo: "desc" } }, case: { select: { id: true, title: true, number: true } }, client: { select: { id: true, displayName: true } }, correspondence: { select: { id: true, subject: true } }, task: { select: { id: true, title: true } }, access: { include: { user: { select: { id: true, fullName: true } } } } },
  });
  if (!d) notFound();
  const v = d.versions[0];
  const [names, timeline, staff] = await Promise.all([
    userNames([d.createdById, ...d.versions.map((x) => x.uploadedById)]),
    activityFor({ entityType: "Document", entityId: id }, TIMELINE_LIMIT),
    d.confidentiality === "RESTRICTED" ? db.user.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }) : [],
  ]);
  const canEdit = (can(user, "document.edit") || d.createdById === user.id) && !d.deletedAt;
  const previewable = !!v && INLINE_TYPES.includes(v.mimeType) && !d.deletedAt;
  const fileUrl = `/api/documents/${id}/file`;
  return (
    <>
      <PageHeader title={d.title} crumbs={[{ label: "اسناد", href: "/documents" }, { label: d.code }]}
        meta={<><span className="mono-code">{d.code}</span><Seal>{d.category}</Seal><StatusSeal map={CONFIDENTIALITY} value={d.confidentiality} /><Seal tone="info">نسخه {faNum(v?.versionNo ?? 1)}</Seal>{d.deletedAt && <Seal tone="danger">حذف‌شده</Seal>}</>}
        actions={<>
          {!d.deletedAt && <LinkButton href={fileUrl} variant="primary"><Download />دریافت فایل</LinkButton>}
          {canEdit && (
            <FormDialog trigger="ویرایش مشخصات" triggerVariant="secondary" icon={<Pencil />} title="ویرایش مشخصات سند" action={updateDocumentAction} hidden={{ id }} successMessage="ذخیره شد."
              fields={[{ name: "title", label: "عنوان", required: true, span: FULL }, { name: "category", label: "نوع سند", type: "select", required: true, options: OPT.docCategory },
                { name: "confidentiality", label: "محرمانگی", type: "select", required: true, options: OPT.confidentiality }, { name: "tags", label: "برچسب‌ها", type: "tags", span: FULL }, { name: "description", label: "توضیحات", type: "textarea", rows: DESCRIPTION_ROWS }]}
              initial={{ title: d.title, category: d.category, confidentiality: d.confidentiality, tags: d.tags, description: d.description ?? "" }} />
          )}
          {can(user, "document.delete") && (d.deletedAt
            ? <ActionButton action={deleteDocumentAction} payload={{ id, deleted: false }} successMessage="سند بازیابی شد."><RotateCcw />بازیابی</ActionButton>
            : <ActionButton action={deleteDocumentAction} payload={{ id, deleted: true }} variant="danger" successMessage="سند حذف شد (قابل بازیابی)." redirectTo="/documents"
                confirm={{ title: "حذف سند", body: "سند از فهرست‌ها و جست‌وجو خارج می‌شود اما فایل و همه نسخه‌های آن حفظ می‌شود و توسط کاربر مجاز قابل بازیابی است." }}><Trash2 />حذف</ActionButton>)}
        </>} />
      {d.deletedAt && <div className="mb-4"><Notice tone="danger">این سند در {formatJalali(d.deletedAt, "datetime")} حذف منطقی شده است.</Notice></div>}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Panel title="پیش‌نمایش" bodyClass="p-0">
            <Preview mimeType={previewable ? v.mimeType : null} fileUrl={fileUrl} title={d.title} text={v?.extractedText ?? null} />
          </Panel>
          <Panel title="تاریخچه نسخه‌ها" bodyClass="p-0">
            <table className="tbl"><thead><tr><th>نسخه</th><th>فایل</th><th>حجم</th><th>بارگذار</th><th>تاریخ</th><th>توضیح</th><th /></tr></thead>
              <tbody>{d.versions.map((x) => (
                <tr key={x.id}><td className="num font-bold">{faNum(x.versionNo)}</td><td className="max-w-[220px] truncate">{x.fileName}</td><td className="num">{formatBytes(x.size)}</td><td>{names[x.uploadedById] ?? "—"}</td><td className="num">{formatJalali(x.createdAt, "datetime")}</td><td className="text-sm text-ink-2">{x.note ?? "—"}</td>
                  <td><LinkButton href={`${fileUrl}?v=${x.versionNo}`} size="sm" variant="ghost" aria-label={`دریافت نسخه ${x.versionNo}`}><Download /></LinkButton></td></tr>
              ))}</tbody></table>
          </Panel>
          {!d.deletedAt && <DocumentInsights doc={{ id: d.id, title: d.title, category: d.category, caseId: d.caseId }} text={v?.extractedText ?? null}
            canDeadline={can(user, "deadline.manage")} canAi={can(user, "ai.use")} canSkill={can(user, "skill.run")} />}
          <Panel title="تاریخچه سند"><Timeline items={timeline} /></Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="مشخصات">
            <DL cols={1} items={[
              { label: "پرونده", value: d.case && <Link href={`/cases/${d.case.id}?tab=documents`} className="text-lapis hover:underline">{d.case.title} · {d.case.number}</Link> },
              { label: "مراجعه‌کننده", value: d.client && <Link href={`/clients/${d.client.id}`} className="text-lapis hover:underline">{d.client.displayName}</Link> },
              { label: "مکاتبه", value: d.correspondence && <Link href={`/cartable/${d.correspondence.id}`} className="text-lapis hover:underline">{d.correspondence.subject}</Link> },
              { label: "وظیفه", value: d.task && <Link href={`/tasks/${d.task.id}`} className="text-lapis hover:underline">{d.task.title}</Link> },
              { label: "ثبت‌کننده", value: names[d.createdById] }, { label: "تاریخ ثبت", value: formatJalali(d.createdAt, "datetime") },
              { label: "برچسب‌ها", value: d.tags.length ? d.tags.join("، ") : null }, { label: "توضیحات", value: d.description },
              { label: "وضعیت نمایه متنی", value: v && TEXT_STATUS[v.textStatus] }, { label: "اثر انگشت فایل (SHA-256)", value: v && <span className="ltr break-all text-2xs text-ink-2">{v.sha256}</span> },
            ]} />
          </Panel>
          {d.confidentiality === "RESTRICTED" && (
            <Panel title="افراد مجاز (خیلی محرمانه)">
              {d.access.length === 0 ? <p className="mb-2 text-sm text-ink-3">فقط ثبت‌کننده و دارندگان مجوز ویژه دسترسی دارند.</p> : <ul className="mb-2 list-disc ps-5">{d.access.map((a) => <li key={a.userId}>{a.user.fullName}</li>)}</ul>}
              {(can(user, "document.view_restricted") || d.createdById === user.id) && !d.deletedAt && (
                <FormDialog trigger="تنظیم افراد مجاز" triggerVariant="secondary" triggerSize="sm" title="افراد مجاز به مشاهده" action={documentAccessAction} hidden={{ id }} cols={1} successMessage="دسترسی‌ها ذخیره شد."
                  fields={[{ name: "userIds", label: "کارمندان", type: "multicheck", options: staff.map((s) => ({ value: s.id, label: s.fullName })) }]} initial={{ userIds: d.access.map((a) => a.userId) }} />
              )}
            </Panel>
          )}
          {can(user, "document.upload") && !d.deletedAt && !d.archivedAt && (
            <Panel title="ثبت نسخه جدید"><NewVersionForm documentId={id} accept={ALLOWED_EXTENSIONS.join(",")} maxMb={MAX_UPLOAD_MB} /></Panel>
          )}
        </div>
      </div>
    </>
  );
}
