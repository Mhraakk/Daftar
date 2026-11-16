import Link from "next/link";
import { notFound } from "next/navigation";
import { FileCheck2, FilePen } from "lucide-react";
import { DateSuggestions, type DateItem } from "@/components/ai/date-suggestions";
import { JobView } from "@/components/ai/job-view";
import { ActionButton } from "@/components/ui/action-button";
import { LinkButton } from "@/components/ui/button";
import { DL, Notice, PageHeader, Panel } from "@/components/ui/page";
import { can, requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { formatJalali } from "@/lib/jalali";
import { ASSISTANT_TASKS } from "@/server/ai/assistant";
import { getJobForUser } from "@/server/ai/jobs";
import { jobSnapshot } from "@/server/ai/snapshot";
import { applyRewriteAction } from "../actions";

export const metadata = { title: "نتیجه دستیار" };

const KIND_LABEL = (kind: string): string => {
  if (kind === "skill.run") return "اجرای مهارت حقوقی";
  const task = kind.startsWith("assistant.") ? kind.slice("assistant.".length) : "";
  return (ASSISTANT_TASKS as Record<string, string>)[task] ?? kind;
};

export default async function AssistantJobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const job = await getJobForUser(id, user).catch((e: unknown) => { if (e instanceof AppError) notFound(); throw e; });
  const snapshot = await jobSnapshot(id, user);
  const meta = (job.meta ?? {}) as { suggestions?: DateItem[]; documentIds?: string[] };
  const docId = meta.documentIds?.[0] ?? null;
  const doc = docId ? await db.document.findUnique({ where: { id: docId }, select: { id: true, title: true, caseId: true } }) : null;
  const isOwner = job.userId === user.id;
  const draftLink = job.kind === "assistant.draft" && job.draftId ? `/drafts/${job.draftId}` : null;
  return (
    <>
      <PageHeader title={job.title ?? KIND_LABEL(job.kind)} subtitle={KIND_LABEL(job.kind)}
        crumbs={[{ label: "دستیار هوشمند", href: "/assistant" }, { label: "نتیجه" }]}
        actions={job.skillRunId ? <LinkButton href={`/skills/runs/${job.skillRunId}`} size="sm">مشاهده اجرای مهارت</LinkButton> : undefined} />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Notice tone="warning" title="خروجی هوش مصنوعی — نیازمند بررسی انسانی">این متن را مدل زبانی تولید کرده است و ممکن است نادرست یا ناقص باشد. واقعیت‌ها را با اسناد پرونده و ارجاع‌های قانونی را با متن رسمی تطبیق دهید.</Notice>
          <Panel title="نتیجه"><JobView initial={snapshot} path={`/assistant/${id}`} canCancel={isOwner || can(user, "ai.configure")} /></Panel>
          {job.status === "DONE" && job.kind === "assistant.dates" && (
            <Panel title="مهلت‌های پیشنهادی" icon={<FileCheck2 />}>
              <p className="mb-2 text-sm text-ink-2">هر پیشنهاد را با متن سند تطبیق دهید و فقط موارد درست را ثبت کنید.</p>
              <DateSuggestions items={meta.suggestions ?? []} source="AI_SUGGESTED" caseId={doc?.caseId ?? job.caseId} canCreate={can(user, "deadline.manage")} testId="ai-date-suggestions" />
            </Panel>
          )}
          {job.status === "DONE" && draftLink && (
            <Notice tone="success" title="پیش‌نویس ساخته شد">پیش‌نویس تولیدشده با برچسب «هوش مصنوعی» در کارگاه اسناد قرار گرفت و مانند هر پیش‌نویس دیگر بررسی و تأیید می‌شود. <Link className="text-lapis underline" href={draftLink}>باز کردن پیش‌نویس</Link></Notice>
          )}
          {job.status === "DONE" && job.kind === "assistant.rewrite" && job.draftId && can(user, "draft.create") && (
            <Panel title="اعمال روی پیش‌نویس" icon={<FilePen />}>
              <p className="mb-3 text-sm text-ink-2">پس از بررسی متن بالا، می‌توانید آن را به‌صورت نسخه شماره‌دار تازه روی پیش‌نویس اعمال کنید؛ نسخه فعلی در تاریخچه می‌ماند و قابل بازگردانی است.</p>
              <ActionButton action={applyRewriteAction} payload={{ jobId: id }} variant="primary" size="sm" redirectTo={`/drafts/${job.draftId}`} successMessage="بازنویسی روی پیش‌نویس اعمال شد."
                confirm={{ title: "اعمال بازنویسی", body: "متن پیش‌نویس با متن بازنویسی‌شده جایگزین و نسخه تازه ثبت می‌شود." }}>اعمال روی پیش‌نویس</ActionButton>
            </Panel>
          )}
        </div>
        <Panel title="مشخصات">
          <DL cols={1} items={[
            { label: "زمان ثبت", value: formatJalali(job.createdAt, "datetime") },
            { label: "ارائه‌دهنده و مدل", value: <span dir="ltr">{job.provider} · {job.model}</span> },
            ...(job.case ? [{ label: "پرونده", value: <Link className="text-lapis hover:underline" href={`/cases/${job.case.id}`}>{job.case.title} ({job.case.number})</Link> }] : []),
            ...(doc ? [{ label: "سند", value: <Link className="text-lapis hover:underline" href={`/documents/${doc.id}`}>{doc.title}</Link> }] : []),
            ...(job.draft ? [{ label: "پیش‌نویس", value: <Link className="text-lapis hover:underline" href={`/drafts/${job.draft.id}`}>{job.draft.title}</Link> }] : []),
            { label: "داده ارسالی", value: <span className="text-xs leading-6">{job.contextSummary ?? "—"}</span> },
          ]} />
        </Panel>
      </div>
    </>
  );
}
