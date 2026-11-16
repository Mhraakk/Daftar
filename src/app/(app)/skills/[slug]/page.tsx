import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileCode2 } from "lucide-react";
import { SkillRunForm } from "@/components/ai/skill-run-form";
import { ActionButton } from "@/components/ui/action-button";
import { DL, Notice, PageHeader, Panel } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { CONFIDENTIALITY } from "@/lib/labels";
import { formatBytes } from "@/lib/text";
import { caseScope, documentScope } from "@/server/access";
import { getAiSettings, isAiReady, isExternalProvider } from "@/server/ai/config";
import { renderAiMarkdown } from "@/server/ai/markdown";
import { readSkillText } from "@/server/ai/skill-catalog";
import { CONTRACT_POSITIONS, DISCLOSURE_OPTIONS } from "@/server/ai/skill-runner";
import { toggleSkillAction } from "../../admin/ai/actions";

const MAX_DOCS = 12;
const RUN_STATUS: Record<string, string> = { QUEUED: "در صف", RUNNING: "در حال اجرا", DONE: "آماده", FAILED: "ناموفق", CANCELED: "لغوشده" };
const REVIEW: Record<string, { label: string; tone: "warning" | "success" | "danger" }> = {
  PENDING_REVIEW: { label: "در انتظار بررسی", tone: "warning" }, APPROVED: { label: "تأییدشده", tone: "success" }, REJECTED: { label: "ردشده", tone: "danger" },
};
const SHORT_SHA = 12;
const RECENT = 10;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await db.legalSkill.findUnique({ where: { slug: decodeURIComponent(slug) }, select: { titleFa: true, name: true } });
  return { title: s ? s.titleFa ?? s.name : "مهارت" };
}

export default async function SkillPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePerm("skill.run");
  const { slug } = await params;
  const sp = await searchParams;
  const skill = await db.legalSkill.findUnique({ where: { slug: decodeURIComponent(slug) } });
  if (!skill) notFound();
  const settings = await getAiSettings();
  const ready = isAiReady(settings);
  const external = isExternalProvider(settings);
  let host = settings.baseUrl;
  try { host = new URL(settings.baseUrl).host; } catch { /* نشانی نامعتبر در فرم تنظیمات رد می‌شود */ }
  let text = "";
  let textError: string | null = null;
  try { text = readSkillText(skill); } catch (e) { textError = e instanceof Error ? e.message : String(e); }
  const [kase, docs, runs] = await Promise.all([
    sp.case ? db.case.findFirst({ where: { id: sp.case, AND: [caseScope(user)] }, select: { id: true, title: true, number: true } }) : null,
    sp.doc ? db.document.findMany({ where: { id: { in: sp.doc.split(",") }, AND: [documentScope(user)] }, select: { id: true, title: true, code: true, category: true, confidentiality: true, versions: { orderBy: { versionNo: "desc" }, take: 1, select: { textStatus: true } } } }) : [],
    db.skillRun.findMany({ where: { skillId: skill.id, userId: user.id }, orderBy: { createdAt: "desc" }, take: RECENT, select: { id: true, title: true, status: true, reviewStatus: true, createdAt: true } }),
  ]);
  const at = skill.origin.indexOf("@");
  const repo = at > 0 ? skill.origin.slice(0, at) : null;
  const commit = at > 0 ? skill.origin.slice(at + 1).split("/")[0] : null;
  const repoPath = skill.plugin === "claude-legal-skill" ? "skill.md" : skill.path.split("/").slice(1).join("/");
  const sourceUrl = repo && commit ? `${repo}/blob/${commit}/${repoPath}` : null;
  const pluginName = skill.plugin === "claude-legal-skill" ? null : skill.plugin;
  return (
    <>
      <PageHeader title={skill.titleFa ?? skill.name} subtitle={<span dir="ltr">{skill.slug}</span>}
        crumbs={[{ label: "مهارت‌های حقوقی", href: "/skills" }, { label: skill.category ?? skill.plugin }]}
        meta={<div className="flex flex-wrap gap-1">
          <Seal tone={skill.mode === "AGENT_ONLY" ? "neutral" : "success"}>{skill.mode === "AGENT_ONLY" ? "فقط در Claude Code" : "قابل اجرا در دفتر"}</Seal>
          {skill.requiresCase && <Seal tone="warning">نیازمند پرونده</Seal>}
          <Seal tone="neutral">{skill.license}</Seal>
        </div>}
        actions={can(user, "skill.manage") ? <ActionButton action={toggleSkillAction} payload={{ slug: skill.slug, enabled: !skill.enabled }} size="sm" variant="ghost" successMessage="وضعیت مهارت تغییر کرد.">{skill.enabled ? "غیرفعال‌سازی" : "فعال‌سازی"}</ActionButton> : undefined} />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          {!skill.enabled && <Notice tone="warning">این مهارت غیرفعال است.</Notice>}
          {skill.mode === "AGENT_ONLY" ? (
            <Panel title="اجرا در Claude Code">
              <Notice tone="info">این مهارت به پرونده‌های تنظیمات تمرین، دفترچه‌های ماندگار روی دیسک (مانند فهرست تمدید، پوشه پرونده یا ثبت مرخصی) یا اتصال بیرونی وابسته است و درون «دفتر» اجرا نمی‌شود. معادل‌های درون‌برنامه: پرونده‌ها، مهلت‌ها و یادآورها، تاریخچه فعالیت‌ها و تنظیمات هوش مصنوعی.</Notice>
              {pluginName && (
                <pre className="mt-3 overflow-x-auto rounded bg-surface-2 p-3 text-xs" dir="ltr">{`claude plugin marketplace add anthropics/claude-for-legal
claude plugin install ${pluginName}@claude-for-legal
/${pluginName}:${skill.name}`}</pre>
              )}
            </Panel>
          ) : (
            <Panel title="اجرای مهارت">
              {!ready.ready && <div className="mb-3"><Notice tone="warning" title="هوش مصنوعی آماده نیست">{ready.reason} {can(user, "ai.configure") && <Link className="text-lapis underline" href="/admin/ai">پیکربندی</Link>}</Notice></div>}
              {skill.mode === "REFERENCE" && <div className="mb-3"><Notice tone="info">این مهارت در مخزن اصلی «مرجع» است و معمولاً از مهارت دیگری فراخوانده می‌شود؛ اجرای مستقیم آن روی سند نیز ممکن است.</Notice></div>}
              <SkillRunForm
                skill={{ slug: skill.slug, title: skill.titleFa ?? skill.name, requiresCase: skill.requiresCase, argumentHint: skill.argumentHint, sizeBytes: skill.sizeBytes, askPosition: skill.slug === "claude-legal-skill.contract-review", askDisclosure: skill.slug === "litigation-legal.privilege-log-review" }}
                positions={CONTRACT_POSITIONS} disclosureOptions={DISCLOSURE_OPTIONS} external={external}
                destination={`${external ? "بیرون از شبکه دفتر" : "شبکه داخلی دفتر"} — ${host} (${settings.model})`}
                canConfidential={can(user, "document.view_confidential")} maxDocs={MAX_DOCS}
                initialCase={kase ? { id: kase.id, label: `${kase.title} (${kase.number})` } : null}
                initialDocs={docs.map((d) => ({ id: d.id, label: d.title, sub: `${d.code} · ${d.category} · ${CONFIDENTIALITY[d.confidentiality]?.label ?? ""}`, confidential: d.confidentiality !== "NORMAL", hasText: ["EXTRACTED", "OCR_DONE"].includes(d.versions[0]?.textStatus ?? "") }))} />
            </Panel>
          )}
          <Panel title={<span className="flex items-center gap-1"><FileCode2 className="size-4" />متن کامل مهارت (بدون تغییر)</span>}>
            {textError ? <Notice tone="danger">{textError}</Notice> : (
              <details>
                <summary className="cursor-pointer text-sm text-lapis">نمایش SKILL.md ({formatBytes(skill.sizeBytes)})</summary>
                {/* متن مهارت از مخزن متن‌باز است و پیش از نمایش با فهرست سفید برچسب‌ها پاک‌سازی می‌شود */}
                <div className="prose-md prose-ltr mt-3 max-h-[70vh] overflow-y-auto rounded border border-line p-3 text-sm" dangerouslySetInnerHTML={{ __html: renderAiMarkdown(text) }} />
              </details>
            )}
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="مشخصات">
            <DL cols={1} items={[
              { label: "شرح (از مخزن)", value: <span className="block text-left text-sm" dir="ltr">{skill.description}</span> },
              { label: "مخزن و نسخه", value: sourceUrl ? <a className="flex items-center gap-1 text-lapis underline" href={sourceUrl} target="_blank" rel="noreferrer noopener" dir="ltr">{repo?.replace("https://github.com/", "")} @ {commit}<ExternalLink className="size-3" /></a> : skill.origin },
              { label: "مجوز", value: skill.license },
              { label: "اثر انگشت SHA-256", value: <span className="num text-xs" dir="ltr">{skill.sha256.slice(0, SHORT_SHA)}…</span> },
              ...(skill.version ? [{ label: "نسخه مهارت", value: skill.version }] : []),
              { label: "همگام‌سازی", value: formatJalali(skill.syncedAt, "datetime") },
            ]} />
          </Panel>
          <Panel title="اجراهای من">
            {runs.length === 0 ? <p className="text-sm text-ink-3">هنوز این مهارت را اجرا نکرده‌اید.</p> : (
              <ul className="flex flex-col gap-2">{runs.map((r) => (
                <li key={r.id}><Link href={`/skills/runs/${r.id}`} className="block rounded px-2 py-1 hover:bg-surface-2">
                  <span className="line-clamp-2 text-sm">{r.title}</span>
                  <span className="flex flex-wrap items-center gap-1 text-xs text-ink-3">{formatJalali(r.createdAt, "datetime")} · {RUN_STATUS[r.status] ?? r.status}{r.status === "DONE" && <Seal tone={REVIEW[r.reviewStatus]?.tone ?? "warning"}>{REVIEW[r.reviewStatus]?.label ?? r.reviewStatus}</Seal>}</span>
                </Link></li>))}</ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
