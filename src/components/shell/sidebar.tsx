"use client";
import * as Icons from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { toFaDigits } from "@/lib/text";
import { Brand } from "./brand";
import type { NavGroup } from "./nav";

type IconName = keyof typeof Icons;

export function Sidebar({ groups, badges }: { groups: NavGroup[]; badges: Record<string, number> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="ناوبری اصلی">
      {groups.map((g) => (
        <div key={g.title} className="mt-5 first:mt-2">
          <p className="mb-1.5 px-2 text-2xs font-bold tracking-wide text-white/35">{g.title}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const Icon = (Icons[it.icon as IconName] ?? Icons.Circle) as Icons.LucideIcon;
              const active = isActive(it.href);
              const n = it.badge ? badges[it.badge] ?? 0 : 0;
              return (
                <li key={it.href}>
                  <Link href={it.href} aria-current={active ? "page" : undefined}
                    className={cn("group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-base transition-colors",
                      active ? "bg-white/10 font-bold text-white" : "text-white/65 hover:bg-white/5 hover:text-white")}>
                    {active && <span className="absolute -start-3 top-1.5 h-6 w-[3px] rounded-e bg-firuze" aria-hidden />}
                    <Icon className={cn("size-[18px] shrink-0", active ? "text-firuze-50" : "text-white/45 group-hover:text-white/80")} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {n > 0 && <span className="num min-w-5 rounded-full bg-mohr px-1.5 text-center text-2xs font-bold leading-5 text-white">{toFaDigits(n > 99 ? "99+" : n)}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="باز کردن منو"
        className="no-print fixed start-3 top-3 z-40 flex size-10 items-center justify-center rounded-md border border-line bg-surface text-ink shadow-raised lg:hidden">
        <Icons.Menu className="size-5" />
      </button>
      <aside className="girih no-print fixed inset-y-0 start-0 z-30 hidden w-[248px] flex-col lg:flex">
        <div className="px-5 pb-2 pt-5"><Brand /></div>
        {nav}
      </aside>
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-night/50" onClick={() => setOpen(false)} />
          <aside className="girih absolute inset-y-0 start-0 flex w-[272px] animate-slide-in flex-col shadow-pop">
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="بستن منو" className="rounded p-1.5 text-white/70 hover:bg-white/10"><Icons.X className="size-5" /></button>
            </div>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
