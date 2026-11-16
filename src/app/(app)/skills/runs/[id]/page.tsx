import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, CheckCircle2, FilePlus2, User as UserIcon, XCircle } from "lucide-react";
import { FollowupForm } from "@/components/ai/followup-form";
import { JobView } from "@/components/ai/job-view";
import { ActionButton } from "@/components/ui/action-button";
import { DL, Notice, PageHeader, Panel } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { formatJalali } from "@/lib/jalali";
import { formatBytes, faNum } from "@/lib/text";
import { userNames } from "@/server/access";
import type { DataScope } from "@/server/ai/context";
import { renderAiMarkdown } from "@/server/ai/markdown";
import { preflightMarkdown, type PreflightResult } from "@/server/ai/preflight";
import { assertRunAccess, CONTRACT_POSITIONS, DISCLOSURE_OPTIONS } from "@/server/ai/skill-runner";
import { jobSnapshot } from "@/server/ai/snapshot";
import { reviewSkillRunAction, skillRunToDraftAction } from "../../actions";

export const metadata = { title: "اجرای مهارت" };

const RUN_STATUS: Record<string, { label: string; tone: "info" | "accent" | "success" | "danger" | "neutral" }> = {
  QUEUED: { label: "در صف", tone: "info" }, RUNNING: { label: "در حال اجرا", tone: "accent" }, DONE: { label: "آماده", tone: "success" },
  FAILED: { label: "ناموفق", tone: "danger" }, CANCELED: { label: "لغوشده", tone: "neutral" },
};
const REVIEW: Record<string, { label: string; tone: "warning" | "success" | "danger" }> = {
  PENDING_REVIEW: { label: "در انتظار بررسی انسانی", tone: "warning" }, APPROVED: { label: "تأییدشده توسط بررسی‌کننده", tone: "success" }, REJECTED: { label: "ردشده توسط بررسی‌کننده", tone: "danger" },
};
const ACTIVE = new Set(["QUEUED", "RUNNING"]);
const SHORT_SHA = 12;
const REQUEST_OPEN = "<request>";
const REQUEST_CLOSE = "</request>";

type Msg = { role: "user" | "assistant"; content: string; at: string };

/** از پیام کاربر فقط متن درخواست نمایش داده می‌شود (متن اسناد و پرونده در بخش «داده ارسالی» خلاصه شده است) */
function requestText(content: string): string {
  const start = content.lastIndexOf(REQUEST_OPEN);
  const end = content.lastIndexOf(REQUEST_CLOSE);
  return start >= 0 && end > start ? content.slice(start + REQUEST_OPEN.length, end).trim() : content.trim();
}

export default async function SkillRunPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePerm("skill.run");
  const { id } = await params;
  const run = await assertRunAccess(id, user).catch((e: unknown) => { if (e instanceof AppError) notFound(); throw e; });
  const lastJob = await db.aiInteraction.findFirst({ where: { skillRunId: run.id }, orderBy: { createdAt: "desc" }, select: { id: true, userId: true } });
  const canSeeJob = !!lastJob && (lastJob.userId === user.id || can(user, "ai.configure"));
  const snapshot = canSeeJob && lastJob ? await jobSnapshot(lastJob.id, user) : null;
  const names = await userNames([run.userId, run.reviewedById]);
  const messages = (Array.isArray(run.messages) ? run.messages : []) as unknown as Msg[];
  const scope = run.dataScope as unknown as DataScope | null;
  const preflight = (Array.isArray(run.preflight) ? run.preflight : []) as unknown as { title: string; result: PreflightResult }[];
  const gates = (run.gates ?? {}) as { position?: string | null; disclosure?: string | null; conflicts?: number; conflictReviewed?: boolean; depth?: string };
  const isOwner = run.userId === user.id;
  const canReview = can(user, "draft.review") && !isOwner && run.status === "DONE" && run.reviewStatus === "PENDING_REVIEW";
  const st = RUN_STATUS[run.status] ?? RUN_STATUS.QUEUED;
  const rv = REVIEW[run.reviewStatus] ?? REVIEW.PENDING_REVIEW;
  return (
    <>
      <PageHeader title={run.title} crumbs={[{ label: "مهارت‌های حقوقی", href: "/skills" }, { label: run.skill.titleFa ?? run.skill.name, href: `/skills/${run.skill.slug}` }, { label: "اجرا" }]}
        meta={<div className="flex flex-wrap gap-1"><Seal tone={st.tone} dot>{st.label}</Seal>{run.status === "DONE" && <Seal tone={rv.tone}>{rv.label}</Seal>}</div>}
        actions={run.status === "DONE" && can(user, "draft.create") ? (
          <ActionButton action={skillRunToDraftAction} payload={{ runId: run.id }} variant="secondary" size="sm" redirectTo="/drafts/{id}" successMessage="پیش‌نویس ساخته شد." confirm={{ title: "ساخت پیش‌نویس", body: "خروجی مهارت به‌عنوان پیش‌نویس سند (با برچسب هوش مصنوعی) در کارگاه اسناد ساخته می‌شود و در گردش‌کار عادی بررسی و تأیید قرار می‌گیرد." }}>
            <FilePlus2 />ساخت پیش‌نویس سند
          </ActionButton>) : undefined} />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <Notice tone="warning" title="خروجی هوش مصنوعی — نیازمند بررسی انسانی">این متن را مدل زبانی با اجرای مهارت «{run.skill.name}» تولید کرده است. ارجاع‌های قانونی با برچسب <span dir="ltr">[model knowledge — verify]</span> یا <span dir="ltr">[CITE NEEDED]</span> باید با متن رسمی تطبیق داده شوند. پیش از هر استفاده، بررسی‌کننده مجاز باید آن را تأیید کند.</Notice>
          {messages.map((m, i) => (
            m.role === "user" ? (
              <div key={`${m.at}-${i}`} className="rounded-lg border border-line bg-surface-2/50 p-3" data-testid="run-user-message">
                <p className="mb-1 flex items-center gap-1 text-xs text-ink-3"><UserIcon className="size-3.5" />{names[run.userId] ?? "کاربر"} · {formatJalali(new Date(m.at), "datetime")}</p>
                <p className="whitespace-pre-wrap text-sm">{requestText(m.content)}</p>
              </div>
            ) : (
              <div key={`${m.at}-${i}`} className="rounded-lg border border-line bg-surface p-4" data-testid="run-output">
                <p className="mb-2 flex items-center gap-1 text-xs text-ink-3"><Bot className="size-3.5" />خروجی مدل · {formatJalali(new Date(m.at), "datetime")}</p>
                {/* خروجی مدل روی سرور با فهرست سفید برچسب‌ها پاک‌سازی می‌شود */}
                <div className="prose-md" dangerouslySetInnerHTML={{ __html: renderAiMarkdown(m.content) }} />
              </div>
            )
          ))}
          {snapshot && ACTIVE.has(snapshot.status) && (
            <Panel title="پاسخ در حال تولید"><JobView initial={snapshot} path={`/skills/runs/${run.id}`} canCancel={isOwner || can(user, "ai.configure")} /></Panel>
          )}
          {snapshot && snapshot.status === "FAILED" && run.status === "FAILED" && <JobView initial={snapshot} path={`/skills/runs/${run.id}`} canCancel={false} showOutput={false} />}
          {!snapshot && ACTIVE.has(run.status) && <Notice tone="info">پاسخ در حال آماده‌شدن است.</Notice>}
          {isOwner && run.status === "DONE" && <Panel title="ادامه گفت‌وگو با مهارت"><FollowupForm runId={run.id} /></Panel>}
          {preflight.length > 0 && (
            <Panel title="فهرست بررسی پیش از تحلیل (بدون هوش مصنوعی)">
              {preflight.map((p) => <div key={p.title} className="prose-md text-sm" dangerouslySetInnerHTML={{ __html: renderAiMarkdown(preflightMarkdown(p.result, p.title)) }} />)}
            </Panel>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="بررسی انسانی">
            <DL cols={1} items={[
              { label: "وضعیت", value: <Seal tone={rv.tone}>{rv.label}</Seal> },
              ...(run.reviewedById ? [{ label: "بررسی‌کننده", value: `${names[run.reviewedById] ?? "—"} — ${run.reviewedAt ? formatJalali(run.reviewedAt, "datetime") : ""}` }] : []),
              ...(run.reviewNote ? [{ label: "توضیح", value: run.reviewNote }] : []),
            ]} />
            {canReview && (
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton action={reviewSkillRunAction} payload={{ runId: run.id, decision: "APPROVED" }} variant="accent" size="sm" askNote="note" noteLabel="توضیح بررسی (اختیاری)" confirmLabel="تأیید خروجی" successMessage="خروجی تأیید شد."><CheckCircle2 />تأیید</ActionButton>
                <ActionButton action={reviewSkillRunAction} payload={{ runId: run.id, decision: "REJECTED" }} variant="danger" size="sm" askNote="note" noteLabel="دلیل رد" noteRequired confirmLabel="رد خروجی" successMessage="خروجی رد شد."><XCircle />رد</ActionButton>
              </div>
            )}
            {!canReview && run.status === "DONE" && run.reviewStatus === "PENDING_REVIEW" && <p className="mt-2 text-xs text-ink-3">{isOwner ? "آغازکننده اجرا نمی‌تواند خروجی خود را تأیید کند." : "تأیید خروجی با دارنده مجوز «بررسی و تأیید پیش‌نویس» است."}</p>}
          </Panel>
          <Panel title="مشخصات اجرا">
            <DL cols={1} items={[
              { label: "مهارت", value: <Link className="text-lapis hover:underline" href={`/skills/${run.skill.slug}`} dir="ltr">{run.skill.slug}</Link> },
              { label: "آغازکننده", value: `${names[run.userId] ?? "—"} — ${formatJalali(run.createdAt, "datetime")}` },
              ...(run.case ? [{ label: "پرونده", value: <Link className="text-lapis hover:underline" href={`/cases/${run.case.id}`}>{run.case.title} ({run.case.number})</Link> }] : []),
              ...(gates.position ? [{ label: "موقعیت در قرارداد", value: CONTRACT_POSITIONS[gates.position] ?? gates.position }] : []),
              ...(gates.disclosure ? [{ label: "پاسخ پرسش اسناد افشاشده", value: DISCLOSURE_OPTIONS[gates.disclosure] ?? gates.disclosure }] : []),
              ...(run.case ? [{ label: "بررسی تعارض", value: gates.conflicts ? `${faNum(gates.conflicts)} مورد احتمالی — ${gates.conflictReviewed ? "بررسی‌شده" : "—"}` : "موردی یافت نشد" }] : []),
              { label: "نمایه تمرین", value: gates.depth === "full" ? "کامل (بخش‌های راهنمای افزونه)" : "فشرده (ظرفیت مدل کم)" },
              { label: "اثر انگشت مهارت", value: <span className="num text-xs" dir="ltr">{run.skillSha256.slice(0, SHORT_SHA)}…</span> },
            ]} />
          </Panel>
          {scope && (
            <Panel title="داده ارسالی">
              <p className="mb-2 text-sm"><Seal tone={scope.external ? "warning" : "success"}>{scope.external ? "بیرون از شبکه دفتر" : "داخل شبکه دفتر"}</Seal></p>
              <p className="mb-2 text-xs text-ink-2" dir="ltr">{scope.destination.split(": ").slice(1).join(": ")}</p>
              <ul className="flex flex-col gap-1 text-xs text-ink-2">{scope.items.map((it) => <li key={it.label} className="flex justify-between gap-2"><span>{it.label}</span><span className="num">{formatBytes(it.bytes)}</span></li>)}</ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
