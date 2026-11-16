import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/labels";

export interface Crumb { label: string; href?: string }

export function PageHeader({
  title, subtitle, crumbs, actions, meta,
}: { title: React.ReactNode; subtitle?: React.ReactNode; crumbs?: Crumb[]; actions?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <header className="ledger-rule mb-5 pb-4">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="مسیر" className="mb-1.5 flex flex-wrap items-center gap-1 text-xs text-ink-3">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronLeft className="size-3" aria-hidden />}
              {c.href ? <Link href={c.href} className="hover:text-lapis">{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Panel({
  title, action, children, className, bodyClass, icon,
}: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string; icon?: React.ReactNode }) {
  return (
    <section className={cn("panel", className)}>
      {title && (
        <div className="panel-title">
          <h2 className="flex items-center gap-2 text-md">{icon && <span className="text-firuze [&_svg]:size-4">{icon}</span>}{title}</h2>
          {action}
        </div>
      )}
      <div className={cn("p-4", bodyClass)}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="mb-1 flex size-12 items-center justify-center rounded-full border border-dashed border-line-strong text-ink-3 [&_svg]:size-5">{icon}</div>}
      <p className="font-bold text-ink-2">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-3">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const toneText: Record<Tone, string> = {
  neutral: "text-ink", info: "text-lapis", accent: "text-firuze", success: "text-sabz", warning: "text-zafaran", danger: "text-mohr",
};

export function Stat({ label, value, tone = "neutral", href, hint, icon }: { label: string; value: React.ReactNode; tone?: Tone; href?: string; hint?: string; icon?: React.ReactNode }) {
  const inner = (
    <div className={cn("panel group relative h-full overflow-hidden p-4 transition-colors", href && "hover:border-line-strong")}>
      <span className={cn("absolute inset-y-3 start-0 w-[3px] rounded-e", {
        neutral: "bg-line-strong", info: "bg-lapis", accent: "bg-firuze", success: "bg-sabz", warning: "bg-zafaran", danger: "bg-mohr",
      }[tone])} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-ink-2">{label}</p>
        {icon && <span className="text-ink-3 [&_svg]:size-4">{icon}</span>}
      </div>
      <p className={cn("num mt-1 text-3xl font-extrabold", toneText[tone])}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}

export function DL({ items, cols = 2 }: { items: { label: string; value: React.ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", { 1: "grid-cols-1", 2: "grid-cols-1 sm:grid-cols-2", 3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" }[cols])}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-ink-3">{it.label}</dt>
          <dd className="mt-0.5 break-words text-base">{it.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LinkTabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number | string }[]; active: string }) {
  return (
    <div className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} role="tab" aria-selected={t.key === active} scroll={false}
          className={cn("relative -mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-base transition-colors",
            t.key === active ? "border-firuze font-bold text-ink" : "border-transparent text-ink-2 hover:text-ink")}>
          {t.label}
          {t.count !== undefined && <span className="num rounded-full bg-ink/5 px-1.5 text-2xs text-ink-2">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function Notice({ tone = "info", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  const c = { neutral: "border-line-strong bg-surface-2", info: "border-lapis/25 bg-lapis-50", accent: "border-firuze/25 bg-firuze-50",
    success: "border-sabz/25 bg-sabz-50", warning: "border-zafaran/30 bg-zafaran-50", danger: "border-mohr/30 bg-mohr-50" }[tone];
  return (
    <div className={cn("rounded-md border px-3.5 py-2.5 text-sm leading-7", c)} role="note">
      {title && <p className={cn("font-bold", toneText[tone])}>{title}</p>}
      <div className="text-ink">{children}</div>
    </div>
  );
}
