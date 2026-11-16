import { Check, CircleSlash, Play, RotateCcw, Send, Undo2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { LinkButton } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { DL, EmptyState, Notice, PageHeader, Panel } from "@/components/ui/page";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { SmartForm } from "@/components/ui/smart-form";
import { Timeline } from "@/components/ui/timeline";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali, relativeDay } from "@/lib/jalali";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { OPT } from "@/lib/options";
import { faNum } from "@/lib/text";
import { documentScope, taskScope, userNames } from "@/server/access";
import { activityFor } from "@/server/activity";
import { commentTaskAction, reassignTaskAction, reviewTaskAction, taskProgressAction, taskStatusAction, updateTaskAction } from "../actions";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePerm("task.view");
  const { id } = await params;
  const t = await db.task.findFirst({
    where: { id, AND: [taskScope(user)] },
    include: { case: { select: { id: true, number: true, title: true } }, client: { select: { id: true, displayName: true } }, steps: { orderBy: { order: "asc" } }, comments: { orderBy: { createdAt: "asc" } }, department: true, correspondence: { select: { id: true, refNumber: true, subject: true } } },
  });
  if (!t) notFound();
  const [names, assignments, docs, timeline] = await Promise.all([
    userNames([t.assigneeId, t.createdById, t.approverId, ...t.steps.map((s) => s.approverId), ...t.comments.map((c) => c.authorId)]),
    db.assignment.findMany({ where: { entityType: "Task", entityId: id }, orderBy: { createdAt: "asc" } }),
    db.document.findMany({ where: { taskId: id, AND: [documentScope(user)] }, select: { id: true, title: true, code: true } }),
    activityFor({ entityType: "Task", entityId: id }),
  ]);
  const aNames = await userNames(assignments.flatMap((a) => [a.fromUserId, a.toUserId, a.byUserId]));
  const now = new Date();
  const isAssignee = t.assigneeId === user.id;
  const isOwner = t.createdById === user.id || can(user, "task.view_all");
  const pendingStep = t.steps.find((s) => s.status === "PENDING");
  const canReview = t.status === "WAITING_REVIEW" && !isAssignee && ((pendingStep?.approverId ?? t.approverId) === user.id || (can(user, "task.approve") && can(user, "task.view_all")));
  const open = !["DONE", "CANCELLED"].includes(t.status);
  const late = open && t.dueAt && t.dueAt < now;
  const canPick = !t.assigneeId && t.status === "TODO" && (t.departmentId === user.departmentId || isOwner);

  return (
    <>
      <PageHeader title={t.title} crumbs={[{ label: "وظایف", href: "/tasks" }, { label: t.code }]}
        meta={<><span className="mono-code">{t.code}</span><StatusSeal map={TASK_STATUS} value={t.status} /><StatusSeal map={PRIORITY} value={t.priority} />{late && <Seal tone="danger" dot>معوق</Seal>}{t.requiresApproval && <Seal tone="info">نیازمند تأیید</Seal>}</>}
        actions={<>
          {(isAssignee || canPick) && (t.status === "TODO" || t.status === "REJECTED") && <ActionButton action={taskStatusAction} payload={{ id, to: "IN_PROGRESS" }} variant="primary" successMessage="کار روی وظیفه آغاز شد."><Play />{canPick ? "برداشتن و شروع" : t.status === "REJECTED" ? "شروع اصلاح" : "شروع کار"}</ActionButton>}
          {isAssignee && t.status === "IN_PROGRESS" && (
            <FormDialog trigger={t.requiresApproval ? "اعلام انجام و ارسال برای تأیید" : "تکمیل وظیفه"} icon={<Check />} title="ثبت نتیجه اقدام" action={taskStatusAction} hidden={{ id, to: "DONE" }} cols={1} submitLabel="ثبت نتیجه" successMessage={t.requiresApproval ? "برای تأیید ارسال شد." : "وظیفه تکمیل شد."}
              fields={[{ name: "result", label: "نتیجه اقدامات انجام‌شده", type: "textarea", rows: 4, required: true }]} />
          )}
          {isAssignee && t.status === "IN_PROGRESS" && <ActionButton action={taskStatusAction} payload={{ id, to: "TODO" }} successMessage="به صف بازگشت."><Undo2 />بازگشت به صف</ActionButton>}
          {canReview && <ActionButton action={reviewTaskAction} payload={{ id, approve: true }} variant="accent" askNote="comment" noteLabel="نظر (اختیاری)" confirm={{ title: "تأیید نتیجه وظیفه" }} confirmLabel="تأیید" successMessage="تأیید شد."><Check />تأیید</ActionButton>}
          {canReview && <ActionButton action={reviewTaskAction} payload={{ id, approve: false }} variant="danger" askNote="comment" noteLabel="دلیل برگشت" noteRequired confirm={{ title: "برگشت‌دادن نتیجه" }} confirmLabel="برگشت برای اصلاح" successMessage="برای اصلاح برگشت داده شد."><RotateCcw />رد و برگشت</ActionButton>}
          {can(user, "task.assign") && open && (
            <FormDialog trigger="ارجاع به دیگری" triggerVariant="secondary" icon={<Send />} title="ارجاع وظیفه" action={reassignTaskAction} hidden={{ id }} cols={1} submitLabel="ارجاع" successMessage="وظیفه ارجاع شد."
              fields={[{ name: "toUserId", label: "مجری جدید", type: "lookup", lookup: "user", required: true }, { name: "note", label: "توضیح", type: "textarea", rows: 2 }]} />
          )}
          {(isOwner || isAssignee) && open && (
            <FormDialog trigger="ویرایش" triggerVariant="secondary" title="ویرایش وظیفه" action={updateTaskAction} hidden={{ id, version: t.version }} successMessage="ذخیره شد."
              fields={[{ name: "title", label: "عنوان", required: true, span: 2 }, { name: "priority", label: "اولویت", type: "select", required: true, options: OPT.priority }, { name: "dueDate", label: "مهلت انجام", type: "jdate" }, { name: "dueTime", label: "ساعت", type: "time" }, { name: "description", label: "شرح", type: "textarea", rows: 3 }]}
              initial={{ title: t.title, priority: t.priority, description: t.description ?? "", dueDate: t.dueAt ? formatJalali(t.dueAt, "input") : "", dueTime: t.dueAt ? formatJalali(t.dueAt, "inputTime") : "" }} />
          )}
          {isOwner && open && <ActionButton action={taskStatusAction} payload={{ id, to: "CANCELLED" }} variant="danger" confirm={{ title: "لغو وظیفه", body: "وظیفه لغو می‌شود و در تاریخچه باقی می‌ماند." }} successMessage="وظیفه لغو شد."><CircleSlash />لغو</ActionButton>}
        </>} />

      {t.status === "REJECTED" && t.rejectionReason && <div className="mb-4"><Notice tone="danger" title="نتیجه برگشت خورده است">{t.rejectionReason}</Notice></div>}
      {t.status === "WAITING_REVIEW" && <div className="mb-4"><Notice tone="warning">منتظر تأیید {names[pendingStep?.approverId ?? t.approverId ?? ""] ?? "تأییدکننده"}{pendingStep ? ` (${pendingStep.title})` : ""}</Notice></div>}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Panel title="شرح وظیفه">
            {t.description ? <p className="whitespace-pre-wrap leading-8">{t.description}</p> : <p className="text-ink-3">شرحی ثبت نشده است.</p>}
            {t.result && <div className="mt-4 rounded-md border border-sabz/30 bg-sabz-50 p-3"><p className="text-sm font-bold text-sabz">نتیجه اقدام</p><p className="mt-1 whitespace-pre-wrap leading-7">{t.result}</p></div>}
          </Panel>
          {isAssignee && t.status === "IN_PROGRESS" && (
            <Panel title="پیشرفت کار">
              <div className="mb-3 flex items-center gap-3"><div className="h-2.5 flex-1 rounded-full bg-line"><div className="h-full rounded-full bg-firuze" style={{ width: `${t.progress}%` }} /></div><span className="num font-bold">{faNum(t.progress)}٪</span></div>
              <div className="flex flex-wrap gap-2">{[10, 25, 50, 75, 90].map((p) => <ActionButton key={p} action={taskProgressAction} payload={{ id, progress: p }} size="sm" variant={t.progress === p ? "accent" : "secondary"} successMessage="پیشرفت ثبت شد.">{`${faNum(p)}٪`}</ActionButton>)}</div>
            </Panel>
          )}
          {t.steps.length > 0 && (
            <Panel title="گردش تأیید">
              <ol className="flex flex-col gap-2">{t.steps.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                  <span className="num flex size-6 items-center justify-center rounded-full bg-ink/5 text-xs font-bold">{faNum(s.order)}</span>
                  <span className="flex-1"><span className="font-medium">{s.title}</span> — {names[s.approverId] ?? "—"}{s.comment && <span className="block text-sm text-ink-2">{s.comment}</span>}</span>
                  <Seal tone={s.status === "APPROVED" ? "success" : s.status === "REJECTED" ? "danger" : "neutral"}>{s.status === "APPROVED" ? "تأیید شد" : s.status === "REJECTED" ? "رد شد" : "در انتظار"}</Seal>
                </li>
              ))}</ol>
            </Panel>
          )}
          <Panel title="گفت‌وگو و نظرات">
            {t.comments.length === 0 ? <p className="mb-3 text-sm text-ink-3">نظری ثبت نشده است.</p> : (
              <ul className="mb-4 flex flex-col gap-2.5">{t.comments.map((c) => (
                <li key={c.id} className={`rounded-md border border-line p-3 ${c.authorId === user.id ? "bg-firuze-50/40" : "bg-surface-2/50"}`}><p className="whitespace-pre-wrap leading-7">{c.body}</p><p className="mt-1 text-xs text-ink-3">{names[c.authorId] ?? "—"} · {formatJalali(c.createdAt, "datetime")}</p></li>
              ))}</ul>
            )}
            <SmartForm cols={1} action={commentTaskAction} hidden={{ id }} submitLabel="ثبت نظر" successMessage="نظر ثبت شد." resetOnSuccess fields={[{ name: "body", label: "نظر جدید", type: "textarea", rows: 2, required: true }]} />
          </Panel>
          <Panel title="تاریخچه وظیفه"><Timeline items={timeline} /></Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="مشخصات">
            <DL cols={1} items={[
              { label: "مجری", value: t.assigneeId ? names[t.assigneeId] : <span className="text-zafaran">بدون مجری{t.department ? ` (صف واحد ${t.department.name})` : ""}</span> },
              { label: "ارجاع‌دهنده", value: names[t.createdById] },
              { label: "مهلت انجام", value: t.dueAt ? <span className={late ? "font-bold text-mohr" : ""}>{formatJalali(t.dueAt, "datetime")} ({relativeDay(t.dueAt, now)})</span> : null },
              { label: "پرونده", value: t.case && <Link href={`/cases/${t.case.id}`} className="text-lapis hover:underline">{t.case.title} · {t.case.number}</Link> },
              { label: "مراجعه‌کننده", value: t.client && <Link href={`/clients/${t.client.id}`} className="text-lapis hover:underline">{t.client.displayName}</Link> },
              { label: "مکاتبه مرتبط", value: t.correspondence && <Link href={`/cartable/${t.correspondence.id}`} className="text-lapis hover:underline">{t.correspondence.subject}</Link> },
              { label: "تاریخ ایجاد", value: formatJalali(t.createdAt, "datetime") }, { label: "شروع کار", value: t.startedAt && formatJalali(t.startedAt, "datetime") }, { label: "تکمیل", value: t.completedAt && formatJalali(t.completedAt, "datetime") },
            ]} />
          </Panel>
          <Panel title="پیوست‌ها" action={can(user, "document.upload") && open && <LinkButton href={`/documents/new?taskId=${id}`} size="sm" variant="ghost">افزودن</LinkButton>}>
            {docs.length === 0 ? <p className="text-sm text-ink-3">پیوستی ندارد.</p> : <ul className="flex flex-col gap-1.5">{docs.map((d) => <li key={d.id}><Link href={`/documents/${d.id}`} className="text-lapis hover:underline">{d.title}</Link> <span className="mono-code">{d.code}</span></li>)}</ul>}
          </Panel>
          <Panel title="سابقه ارجاع">
            {assignments.length === 0 ? <EmptyState title="ارجاعی ثبت نشده است" /> : <ol className="flex flex-col gap-2 text-sm">{assignments.map((a) => (
              <li key={a.id} className="border-b border-line pb-2 last:border-0"><span className="font-medium">{a.fromUserId ? aNames[a.fromUserId] : "—"}</span> ← <span className="font-medium">{a.toUserId ? aNames[a.toUserId] : "—"}</span>
                <span className="block text-xs text-ink-3">توسط {aNames[a.byUserId]} · {formatJalali(a.createdAt, "datetime")}{a.note ? ` · ${a.note}` : ""}</span></li>))}</ol>}
          </Panel>
        </div>
      </div>
    </>
  );
}
