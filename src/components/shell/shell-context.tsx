"use client";
// وضعیت مشترک پوسته برنامه: چیدمان و پوسته (اعمال فوری روی <html> و ذخیره در پس‌زمینه)، نشان‌های ناوبری و
// اعلان‌ها (به‌روزرسانی هر ۳۰ ثانیه و با هر جابه‌جایی صفحه)، رکوردهای اخیر، و باز/بسته بودن فرمان‌یاب و منوی همراه.
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { saveUiAction } from "@/app/(app)/shell-actions";
import type { LayoutId, SkinId } from "@/theme/skins";
import type { NavGroup, NavItem } from "./nav";

export interface ShellUser { fullName: string; roleName: string; departmentName: string | null; permissions: string[] }
export interface ShellBadges { cartable: number; tasks: number; messages: number; deadlines: number; reviews: number; unread: number }
export interface RecentItem { id: string; entityType: string; title: string; subtitle: string | null; link: string; pinned: boolean }

export interface ShellInit {
  layout: LayoutId;
  skin: SkinId;
  userLayout: LayoutId | null;
  userSkin: SkinId | null;
  officeLayout: LayoutId;
  officeSkin: SkinId;
  groups: NavGroup[];
  badges: ShellBadges;
  recents: RecentItem[];
  user: ShellUser;
  today: string;
  officeName: string;
}

interface ShellState extends ShellInit {
  setLayout: (l: LayoutId | null) => void;
  setSkin: (s: SkinId | null) => void;
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;
  navOpen: boolean;
  setNavOpen: (o: boolean) => void;
  refresh: () => Promise<void>;
  pin: (id: string, pinned: boolean) => Promise<void>;
  can: (perm: string | undefined) => boolean;
  isActive: (href: string) => boolean;
  activeItem: NavItem | null;
  activeGroup: NavGroup | null;
}

const ShellContext = createContext<ShellState | null>(null);
const POLL_MS = 30_000;
const UNAUTHORIZED = 401;

export function useShell(): ShellState {
  const s = useContext(ShellContext);
  if (!s) throw new Error("useShell must be used inside <ShellProvider>");
  return s;
}

const matches = (path: string, href: string): boolean => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** کلید میان‌بر Ctrl/⌘+K با کد فیزیکی کلید تا روی صفحه‌کلید فارسی («ن») هم کار کند */
function isPaletteShortcut(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.code === "KeyK";
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function ShellProvider({ init, children }: { init: ShellInit; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [ui, setUi] = useState({ layout: init.layout, skin: init.skin, userLayout: init.userLayout, userSkin: init.userSkin });
  const [badges, setBadges] = useState(init.badges);
  const [recents, setRecents] = useState(init.recents);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/shell", { cache: "no-store" });
      if (r.status === UNAUTHORIZED) { window.location.assign("/login"); return; }
      if (!r.ok) return;
      const j = (await r.json()) as { badges: ShellBadges; recents: RecentItem[] };
      setBadges(j.badges);
      setRecents(j.recents);
    } catch { /* سرور در دسترس نیست؛ نوبت بعد */ }
  }, []);

  useEffect(() => {
    const t = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    setNavOpen(false);
    const record = async () => {
      try {
        const r = await fetch("/api/shell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) });
        const j = (await r.json()) as { recorded?: boolean };
        await (j.recorded ? refresh() : Promise.resolve());
      } catch { /* ثبت بازدید اختیاری است */ }
    };
    void record();
  }, [path, refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPaletteShortcut(e) || (e.key === "/" && !isTyping(e.target))) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const persist = useCallback(async (input: { layout?: LayoutId | null; skin?: SkinId | null }) => {
    const r = await saveUiAction(input);
    if (r.ok) setUi(r.data);
    router.refresh();
  }, [router]);

  const setLayout = useCallback((l: LayoutId | null) => {
    const next = l ?? init.officeLayout;
    document.documentElement.dataset.layout = next;
    setUi((u) => ({ ...u, layout: next, userLayout: l }));
    void persist({ layout: l });
  }, [init.officeLayout, persist]);

  const setSkin = useCallback((s: SkinId | null) => {
    const next = s ?? init.officeSkin;
    document.documentElement.dataset.skin = next;
    setUi((u) => ({ ...u, skin: next, userSkin: s }));
    void persist({ skin: s });
  }, [init.officeSkin, persist]);

  const pin = useCallback(async (id: string, pinned: boolean) => {
    await fetch("/api/shell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: id, pinned }) });
    await refresh();
  }, [refresh]);

  const value = useMemo<ShellState>(() => {
    const perms = new Set(init.user.permissions);
    const items = init.groups.flatMap((g) => g.items.map((item) => ({ item, group: g })));
    const active = items.filter((x) => matches(path, x.item.href)).sort((a, b) => b.item.href.length - a.item.href.length)[0] ?? null;
    return {
      ...init, ...ui, badges, recents, paletteOpen, setPaletteOpen, navOpen, setNavOpen, refresh, pin, setLayout, setSkin,
      can: (perm) => !perm || perms.has(perm),
      isActive: (href) => active?.item.href === href,
      activeItem: active?.item ?? null,
      activeGroup: active?.group ?? null,
    };
  }, [init, ui, badges, recents, paletteOpen, navOpen, refresh, pin, setLayout, setSkin, path]);

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}
