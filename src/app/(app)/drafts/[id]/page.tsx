import { ExternalLink, History, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { LinkButton } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { DL, PageHeader, Panel } from "@/components/ui/page";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { Timeline } from "@/components/ui/timeline";
import { can, requirePagePerm, getSessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { DRAFT_STATUS, LEGAL_DOC_TYPES } from "@/lib/labels";
import { faNum } from "@/lib/text";
import { draftScope, userNames } from "@/server/access";
import { activityFor } from "@/server/activity";
import { finalizeBlockers } from "@/server/drafts";
import { addSourceAction, removeSourceAction, restoreDraftAction, verifySourceAction } from "../actions";
import { DraftWorkspace } from "./workspace";

const TIMELINE_LIMIT = 50;
const NOTE_ROWS = 2;
// eslint-disable-next-line ts-patterns/no-magic-numbers -- FieldDef.span needs the literal type 2
const FULL = 2 as const;
const SOURCE_LABEL: Record<string, string> = { MANUAL: "ویرایش", TEMPLATE: "ایجاد از قالب", AI: "هوش مصنوعی", RESTORE: "بازگردانی" };
const ORIGIN: Record<string, string> = { USER: "واردشده توسط کاربر", AI: "پیشنهاد هوش مصنوعی — تأییدنشده", LIBRARY: "کتابخانه حقوقی دفتر", WEB: "منبع وب" };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser();
  if (!u) return { title: "سند حقوقی" };
  const r = await db.legalDraft.findFirst({ where: { id: (await params).id, AND: [draftScope(u)] }, select: { title: true } });
  return { title: r?.title ?? "سند حقوقی" };
}

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePerm("draft.view");
  const { id } = await params;
  const d = await db.legalDraft.findFirst({
    where: { id, AND: [draftScope(user)] },
    include: {
      case: { select: { id: true, number: true, title: true } }, client: { select: { id: true, displayName: true } }, template: { select: { id: true, name: true } },
      versions: { orderBy: { versionNo: "desc" }, select: { versionNo: true, note: true, source: true, authorId: true, createdAt: true } },
      reviews: { orderBy: { createdAt: "desc" } }, sources: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!d) notFound();
  const [names, timeline, fin] = await Promise.all([
    userNames([d.authorId, d.reviewerId, d.approvedById, ...d.versions.map((v) => v.authorId), ...d.reviews.map((r) => r.reviewerId)]),
    activityFor({ entityType: "LegalDraft", entityId: id }, TIMELINE_LIMIT),
    d.status === "FINAL" ? db.activityLog.findFirst({ where: { entityType: "LegalDraft", entityId: id, action: "draft.finalized" }, orderBy: { createdAt: "desc" } }) : null,
  ]);
  const editableStatus = d.status === "DRAFT" || d.status === "CHANGES_REQUESTED";
  const editable = editableStatus && can(user, "draft.create");
  const perms = {
    submit: editable,
    review: d.status === "IN_REVIEW" && can(user, "draft.review") && d.authorId !== user.id && (d.reviewerId === user.id || can(user, "draft.view_all")),
    reopen: (d.status === "IN_REVIEW" || d.status === "APPROVED") && can(user, "draft.create") && (d.authorId === user.id || can(user, "draft.view_all")),
    finalize: d.status === "APPROVED" && can(user, "draft.finalize"),
  };
  const restoreKey = d.versions.find((v) => v.source === "RESTORE")?.versionNo ?? 0;
  const latest = d.versions[0]?.versionNo ?? 1;
  return (
    <>
      <PageHeader title={d.title} crumbs={[{ label: "اسناد حقوقی", href: "/drafts" }, ...(d.case ? [{ label: d.case.number, href: `/cases/${d.case.id}?tab=drafts` }] : []), { label: d.code }]}
        meta={<><span className="mono-code">{d.code}</span><Seal>{LEGAL_DOC_TYPES[d.docType] ?? d.docType}</Seal><StatusSeal map={DRAFT_STATUS} value={d.status} />{d.aiAssisted && <Seal tone="warning">با کمک هوش مصنوعی</Seal>}
          {d.case && <span className="text-sm text-ink-2">پرونده: <Link href={`/cases/${d.case.id}`} className="font-bold text-lapis hover:underline">{d.case.title}</Link></span>}</>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <DraftWorkspace key={`ws-${restoreKey}`} id={d.id} initialHtml={d.contentHtml} initialVersion={d.version} editable={editable} title={d.title} status={d.status} aiAssisted={d.aiAssisted}
            perms={perms} blockers={finalizeBlockers(d)} finalDocId={(fin?.meta as { documentId?: string } | null)?.documentId ?? null} />
        </div>
        <aside className="flex flex-col gap-4">
          {editable && can(user, "ai.use") && (
            <Panel title="دستیار هوشمند" icon={<Sparkles />}>
              <p className="mb-2 text-xs text-ink-2">بازنویسی رسمی متن این پیش‌نویس؛ نتیجه پس از بررسی شما به‌صورت نسخه تازه اعمال می‌شود.</p>
              <LinkButton href={`/assistant?draft=${d.id}`} size="sm">بازنویسی رسمی متن</LinkButton>
            </Panel>
          )}
          <Panel title="مشخصات">
            <DL cols={1} items={[
              { label: "تنظیم‌کننده", value: names[d.authorId] }, { label: "بررسی‌کننده", value: d.reviewerId && names[d.reviewerId] },
              { label: "تأییدکننده", value: d.approvedById && `${names[d.approvedById]} — ${formatJalali(d.approvedAt, "datetime")}` },
              { label: "قالب مبنا", value: d.template && <Link href={`/templates/${d.template.id}`} className="text-lapis hover:underline">{d.template.name}</Link> },
              { label: "مراجعه‌کننده", value: d.client && <Link href={`/clients/${d.client.id}`} className="text-lapis hover:underline">{d.client.displayName}</Link> },
              { label: "ایجاد", value: formatJalali(d.createdAt, "datetime") }, { label: "نهایی‌سازی", value: d.finalizedAt && formatJalali(d.finalizedAt, "datetime") },
            ]} />
          </Panel>
          <Panel title={`نسخه‌ها (${faNum(d.versions.length)})`} icon={<History />} bodyClass="p-0"
            action={d.versions.length > 1 && <Link href={`/drafts/${id}/compare`} className="text-sm text-lapis hover:underline">مقایسه نسخه‌ها</Link>}>
            <ul className="max-h-80 overflow-y-auto">{d.versions.map((v) => (
              <li key={v.versionNo} className="flex items-start gap-2 border-b border-line px-4 py-2.5 last:border-0">
                <span className="num flex size-7 shrink-0 items-center justify-center rounded-full bg-ink/5 text-xs font-bold">{faNum(v.versionNo)}</span>
                <span className="min-w-0 flex-1 text-sm"><span className="block">{v.note ?? SOURCE_LABEL[v.source] ?? v.source}</span><span className="text-xs text-ink-3">{names[v.authorId] ?? "—"} · {formatJalali(v.createdAt, "datetime")}</span></span>
                <span className="flex shrink-0 gap-1">
                  {v.versionNo !== latest && <Link href={`/drafts/${id}/compare?a=${v.versionNo}&b=${latest}`} className="rounded px-1.5 py-1 text-xs text-lapis hover:bg-lapis-50">مقایسه</Link>}
                  {editable && v.versionNo !== latest && <ActionButton action={restoreDraftAction} payload={{ id, versionNo: v.versionNo }} size="sm" variant="ghost" successMessage="نسخه بازگردانی شد." confirm={{ title: `بازگردانی نسخه ${faNum(v.versionNo)}`, body: "متن فعلی به‌صورت نسخه‌ای جدید حفظ می‌شود و متن این نسخه جایگزین آن خواهد شد." }}>بازگردانی</ActionButton>}
                </span>
              </li>))}</ul>
          </Panel>
          <Panel title={`منابع و مستندات (${faNum(d.sources.length)})`}
            action={d.status !== "FINAL" && can(user, "draft.create") && <FormDialog trigger="افزودن" triggerVariant="ghost" triggerSize="sm" icon={<Plus />} title="افزودن منبع" size="sm" cols={1} action={addSourceAction} hidden={{ draftId: id }} successMessage="منبع افزوده شد."
              description="هر استناد قانونی یا رویه‌ای باید قابل ردیابی به منبع معتبر باشد."
              fields={[{ name: "citation", label: "متن ارجاع", required: true, placeholder: "مثلاً ماده ۳۳۶ قانون آیین دادرسی مدنی" }, { name: "url", label: "نشانی منبع رسمی", ltr: true, placeholder: "https://…" }, { name: "note", label: "توضیح", type: "textarea", rows: NOTE_ROWS }]} />}>
            {d.sources.length === 0 ? <p className="text-sm text-ink-3">منبعی ثبت نشده است. استنادهای قانونی متن را اینجا با نشانی منبع ثبت کنید تا بررسی‌کننده بتواند آن‌ها را تطبیق دهد.</p> : (
              <ul className="flex flex-col gap-2">{d.sources.map((s) => (
                <li key={s.id} className="rounded-md border border-line p-2.5 text-sm">
                  <p className="font-medium">{s.citation}</p>
                  {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="ltr flex items-center gap-1 truncate text-xs text-lapis hover:underline"><ExternalLink className="size-3" />{s.url}</a>}
                  {s.note && <p className="text-xs text-ink-2">{s.note}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Seal tone={s.verified ? "success" : "warning"}>{s.verified ? "تطبیق داده‌شده" : "تطبیق داده‌نشده"}</Seal><span className="text-2xs text-ink-3">{ORIGIN[s.origin] ?? s.origin}</span>
                    <span className="flex-1" />
                    {can(user, "draft.review") && d.status !== "FINAL" && <ActionButton action={verifySourceAction} payload={{ sourceId: s.id, verified: !s.verified }} size="sm" variant="ghost" successMessage="ثبت شد.">{s.verified ? "لغو تطبیق" : "تطبیق دادم"}</ActionButton>}
                    {d.status !== "FINAL" && can(user, "draft.create") && <ActionButton action={removeSourceAction} payload={{ sourceId: s.id }} size="icon" variant="ghost" aria-label="حذف منبع" successMessage="حذف شد."><Trash2 /></ActionButton>}
                  </div>
                </li>))}</ul>
            )}
          </Panel>
          {d.reviews.length > 0 && (
            <Panel title="سوابق بررسی">
              <ul className="flex flex-col gap-2">{d.reviews.map((r) => (
                <li key={r.id} className="border-b border-line pb-2 text-sm last:border-0"><Seal tone={r.decision === "APPROVE" ? "success" : "danger"}>{r.decision === "APPROVE" ? "تأیید" : "درخواست اصلاح"}</Seal> <span className="text-xs text-ink-3">نسخه {faNum(r.versionNo)} · {names[r.reviewerId]} · {formatJalali(r.createdAt, "datetime")}</span>
                  {r.comment && <p className="mt-1 whitespace-pre-wrap leading-7">{r.comment}</p>}</li>))}</ul>
            </Panel>
          )}
          <Panel title="تاریخچه"><Timeline items={timeline} /></Panel>
        </aside>
      </div>
    </>
  );
}
