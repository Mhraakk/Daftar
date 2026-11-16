import { Archive, Check, CheckCheck, CornerUpLeft, Forward, ListPlus, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { LinkButton } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { DL, PageHeader, Panel } from "@/components/ui/page";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { Timeline } from "@/components/ui/timeline";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { taskFields } from "@/lib/form-defs";
import { formatDateOnly, formatJalali } from "@/lib/jalali";
import { CORR_DIRECTION, CORR_STATUS, PRIORITY, REFERRAL_ACTION, REFERRAL_STATUS } from "@/lib/labels";
import { corrScope, documentScope, userNames } from "@/server/access";
import { activityFor } from "@/server/activity";
import { markReferralSeen } from "@/server/correspondence";
import { createTaskAction } from "../../tasks/actions";
import { archiveCorrAction, decideCorrAction, referCorrAction } from "../actions";

export default async function CorrPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePerm("correspondence.view");
  const { id } = await params;
  const c = await db.correspondence.findFirst({
    where: { id, AND: [corrScope(user)] },
    include: { referrals: { orderBy: { createdAt: "asc" } }, case: { select: { id: true, title: true, number: true } }, client: { select: { id: true, displayName: true } }, tasks: { select: { id: true, code: true, title: true, status: true } } },
  });
  if (!c) notFound();
  await markReferralSeen(id, user);
  const [names, docs, timeline] = await Promise.all([
    userNames([c.createdById, c.currentHolderId, ...c.referrals.flatMap((r) => [r.fromUserId, r.toUserId])]),
    db.document.findMany({ where: { correspondenceId: id, AND: [documentScope(user)] }, include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } } }),
    activityFor({ entityType: "Correspondence", entityId: id }),
  ]);
  const isHolder = c.currentHolderId === user.id || can(user, "correspondence.view_all");
  const active = ["REGISTERED", "IN_PROGRESS"].includes(c.status);
  const finished = ["COMPLETED", "APPROVED", "REJECTED"].includes(c.status);
  const canRefer = can(user, "correspondence.refer") && isHolder && active;
  const hasSender = c.referrals.some((r) => r.toUserId === user.id) || c.createdById !== user.id;
  return (
    <>
      <PageHeader title={c.subject} crumbs={[{ label: "کارتابل", href: "/cartable" }, { label: c.refNumber }]}
        meta={<><span className="mono-code">{c.refNumber}</span><Seal>{CORR_DIRECTION[c.direction]}</Seal><StatusSeal map={CORR_STATUS} value={c.status} /><StatusSeal map={PRIORITY} value={c.priority} />
          <span className="text-sm text-ink-2">دارنده فعلی: <b>{names[c.currentHolderId ?? ""] ?? "—"}</b></span></>}
        actions={<>
          {canRefer && (
            <FormDialog trigger="ارجاع" icon={<Forward />} title="ارجاع مکاتبه" action={referCorrAction} hidden={{ id }} cols={1} submitLabel="ارجاع" successMessage="ارجاع شد."
              fields={[{ name: "toUserId", label: "گیرنده", type: "lookup", lookup: "user", required: true }, { name: "action", label: "نوع", type: "select", required: true, options: [{ value: "REFER", label: "ارجاع جهت اقدام" }, { value: "FORWARD", label: "ارسال جهت اطلاع" }, { value: "FOLLOW_UP", label: "جهت پیگیری" }] },
                { name: "instruction", label: "دستور / توضیح", type: "textarea", rows: 2 }, { name: "dueDate", label: "مهلت اقدام", type: "jdate" }]} initial={{ action: "REFER" }} />
          )}
          {canRefer && hasSender && <ActionButton action={decideCorrAction} payload={{ id, decision: "RETURN" }} askNote="note" noteLabel="دلیل بازگشت" noteRequired confirm={{ title: "بازگشت به ارجاع‌دهنده" }} confirmLabel="بازگشت" successMessage="بازگشت داده شد."><CornerUpLeft />بازگشت</ActionButton>}
          {canRefer && <ActionButton action={decideCorrAction} payload={{ id, decision: "COMPLETE" }} variant="accent" askNote="note" noteLabel="شرح اقدام انجام‌شده" confirm={{ title: "اتمام اقدام" }} confirmLabel="ثبت اتمام" successMessage="اقدام ثبت شد."><CheckCheck />اتمام اقدام</ActionButton>}
          {can(user, "correspondence.approve") && isHolder && active && <>
            <ActionButton action={decideCorrAction} payload={{ id, decision: "APPROVE" }} askNote="note" noteLabel="توضیح (اختیاری)" confirm={{ title: "تأیید مکاتبه" }} confirmLabel="تأیید" successMessage="تأیید شد."><Check />تأیید</ActionButton>
            <ActionButton action={decideCorrAction} payload={{ id, decision: "REJECT" }} variant="danger" askNote="note" noteLabel="دلیل رد" noteRequired confirm={{ title: "رد مکاتبه" }} confirmLabel="رد" successMessage="رد شد."><X />رد</ActionButton>
          </>}
          {can(user, "task.create") && c.status !== "ARCHIVED" && <FormDialog trigger="ایجاد وظیفه" triggerVariant="secondary" icon={<ListPlus />} title="وظیفه مرتبط با این مکاتبه" size="lg" action={createTaskAction} hidden={{ correspondenceId: id, caseId: c.caseId ?? "" }} successMessage="وظیفه ثبت شد." fields={taskFields({ canAssign: can(user, "task.assign") })} initial={{ priority: c.priority, title: `پیگیری: ${c.subject}`.slice(0, 190) }} />}
          {can(user, "correspondence.archive") && finished && <ActionButton action={archiveCorrAction} payload={{ id }} confirm={{ title: "بایگانی مکاتبه", body: "مکاتبه به بایگانی منتقل می‌شود و قابل جست‌وجو باقی می‌ماند." }} successMessage="بایگانی شد."><Archive />بایگانی</ActionButton>}
        </>} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Panel title="متن مکاتبه">{c.body ? <p className="whitespace-pre-wrap leading-8">{c.body}</p> : <p className="text-ink-3">متنی ثبت نشده است.</p>}</Panel>
          <Panel title="گردش ارجاع">
            <ol className="relative ms-2 border-s border-line-strong">
              <li className="relative pb-4 ps-5"><span className="absolute -start-[5px] top-2 size-2.5 rounded-full bg-lapis" /><p><b>{names[c.createdById]}</b> مکاتبه را ثبت کرد.</p><p className="text-xs text-ink-3">{formatJalali(c.registeredAt, "datetime")}</p></li>
              {c.referrals.map((r) => (
                <li key={r.id} className="relative pb-4 ps-5 last:pb-0"><span className="absolute -start-[5px] top-2 size-2.5 rounded-full bg-firuze" />
                  <p><b>{names[r.fromUserId]}</b> ← <b>{names[r.toUserId]}</b> <Seal>{REFERRAL_ACTION[r.action]}</Seal> <StatusSeal map={REFERRAL_STATUS} value={r.status} /></p>
                  {(r.instruction || r.note) && <p className="text-sm text-ink-2">{r.instruction ?? r.note}</p>}
                  {r.response && <p className="text-sm text-ink-2">پاسخ: {r.response}</p>}
                  <p className="text-xs text-ink-3">{formatJalali(r.createdAt, "datetime")}{r.seenAt && ` · مشاهده ${formatJalali(r.seenAt, "datetime")}`}{r.dueAt && ` · مهلت ${formatJalali(r.dueAt, "date")}`}</p></li>
              ))}
            </ol>
          </Panel>
          <Panel title="تاریخچه"><Timeline items={timeline} /></Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="مشخصات">
            <DL cols={1} items={[
              { label: c.direction === "INCOMING" ? "فرستنده" : c.direction === "OUTGOING" ? "گیرنده" : "طرف مکاتبه", value: c.externalParty }, { label: "شماره نامه", value: c.externalRef && <span className="ltr num">{c.externalRef}</span> },
              { label: "تاریخ نامه", value: c.letterDate && formatDateOnly(c.letterDate) }, { label: "تاریخ ثبت", value: formatJalali(c.registeredAt, "datetime") }, { label: "مهلت اقدام", value: c.deadline && formatJalali(c.deadline, "date") },
              { label: "پرونده", value: c.case && <Link href={`/cases/${c.case.id}`} className="text-lapis hover:underline">{c.case.title} · {c.case.number}</Link> },
              { label: "مراجعه‌کننده", value: c.client && <Link href={`/clients/${c.client.id}`} className="text-lapis hover:underline">{c.client.displayName}</Link> },
            ]} />
          </Panel>
          <Panel title="پیوست‌ها" action={can(user, "document.upload") && c.status !== "ARCHIVED" && <LinkButton href={`/documents/new?correspondenceId=${id}`} size="sm" variant="ghost">افزودن پیوست</LinkButton>}>
            {docs.length === 0 ? <p className="text-sm text-ink-3">پیوستی ندارد.</p> : <ul className="flex flex-col gap-1.5">{docs.map((d) => <li key={d.id}><Link href={`/documents/${d.id}`} className="text-lapis hover:underline">{d.title}</Link><span className="block text-xs text-ink-3">{d.versions[0]?.fileName}</span></li>)}</ul>}
          </Panel>
          <Panel title="وظایف مرتبط">
            {c.tasks.length === 0 ? <p className="text-sm text-ink-3">وظیفه‌ای ثبت نشده است.</p> : <ul className="flex flex-col gap-1.5">{c.tasks.map((t) => <li key={t.id}><Link href={`/tasks/${t.id}`} className="text-lapis hover:underline">{t.title}</Link> <span className="mono-code">{t.code}</span></li>)}</ul>}
          </Panel>
        </div>
      </div>
    </>
  );
}
