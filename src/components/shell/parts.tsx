"use client";
// اجزای مشترک چیدمان‌ها: پیوند ناوبری با نشان، دکمه جست‌وجو/فرمان، منوی کاربر، برگه کشویی همراه و فهرست گروه‌ها
import * as Dialog from "@radix-ui/react-dialog";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, KeyRound, LogOut, Search, X } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { cn } from "@/lib/cn";
import type { NavItem } from "./nav";
import { iconOf } from "./nav-icons";
import { capped } from "./notifications";
import { useShell } from "./shell-context";

export function useBadge(item: NavItem): number {
  const { badges } = useShell();
  return item.badge ? badges[item.badge] : 0;
}

/** پیوند یک بخش؛ variant ظاهر را برای نوار کناری، ستون، زبانه و برگه تنظیم می‌کند */
export function NavLink({ item, variant, onNavigate }: { item: NavItem; variant: "side" | "column" | "tab" | "sheet"; onNavigate?: () => void }) {
  const shell = useShell();
  const active = shell.isActive(item.href);
  const n = useBadge(item);
  const Icon = iconOf(item.icon);
  return (
    <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} data-active={active || undefined}
      className={cn("nav-link press group", `nav-${variant}`)}>
      <Icon className="nav-icon" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {n > 0 && <span className="count-badge">{capped(n)}</span>}
    </Link>
  );
}

export function NavGroups({ variant, onNavigate, className }: { variant: "side" | "sheet"; onNavigate?: () => void; className?: string }) {
  const { groups } = useShell();
  return (
    <nav aria-label="ناوبری اصلی" className={cn("flex flex-col gap-5", className)}>
      {groups.map((g) => (
        <div key={g.title}>
          <p className="nav-heading">{g.title}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((it) => <li key={it.href}><NavLink item={it} variant={variant} onNavigate={onNavigate} /></li>)}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function SearchPill({ className, wide = false }: { className?: string; wide?: boolean }) {
  const { setPaletteOpen } = useShell();
  return (
    <button type="button" onClick={() => setPaletteOpen(true)} aria-label="جست‌وجو یا فرمان (Ctrl+K)"
      className={cn("search-pill press", wide && "search-pill-wide", className)}>
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate text-start">{wide ? "جست‌وجو یا فرمان… «پرونده جدید»، «ماده ۵۱»" : "جست‌وجو یا فرمان…"}</span>
      <kbd className="ltr hidden shrink-0 rounded border border-line bg-surface-2 px-1.5 text-2xs text-ink-2 sm:inline">Ctrl K</kbd>
    </button>
  );
}

/** حروف نخست دو واژه اول نام برای نشان کاربر */
const INITIALS = 2;
export function initialsOf(name: string): string {
  return name.trim().split(" ").filter(Boolean).map((s) => s[0]).slice(0, INITIALS).join("‌");
}

export function UserMenu({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { user } = useShell();
  return (
    <Dropdown.Root dir="rtl">
      <Dropdown.Trigger asChild>
        <button type="button" className={cn("press flex items-center gap-2 rounded-ctl p-1 hover:bg-ink/5", className)} aria-label={`منوی کاربر: ${user.fullName}`}>
          <span className="avatar">{initialsOf(user.fullName)}</span>
          {!compact && (
            <span className="hidden text-start leading-tight sm:block">
              <span className="block text-sm font-bold">{user.fullName}</span>
              <span className="block text-2xs text-ink-3">{user.roleName}</span>
            </span>
          )}
          {!compact && <ChevronDown className="hidden size-3.5 text-ink-3 sm:block" aria-hidden />}
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={8} className="floating z-50 min-w-[230px] animate-rise-in p-1">
          <div className="border-b border-line px-3 py-2">
            <p className="font-bold">{user.fullName}</p>
            <p className="text-xs text-ink-3">{user.roleName}{user.departmentName ? ` · ${user.departmentName}` : ""}</p>
          </div>
          <Dropdown.Item asChild>
            <Link href="/account" className="menu-item"><KeyRound className="size-4" />حساب کاربری، رمز و ظاهر</Link>
          </Dropdown.Item>
          <Dropdown.Item onSelect={() => { void logoutAction(); }} className="menu-item text-mohr data-[highlighted]:bg-mohr-50">
            <LogOut className="size-4" />خروج از سامانه
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

/** برگه کشویی (منوی همراه، فهرست همه بخش‌ها) */
export function Sheet({ open, onOpenChange, title, side = "start", children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; side?: "start" | "bottom"; children: React.ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-scrim/40" />
        <Dialog.Content dir="rtl" aria-describedby={undefined} className={cn("sheet fixed z-50 flex flex-col", side === "start" ? "sheet-start" : "sheet-bottom")}>
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
            <Dialog.Close className="tool-btn" aria-label="بستن"><X className="size-5" /></Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
