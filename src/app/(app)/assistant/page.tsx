import Link from "next/link";
import { Sparkles } from "lucide-react";
import { AssistantForm } from "@/components/ai/assistant-form";
import { Notice, PageHeader, Panel } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { CONFIDENTIALITY, LEGAL_DOC_TYPES } from "@/lib/labels";
import { caseScope, documentScope, draftScope } from "@/server/access";
import { ASSISTANT_TASKS, type AssistantTask } from "@/server/ai/assistant";
import { getAiSettings, isAiReady, isExternalProvider } from "@/server/ai/config";

export const metadata = { title: "دستیار هوشمند" };

const MAX_DOCS = 8;
const RECENT = 12;
const STATUS: Record<string, { label: string; tone: "info" | "accent" | "success" | "danger" | "neutral" }> = {
  QUEUED: { label: "در صف", tone: "info" }, RUNNING: { label: "در حال اجرا", tone: "accent" }, DONE: { label: "آماده", tone: "success" },
  FAILED: { label: "ناموفق", tone: "danger" }, CANCELED: { label: "لغوشده", tone: "neutral" },
};

export default async function AssistantPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePerm("ai.use");
  const sp = await searchParams;
  const settings = await getAiSettings();
  const ready = isAiReady(settings);
  const external = isExternalProvider(settings);
  let host = settings.baseUrl;
  try { host = new URL(settings.baseUrl).host; } catch { /* نشانی نامعتبر در فرم تنظیمات رد می‌شود */ }
  const task = (sp.task && sp.task in ASSISTANT_TASKS ? sp.task : "case_analysis") as AssistantTask;
  const [kase, docs, draft, recent] = await Promise.all([
    sp.case ? db.case.findFirst({ where: { id: sp.case, AND: [caseScope(user)] }, select: { id: true, title: true, number: true } }) : null,
    sp.doc ? db.document.findMany({ where: { id: { in: sp.doc.split(",") }, AND: [documentScope(user)] }, select: { id: true, title: true, code: true, category: true, confidentiality: true, versions: { orderBy: { versionNo: "desc" }, take: 1, select: { textStatus: true } } } }) : [],
    sp.draft ? db.legalDraft.findFirst({ where: { id: sp.draft, AND: [draftScope(user)] }, select: { id: true, title: true } }) : null,
    db.aiInteraction.findMany({ where: { userId: user.id, kind: { startsWith: "assistant." } }, orderBy: { createdAt: "desc" }, take: RECENT, select: { id: true, title: true, status: true, createdAt: true } }),
  ]);
  return (
    <>
      <PageHeader title="دستیار هوشمند" subtitle="تحلیل پرونده، خلاصه سند، پرسش، بازنویسی رسمی، تهیه پیش‌نویس و استخراج مهلت — همه خروجی‌ها نیازمند بررسی انسانی‌اند" />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Panel title={<span className="flex items-center gap-1"><Sparkles className="size-4 text-firuze" />درخواست تازه</span>}>
          {!ready.ready && <div className="mb-4"><Notice tone="warning" title="دستیار هنوز پیکربندی نشده است">{ready.reason} {can(user, "ai.configure") ? <Link className="text-lapis underline" href="/admin/ai">پیکربندی هوش مصنوعی</Link> : "از مدیر سامانه بخواهید ارائه‌دهنده را پیکربندی کند."}</Notice></div>}
          <AssistantForm tasks={ASSISTANT_TASKS} docTypes={LEGAL_DOC_TYPES} external={external} destination={`${external ? "بیرون از شبکه دفتر" : "شبکه داخلی دفتر"} — ${host} (${settings.model})`}
            canConfidential={can(user, "document.view_confidential")} canDraft={can(user, "draft.create")} maxDocs={MAX_DOCS}
            initial={{
              task: draft ? "rewrite" : task, caseId: kase?.id, caseLabel: kase ? `${kase.title} (${kase.number})` : undefined, draftId: draft?.id, draftTitle: draft?.title,
              docs: docs.map((d) => ({ id: d.id, label: d.title, sub: `${d.code} · ${d.category} · ${CONFIDENTIALITY[d.confidentiality]?.label ?? ""}`, confidential: d.confidentiality !== "NORMAL", hasText: ["EXTRACTED", "OCR_DONE"].includes(d.versions[0]?.textStatus ?? "") })),
            }} />
        </Panel>
        <Panel title="درخواست‌های اخیر من">
          {recent.length === 0 ? <p className="text-sm text-ink-3">هنوز درخواستی ثبت نکرده‌اید.</p> : (
            <ul className="flex flex-col gap-2">{recent.map((j) => (
              <li key={j.id}><Link href={`/assistant/${j.id}`} className="block rounded px-2 py-1 hover:bg-surface-2">
                <span className="line-clamp-2 text-sm font-medium">{j.title}</span>
                <span className="flex items-center gap-1 text-xs text-ink-3">{formatJalali(j.createdAt, "datetime")} <Seal tone={STATUS[j.status]?.tone ?? "neutral"}>{STATUS[j.status]?.label ?? j.status}</Seal></span>
              </Link></li>))}</ul>
          )}
        </Panel>
      </div>
    </>
  );
}
