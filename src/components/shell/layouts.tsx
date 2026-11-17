"use client";
// چهار چیدمان پوسته برنامه، هر کدام با نوار بالای خودش؛ محتوای صفحه (main) در همه یکی است و فقط فاصله‌اش با
// data-layout روی <html> تنظیم می‌شود (globals.css) تا جابه‌جایی چیدمان بدون بارگذاری دوباره صفحه انجام شود.
//  ▸ کلاسیک: نوار کناری شناور شیشه‌ای      ▸ داک: داک شناور پایین با بزرگ‌نمایی
//  ▸ ستون‌ها: ریل گروه‌ها + ستون بخش‌ها و اخیر  ▸ فرمان: نوار فرمان مرکزی + زبانه‌های بخش
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Command, LayoutGrid, Menu, Pin, PinOff, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { LayoutId } from "@/theme/skins";
import { AppearanceButton } from "./appearance";
import { Brand, BrandMark } from "./brand";
import type { NavGroup, NavItem } from "./nav";
import { iconOf } from "./nav-icons";
import { capped, Notifications } from "./notifications";
import { NavGroups, NavLink, SearchPill, Sheet, useBadge, UserMenu } from "./parts";
import { useShell, type ShellBadges } from "./shell-context";

const groupCount = (g: NavGroup, badges: ShellBadges): number => g.items.reduce((n, it) => n + (it.badge ? badges[it.badge] : 0), 0);

// ───────────── کلاسیک ─────────────

function SidebarChrome() {
  const shell = useShell();
  return (
    <>
      <aside className="shell-sidebar chrome-glass no-print" aria-label="نوار کناری">
        <div className="px-5 pb-3 pt-5"><Link href="/" aria-label="پیشخوان"><Brand /></Link></div>
        <div className="flex-1 overflow-y-auto px-3 pb-4"><NavGroups variant="side" /></div>
        <div className="flex items-center gap-1 border-t border-chrome-line p-2">
          <UserMenu className="min-w-0 flex-1" />
          <AppearanceButton className="chrome-tool" />
        </div>
      </aside>
      <Sheet open={shell.navOpen} onOpenChange={shell.setNavOpen} title="بخش‌ها"><NavGroups variant="sheet" onNavigate={() => shell.setNavOpen(false)} /></Sheet>
    </>
  );
}

function SidebarTopbar() {
  const shell = useShell();
  return (
    <header className="topbar no-print">
      <button type="button" className="tool-btn lg:hidden" onClick={() => shell.setNavOpen(true)} aria-label="باز کردن منو"><Menu className="size-5" /></button>
      <SearchPill className="max-w-md flex-1" />
      <span className="ms-auto hidden text-sm text-ink-2 md:block">{shell.today}</span>
      <Notifications />
      <AppearanceButton className="lg:hidden" />
      <UserMenu compact className="lg:hidden" />
    </header>
  );
}

// ───────────── داک ─────────────

/** ترتیب ترجیحی بخش‌ها در داک؛ بقیه در «همه بخش‌ها» */
const DOCK_PRIORITY = ["/", "/cartable", "/cases", "/deadlines", "/drafts", "/tasks", "/calendar", "/clients", "/research", "/messages"];
const DOCK_MAX = 8;
const DOCK_PHONE = 4;

function DockItem({ item, phoneHidden }: { item: NavItem; phoneHidden: boolean }) {
  const shell = useShell();
  const n = useBadge(item);
  const Icon = iconOf(item.icon);
  const active = shell.isActive(item.href);
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} data-active={active || undefined} className={cn("dock-item press", phoneHidden && "max-md:hidden")} aria-label={item.label}>
      <Icon className="dock-icon" aria-hidden />
      <span className="dock-label">{item.label}</span>
      {n > 0 && <span className="count-badge absolute -top-1 end-1">{capped(n)}</span>}
    </Link>
  );
}

function Launchpad({ onNavigate }: { onNavigate: () => void }) {
  const { groups } = useShell();
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.title}>
          <p className="nav-heading">{g.title}</p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {g.items.map((it) => {
              const Icon = iconOf(it.icon);
              return (
                <li key={it.href}>
                  <Link href={it.href} onClick={onNavigate} className="launch-tile press">
                    <Icon className="size-6" aria-hidden />
                    <span className="text-xs font-medium">{it.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DockChrome() {
  const { groups } = useShell();
  const [all, setAll] = useState(false);
  const items = groups.flatMap((g) => g.items).filter((it) => DOCK_PRIORITY.includes(it.href))
    .sort((a, b) => DOCK_PRIORITY.indexOf(a.href) - DOCK_PRIORITY.indexOf(b.href)).slice(0, DOCK_MAX);
  return (
    <>
      <nav className="shell-dock no-print" aria-label="داک بخش‌ها">
        <div className="dock chrome-glass">
          {items.map((it, i) => <DockItem key={it.href} item={it} phoneHidden={i >= DOCK_PHONE} />)}
          <span className="dock-sep max-md:hidden" aria-hidden />
          <button type="button" onClick={() => setAll(true)} className="dock-item press" aria-label="همه بخش‌ها">
            <LayoutGrid className="dock-icon" aria-hidden /><span className="dock-label">همه بخش‌ها</span>
          </button>
        </div>
      </nav>
      <Sheet open={all} onOpenChange={setAll} title="همه بخش‌ها" side="bottom"><Launchpad onNavigate={() => setAll(false)} /></Sheet>
    </>
  );
}

function DockTopbar() {
  const shell = useShell();
  return (
    <header className="topbar no-print">
      <Link href="/" aria-label="پیشخوان" className="shrink-0"><Brand compact /></Link>
      <SearchPill className="mx-auto max-w-lg flex-1" />
      <span className="hidden text-sm text-ink-2 lg:block">{shell.today}</span>
      <Notifications />
      <AppearanceButton />
      <UserMenu compact />
    </header>
  );
}

// ───────────── ستون‌ها ─────────────

function RecentList({ onNavigate }: { onNavigate?: () => void }) {
  const shell = useShell();
  if (!shell.recents.length) return <p className="px-3 py-2 text-xs text-chrome-ink-2">رکوردهایی که باز می‌کنید اینجا می‌آیند.</p>;
  return (
    <ul className="flex flex-col gap-0.5">
      {shell.recents.map((r) => (
        <li key={r.id} className="group/recent relative">
          <Link href={r.link} onClick={onNavigate} className="nav-link nav-column press pe-9">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{r.title}</span>
              {r.subtitle && <span className="block truncate text-2xs opacity-70">{r.subtitle}</span>}
            </span>
          </Link>
          <button type="button" onClick={() => void shell.pin(r.id, !r.pinned)} aria-label={r.pinned ? `برداشتن سنجاق ${r.title}` : `سنجاق ${r.title}`}
            className={cn("absolute end-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-chrome-ink-2 hover:text-chrome-ink", !r.pinned && "opacity-0 focus:opacity-100 group-hover/recent:opacity-100")}>
            {r.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

function GroupColumn({ group, onNavigate }: { group: NavGroup; onNavigate?: () => void }) {
  const shell = useShell();
  return (
    <>
      <div className="px-4 pb-3 pt-5">
        <p className="text-2xs font-bold text-chrome-ink-2">{shell.officeName}</p>
        <h2 className="mt-0.5 text-xl font-extrabold text-chrome-ink">{group.title}</h2>
      </div>
      <ul className="flex flex-col gap-0.5 px-2">
        {group.items.map((it) => <li key={it.href}><NavLink item={it} variant="column" onNavigate={onNavigate} /></li>)}
      </ul>
      <div className="mt-5 px-2">
        <p className="nav-heading">سنجاق‌شده و اخیر</p>
        <RecentList onNavigate={onNavigate} />
      </div>
    </>
  );
}

function ColumnsChrome() {
  const shell = useShell();
  const [chosen, setChosen] = useState<string | null>(null);
  const [peek, setPeek] = useState(false);
  const [phoneGroup, setPhoneGroup] = useState<NavGroup | null>(null);
  const group = shell.groups.find((g) => g.title === (chosen ?? shell.activeGroup?.title)) ?? shell.groups[0];
  const select = (g: NavGroup) => { setChosen(g.title); setPeek(true); };
  return (
    <>
      <aside className="shell-rail no-print" aria-label="گروه‌های ناوبری">
        <Link href="/" aria-label="پیشخوان" className="mb-3"><BrandMark className="size-9" /></Link>
        <div className="flex flex-col gap-1" role="tablist" aria-orientation="vertical">
          {shell.groups.map((g) => {
            const Icon = iconOf(g.icon);
            const n = groupCount(g, shell.badges);
            return (
              <button key={g.title} type="button" role="tab" aria-selected={g === group} data-active={g === group || undefined} onClick={() => select(g)} className="rail-btn press" title={g.title}>
                <Icon className="size-5" aria-hidden />
                <span className="line-clamp-1 max-w-full px-0.5">{g.title.split(" ")[0]}</span>
                {n > 0 && <span className="count-badge absolute -top-0.5 end-0.5">{capped(n)}</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-auto flex flex-col items-center gap-1">
          <button type="button" onClick={() => shell.setPaletteOpen(true)} className="tool-btn chrome-tool" aria-label="جست‌وجو یا فرمان"><Search className="size-[18px]" /></button>
          <Notifications className="chrome-tool" />
          <AppearanceButton className="chrome-tool" />
          <UserMenu compact />
        </div>
      </aside>
      <aside className={cn("shell-column no-print", peek && "is-peek")} aria-label={`بخش‌های ${group.title}`}>
        <GroupColumn group={group} onNavigate={() => setPeek(false)} />
      </aside>
      {peek && <button type="button" aria-label="بستن ستون" className="fixed inset-0 z-20 cursor-default lg:hidden" onClick={() => setPeek(false)} />}
      <nav className="shell-groupbar chrome-glass no-print" aria-label="گروه‌های ناوبری">
        {shell.groups.map((g) => {
          const Icon = iconOf(g.icon);
          const n = groupCount(g, shell.badges);
          return (
            <button key={g.title} type="button" onClick={() => setPhoneGroup(g)} data-active={g === shell.activeGroup || undefined} className="rail-btn press">
              <Icon className="size-5" aria-hidden /><span>{g.title.split(" ")[0]}</span>
              {n > 0 && <span className="count-badge absolute -top-0.5 end-1">{capped(n)}</span>}
            </button>
          );
        })}
      </nav>
      <Sheet open={!!phoneGroup} onOpenChange={(o) => !o && setPhoneGroup(null)} title={phoneGroup?.title ?? ""} side="bottom">
        {phoneGroup && (
          <ul className="flex flex-col gap-0.5">
            {phoneGroup.items.map((it) => <li key={it.href}><NavLink item={it} variant="sheet" onNavigate={() => setPhoneGroup(null)} /></li>)}
          </ul>
        )}
      </Sheet>
    </>
  );
}

function ColumnsTopbar() {
  const shell = useShell();
  return (
    <header className="topbar no-print">
      <SearchPill className="max-w-md flex-1" />
      <span className="ms-auto hidden text-sm text-ink-2 md:block">{shell.today}</span>
      <Notifications className="md:hidden" />
      <UserMenu compact className="md:hidden" />
    </header>
  );
}

// ───────────── فرمان ─────────────

function GroupMenu({ group }: { group: NavGroup }) {
  const shell = useShell();
  const active = shell.activeGroup === group;
  return (
    <Dropdown.Root dir="rtl">
      <Dropdown.Trigger asChild>
        <button type="button" data-active={active || undefined} className="group-trigger press">
          {group.title}<ChevronDown className="size-3.5 opacity-60" aria-hidden />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="start" sideOffset={6} className="floating z-50 min-w-[220px] animate-rise-in p-1">
          {group.items.map((it) => {
            const Icon = iconOf(it.icon);
            return (
              <Dropdown.Item key={it.href} asChild>
                <Link href={it.href} className="menu-item"><Icon className="size-4" aria-hidden />{it.label}</Link>
              </Dropdown.Item>
            );
          })}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function CommandChrome() {
  const shell = useShell();
  return (
    <>
      <button type="button" onClick={() => shell.setPaletteOpen(true)} className="shell-fab press no-print md:hidden" aria-label="فرمان‌یاب"><Command className="size-6" /></button>
      <Sheet open={shell.navOpen} onOpenChange={shell.setNavOpen} title="بخش‌ها"><NavGroups variant="sheet" onNavigate={() => shell.setNavOpen(false)} /></Sheet>
    </>
  );
}

function CommandTopbar() {
  const shell = useShell();
  const tabs = shell.activeGroup ?? shell.groups[0];
  return (
    <header className="topbar topbar-command no-print">
      <div className="flex h-14 w-full items-center gap-2">
        <button type="button" className="tool-btn lg:hidden" onClick={() => shell.setNavOpen(true)} aria-label="باز کردن منو"><Menu className="size-5" /></button>
        <Link href="/" aria-label="پیشخوان" className="shrink-0"><Brand compact /></Link>
        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="گروه‌های ناوبری">{shell.groups.map((g) => <GroupMenu key={g.title} group={g} />)}</nav>
        <SearchPill wide className="mx-auto hidden max-w-xl flex-1 md:flex" />
        <span className="ms-auto hidden text-sm text-ink-2 xl:block md:ms-0">{shell.today}</span>
        <Notifications className="ms-auto md:ms-0" />
        <AppearanceButton />
        <UserMenu compact />
      </div>
      {tabs && (
        <nav className="tabstrip" aria-label={`بخش‌های ${tabs.title}`}>
          {tabs.items.map((it) => <NavLink key={it.href} item={it} variant="tab" />)}
        </nav>
      )}
    </header>
  );
}

const CHROMES: Record<LayoutId, { Chrome: () => React.ReactNode; Topbar: () => React.ReactNode }> = {
  sidebar: { Chrome: SidebarChrome, Topbar: SidebarTopbar },
  dock: { Chrome: DockChrome, Topbar: DockTopbar },
  columns: { Chrome: ColumnsChrome, Topbar: ColumnsTopbar },
  command: { Chrome: CommandChrome, Topbar: CommandTopbar },
};

export function LayoutChrome() {
  const { layout } = useShell();
  const { Chrome } = CHROMES[layout];
  return <Chrome />;
}

export function LayoutTopbar() {
  const { layout } = useShell();
  const { Topbar } = CHROMES[layout];
  return <Topbar />;
}
