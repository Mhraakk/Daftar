import Link from "next/link";
import { History, Scale, Star } from "lucide-react";
import { FilterBar } from "@/components/ui/filter-bar";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { faNum } from "@/lib/text";
import { getAiSettings, isAiReady } from "@/server/ai/config";
import { FEATURED_SKILLS, PLUGIN_LABELS } from "@/server/ai/skill-catalog";

export const metadata = { title: "مهارت‌های حقوقی" };

const MODE: Record<string, { label: string; tone: "success" | "info" | "neutral" }> = {
  RUN: { label: "اجرا در دفتر", tone: "success" },
  REFERENCE: { label: "مرجع — قابل اجرا", tone: "info" },
  AGENT_ONLY: { label: "فقط در Claude Code", tone: "neutral" },
};
const RUN_STATUS: Record<string, string> = { QUEUED: "در صف", RUNNING: "در حال اجرا", DONE: "آماده", FAILED: "ناموفق", CANCELED: "لغوشده" };
const RECENT_RUNS = 6;

type SkillRow = { slug: string; name: string; titleFa: string | null; description: string; mode: string; requiresCase: boolean; license: string; category: string | null };

function SkillCard({ s, caseParam }: { s: SkillRow; caseParam: string }) {
  const m = MODE[s.mode] ?? MODE.RUN;
  return (
    <Link href={`/skills/${s.slug}${caseParam}`} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-lapis/50 hover:bg-surface-2" data-testid="skill-card">
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold">{s.titleFa ?? s.name}</span>
        <Seal tone={m.tone}>{m.label}</Seal>
      </div>
      <span className="text-xs text-ink-3" dir="ltr">{s.slug}</span>
      <p className="line-clamp-3 text-left text-xs leading-5 text-ink-2" dir="ltr">{s.description}</p>
      <div className="mt-auto flex flex-wrap gap-1">
        {s.requiresCase && <Seal tone="warning">نیازمند پرونده</Seal>}
        <Seal tone="neutral">{s.license}</Seal>
      </div>
    </Link>
  );
}

export default async function SkillsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePerm("skill.run");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const caseParam = sp.case ? `?case=${encodeURIComponent(sp.case)}` : "";
  const [skills, settings, runs] = await Promise.all([
    db.legalSkill.findMany({
      where: {
        enabled: true,
        ...(sp.mode ? { mode: sp.mode } : {}),
        ...(sp.cat ? { category: sp.cat } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { titleFa: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { slug: true, name: true, titleFa: true, description: true, mode: true, requiresCase: true, license: true, category: true },
    }),
    getAiSettings(),
    db.skillRun.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: RECENT_RUNS, select: { id: true, title: true, status: true, reviewStatus: true, createdAt: true } }),
  ]);
  const ready = isAiReady(settings);
  const featured = skills.filter((s) => FEATURED_SKILLS.has(s.slug));
  const groups = [...new Set(skills.map((s) => s.category ?? "—"))].map((cat) => ({ cat, items: skills.filter((s) => (s.category ?? "—") === cat) }));
  return (
    <>
      <PageHeader title="مهارت‌های حقوقی" subtitle={`${faNum(skills.length)} مهارت از دو مخزن متن‌باز claude-for-legal و claude-legal-skill — متن هر مهارت بدون تغییر به مدل داده می‌شود`} />
      {!ready.ready && (
        <div className="mb-4"><Notice tone="warning" title="اجرای مهارت‌ها هنوز ممکن نیست">{ready.reason} {can(user, "ai.configure") ? <Link className="text-lapis underline" href="/admin/ai">پیکربندی هوش مصنوعی</Link> : "از مدیر سامانه بخواهید ارائه‌دهنده را پیکربندی کند."}</Notice></div>
      )}
      <div className="mb-4"><Notice tone="info" title="درباره این مهارت‌ها">
        این مهارت‌ها برای کار حقوقی در آمریکا، بریتانیا و اتحادیه اروپا نوشته شده‌اند. «دفتر» روش آن‌ها (فهرست بررسی، نشانه‌های خطر، دروازه‌ها و برچسب‌گذاری منابع) را اجرا می‌کند و از مدل می‌خواهد قاعده خارجی را قانون ایران معرفی نکند و هیچ ماده یا رأیی نسازد. خروجی تا تأیید بررسی‌کننده «در انتظار بررسی» است.
      </Notice></div>
      <div className="mb-4">
        <FilterBar searchPlaceholder="جست‌وجو در نام، عنوان یا شرح مهارت…" filters={[
          { name: "mode", label: "حالت اجرا", options: Object.entries(MODE).map(([value, m]) => ({ value, label: m.label })) },
          { name: "cat", label: "حوزه", options: Object.values(PLUGIN_LABELS).map((v) => ({ value: v, label: v })) },
        ]} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          {skills.length === 0 && <EmptyState icon={<Scale />} title="مهارتی یافت نشد" hint="فیلترها را تغییر دهید." />}
          {featured.length > 0 && !q && !sp.mode && !sp.cat && (
            <Panel title={<span className="flex items-center gap-1"><Star className="size-4 text-zafaran" />پیشنهادی برای کار روزمره دفتر</span>}>
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{featured.map((s) => <SkillCard key={s.slug} s={s} caseParam={caseParam} />)}</div>
            </Panel>
          )}
          {groups.map((g) => (
            <Panel key={g.cat} title={`${g.cat} (${faNum(g.items.length)})`}>
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{g.items.map((s) => <SkillCard key={s.slug} s={s} caseParam={caseParam} />)}</div>
            </Panel>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Panel title={<span className="flex items-center gap-1"><History className="size-4" />اجراهای اخیر من</span>} action={<Link href="/skills/runs" className="text-sm text-lapis hover:underline">همه</Link>}>
            {runs.length === 0 ? <p className="text-sm text-ink-3">هنوز مهارتی اجرا نکرده‌اید.</p> : (
              <ul className="flex flex-col gap-2">{runs.map((r) => (
                <li key={r.id}><Link href={`/skills/runs/${r.id}`} className="block rounded px-2 py-1 hover:bg-surface-2">
                  <span className="line-clamp-2 text-sm font-medium">{r.title}</span>
                  <span className="text-xs text-ink-3">{formatJalali(r.createdAt, "datetime")} · {RUN_STATUS[r.status] ?? r.status}{r.reviewStatus === "APPROVED" ? " · تأییدشده" : ""}</span>
                </Link></li>))}</ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
