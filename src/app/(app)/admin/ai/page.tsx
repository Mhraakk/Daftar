import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { ConnectionTest } from "@/components/ai/connection-test";
import { ColumnChart, LineChart } from "@/components/charts";
import { ActionButton } from "@/components/ui/action-button";
import { Notice, PageHeader, Panel, Stat } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { SmartForm } from "@/components/ui/smart-form";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali, relativeTime } from "@/lib/jalali";
import { faNum } from "@/lib/text";
import { EFFORTS, getAiSettings, isExternalProvider, publicAiSettings } from "@/server/ai/config";
import { getQueueState } from "@/server/ai/jobs";
import { aiUsage } from "@/server/usage-charts";
import { resolveUi } from "@/theme/prefs";
import { saveAiSettingsAction, syncSkillsAction } from "./actions";

export const metadata = { title: "هوش مصنوعی" };

const JOB_STATUS: Record<string, { label: string; tone: "info" | "accent" | "success" | "danger" | "neutral" }> = {
  QUEUED: { label: "در صف", tone: "info" }, RUNNING: { label: "در حال اجرا", tone: "accent" }, DONE: { label: "انجام شد", tone: "success" },
  FAILED: { label: "ناموفق", tone: "danger" }, CANCELED: { label: "لغو شد", tone: "neutral" },
};
const MODE_LABEL: Record<string, string> = { RUN: "قابل اجرا در دفتر", REFERENCE: "مرجع (قابل اجرا)", AGENT_ONLY: "فقط در Claude Code" };
const RECENT_JOBS = 25;
const MS_PER_SEC = 1_000;
// eslint-disable-next-line ts-patterns/no-magic-numbers -- FieldDef.span needs the literal type 2
const FULL = 2 as const;
const NOTE_ROWS = 3;
const SHORT_SHA = 7;

/** بازه نمودارهای مصرف (هفته) */
const USAGE_WEEKS = 8;
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export default async function AiAdminPage() {
  const user = await requirePagePerm("ai.configure");
  const [settings, queue, jobs, modes, plugins, sources, usage, ui] = await Promise.all([
    getAiSettings(), getQueueState(),
    db.aiInteraction.findMany({ orderBy: { createdAt: "desc" }, take: RECENT_JOBS, select: { id: true, kind: true, title: true, provider: true, model: true, status: true, inputTokens: true, outputTokens: true, durationMs: true, createdAt: true, userId: true } }),
    db.legalSkill.groupBy({ by: ["mode"], where: { enabled: true }, _count: true }),
    db.legalSkill.groupBy({ by: ["category"], _count: true, orderBy: { category: "asc" } }),
    import("node:fs").then((fs) => {
      try { return (JSON.parse(fs.readFileSync(`${process.cwd()}/vendor/legal-skills/SOURCES.json`, "utf8")) as { sources: { id: string; repo: string; commit: string; license: string }[] }).sources; } catch { return []; }
    }),
    aiUsage(USAGE_WEEKS),
    resolveUi(user.id),
  ]);
  const users = Object.fromEntries((await db.user.findMany({ where: { id: { in: [...new Set(jobs.map((j) => j.userId))] } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  const pub = publicAiSettings(settings);
  const external = isExternalProvider(settings);
  return (
    <>
      <PageHeader title="هوش مصنوعی" subtitle="ارائه‌دهنده مدل، سیاست ارسال داده، صف اجرا و کتابخانه مهارت‌های حقوقی" />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="وضعیت" value={settings.enabled ? "فعال" : "غیرفعال"} tone={settings.enabled ? "success" : "neutral"} hint={settings.enabled ? settings.model : "تا فعال‌سازی، هیچ داده‌ای ارسال نمی‌شود"} />
        <Stat label="محل پردازش" value={external ? "بیرون از دفتر" : "شبکه داخلی"} tone={external ? "warning" : "success"} hint={settings.baseUrl} />
        <Stat label="سرویس پس‌زمینه" value={queue.workerAlive ? "فعال" : "پاسخ نمی‌دهد"} tone={queue.workerAlive ? "success" : "danger"} hint={queue.heartbeatAt ? `آخرین ضربان: ${relativeTime(new Date(queue.heartbeatAt))}` : "هنوز ضربانی ثبت نشده"} />
        <Stat label="صف" value={`${faNum(queue.queued)} / ${faNum(queue.running)}`} hint="در انتظار / در حال اجرا" />
      </div>
      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Panel title="اجراها و خطاهای هوش مصنوعی در ۸ هفته اخیر" bodyClass="chart-in-panel">
          <LineChart title="اجراها و خطاهای هوش مصنوعی" unit="اجرا" dir={ui.chartTimeAxis} labels={usage.labels} longLabels={usage.long}
            series={[{ name: "همه اجراها", values: usage.runs, token: "chart-1" }, { name: "ناموفق", values: usage.failed, token: "chart-neg" }]}
            summary={`${faNum(sum(usage.runs))} اجرا و ${faNum(sum(usage.failed))} خطا در ۸ هفته اخیر (هفته از شنبه).`} />
        </Panel>
        <Panel title="توکن مصرفی در هفته" bodyClass="chart-in-panel">
          <ColumnChart title="توکن مصرفی در هفته" unit="توکن" dir={ui.chartTimeAxis} seriesLabel="توکن ورودی و خروجی"
            data={usage.labels.map((label, i) => ({ label, long: usage.long[i], value: usage.tokens[i] }))}
            summary={`${faNum(sum(usage.tokens))} توکن در ۸ هفته؛ میانگین زمان پاسخ در هفته جاری ${faNum(Number((usage.avgSeconds.at(-1) ?? 0).toFixed(1)))} ثانیه.`} />
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Panel title="ارائه‌دهنده و سیاست داده">
          <Notice tone="info" title="بدون پیکربندی، بدون خروجی ساختگی">
            دو نوع ارائه‌دهنده پشتیبانی می‌شود: API رسمی Anthropic (مدل‌های Claude، بیرون از شبکه دفتر) و هر سرور سازگار با OpenAI مانند Ollama، llama.cpp، vLLM یا LM Studio روی شبکه داخلی دفتر (بدون خروج داده و بدون نیاز به اینترنت). کلید API رمزنگاری‌شده ذخیره می‌شود و هرگز نمایش داده نمی‌شود.
          </Notice>
          <div className="mt-4">
            <SmartForm action={saveAiSettingsAction} submitLabel="ذخیره تنظیمات" successMessage="تنظیمات هوش مصنوعی ذخیره شد."
              initial={{ ...pub, apiKey: "", clearApiKey: false } as unknown as Record<string, unknown>}
              fields={[
                { name: "enabled", label: "هوش مصنوعی در دفتر فعال باشد", type: "checkbox", span: FULL },
                { name: "provider", label: "نوع ارائه‌دهنده", type: "select", required: true, options: [{ value: "anthropic", label: "Anthropic (Claude) — API رسمی" }, { value: "openai_compatible", label: "سازگار با OpenAI (Ollama / llama.cpp / vLLM / LM Studio)" }] },
                { name: "model", label: "نام مدل", required: true, ltr: true, hint: "مثلاً claude-opus-5-5 یا qwen2.5:7b-instruct" },
                { name: "baseUrl", label: "نشانی سرور", required: true, ltr: true, span: FULL, hint: "Anthropic: https://api.anthropic.com — Ollama: http://192.168.1.50:11434/v1 — llama.cpp: http://<host>:8080/v1" },
                { name: "apiKey", label: "کلید API", type: "password", ltr: true, hint: pub.hasApiKey ? `کلید ثبت‌شده: ${pub.apiKeyHint ?? "••••"} — برای تغییر، کلید تازه وارد کنید` : "برای مدل محلی بدون کلید، خالی بگذارید" },
                { name: "clearApiKey", label: "حذف کلید ثبت‌شده", type: "checkbox" },
                { name: "effort", label: "سطح تلاش مدل (Claude)", type: "select", options: EFFORTS.map((e) => ({ value: e, label: e })), showIf: { field: "provider", equals: "anthropic" } },
                { name: "refusalFallback", label: "در صورت امتناع، اجرای خودکار روی مدل جایگزین (server-side fallback)", type: "checkbox", showIf: { field: "provider", equals: "anthropic" } },
                { name: "temperature", label: "دمای نمونه‌برداری", type: "number", showIf: { field: "provider", equals: "openai_compatible" }, hint: "برای متن حقوقی مقدار کم (۰ تا ۰٫۳) مناسب است" },
                { name: "maxOutputTokens", label: "سقف توکن خروجی", type: "number", required: true },
                { name: "contextWindow", label: "ظرفیت ورودی مدل (توکن)", type: "number", required: true, hint: "برای مدل محلی ۸۱۹۲ تا ۳۲۷۶۸؛ برای Claude تا ۱٬۰۰۰٬۰۰۰" },
                { name: "timeoutSec", label: "سقف زمان هر اجرا (ثانیه)", type: "number", required: true },
                { name: "concurrency", label: "اجرای هم‌زمان", type: "number", required: true, hint: "برای مدل محلی روی یک سرور، ۱" },
                { name: "allowConfidential", label: "ارسال اسناد محرمانه به ارائه‌دهنده بیرون از شبکه مجاز است", type: "checkbox", span: FULL },
                { name: "practiceRole", label: "نقش کاربران در نمایه مهارت‌ها", type: "select", required: true, options: [{ value: "nonlawyer_with_attorney", label: "غیرحقوق‌دان با دسترسی به وکیل/مشاور" }, { value: "lawyer", label: "وکیل / حقوق‌دان دارای پروانه" }, { value: "nonlawyer_without_attorney", label: "غیرحقوق‌دان بدون دسترسی به وکیل" }] },
                { name: "attorneyContact", label: "مرجع بررسی حقوقی دفتر", placeholder: "مثلاً: آقای ... مشاور حقوقی دفتر" },
                { name: "officeNotes", label: "توضیحات افزوده به نمایه دفتر", type: "textarea", rows: NOTE_ROWS, span: FULL, hint: "این متن در «نمایه تمرین» همه مهارت‌ها قرار می‌گیرد؛ اطلاعات شخصی ننویسید." },
              ]} />
          </div>
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="آزمون اتصال">
            <p className="mb-3 text-sm text-ink-2">یک درخواست کوچک و بدون داده پرونده به ارائه‌دهنده فرستاده می‌شود.</p>
            <ConnectionTest disabled={!settings.enabled && !settings.model} />
          </Panel>
          <Panel title="کتابخانه مهارت‌های حقوقی" action={can(user, "skill.manage") ? <ActionButton action={syncSkillsAction} payload={{}} size="sm" variant="secondary" successMessage="مهارت‌ها همگام شد."><RefreshCw />همگام‌سازی</ActionButton> : undefined}>
            <ul className="flex flex-col gap-1 text-sm">
              {modes.map((m) => <li key={m.mode} className="flex justify-between"><span>{MODE_LABEL[m.mode] ?? m.mode}</span><span className="num font-bold">{faNum(m._count)}</span></li>)}
            </ul>
            <p className="mt-3 text-xs text-ink-3">{plugins.map((p) => `${p.category ?? "—"} (${faNum(p._count)})`).join(" · ")}</p>
            <div className="mt-3 flex flex-col gap-2 text-xs">
              {sources.map((s) => (
                <p key={s.id} dir="ltr" className="text-left text-ink-2"><a className="text-lapis underline" href={s.repo} target="_blank" rel="noreferrer noopener">{s.repo.replace("https://github.com/", "")}</a> @ {s.commit.slice(0, SHORT_SHA)} — {s.license}</p>
              ))}
            </div>
            <Link href="/skills" className="mt-3 inline-block text-sm text-lapis underline">مشاهده و اجرای مهارت‌ها</Link>
          </Panel>
        </div>
        <Panel title="اجراهای اخیر هوش مصنوعی" className="xl:col-span-2" bodyClass="p-0">
          {jobs.length === 0 ? <p className="p-4 text-sm text-ink-3">هنوز اجرایی ثبت نشده است.</p> : (
            <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>زمان</th><th>کاربر</th><th>نوع</th><th>عنوان</th><th>مدل</th><th>وضعیت</th><th>توکن (ورودی/خروجی)</th><th>مدت</th></tr></thead>
              <tbody>{jobs.map((j) => (
                <tr key={j.id}>
                  <td className="num whitespace-nowrap text-sm">{formatJalali(j.createdAt, "datetime")}</td>
                  <td className="whitespace-nowrap text-sm">{users[j.userId] ?? "—"}</td>
                  <td className="text-xs" dir="ltr">{j.kind}</td>
                  <td className="max-w-xs truncate text-sm"><Link className="text-lapis hover:underline" href={`/assistant/${j.id}`}>{j.title ?? "—"}</Link></td>
                  <td className="text-xs" dir="ltr">{j.model}</td>
                  <td><Seal tone={JOB_STATUS[j.status]?.tone ?? "neutral"} dot>{JOB_STATUS[j.status]?.label ?? j.status}</Seal></td>
                  <td className="num text-sm">{j.inputTokens !== null ? `${faNum(j.inputTokens)} / ${faNum(j.outputTokens ?? 0)}` : "—"}</td>
                  <td className="num text-sm">{j.durationMs !== null ? `${faNum(Math.round(j.durationMs / MS_PER_SEC))} ث` : "—"}</td>
                </tr>))}</tbody></table></div>
          )}
        </Panel>
      </div>
    </>
  );
}
