"use client";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { Bell, BellRing, Check, ChevronDown, KeyRound, LogOut, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/login/actions";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/jalali";
import { toFaDigits } from "@/lib/text";
import { Modal } from "../ui/modal";

interface Notif { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string; important: boolean }
interface Hit { id: string; type: string; typeLabel: string; title: string; subtitle: string | null; link: string }

export function Topbar({ user, today }: { user: { fullName: string; roleName: string; departmentName: string | null }; today: string }) {
  return (
    <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-paper/90 px-4 ps-16 backdrop-blur lg:ps-6">
      <GlobalSearch />
      <span className="ms-auto hidden text-sm text-ink-2 md:block">{today}</span>
      <Notifications />
      <UserMenu user={user} />
    </header>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      ctrl.current?.abort(); ctrl.current = new AbortController();
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`, { signal: ctrl.current.signal });
        if (r.ok) { setHits((await r.json()).results); setIdx(0); }
      } catch { /* لغو */ } finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); };

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink-3 transition-colors hover:border-ink-3">
        <Search className="size-4" /><span className="flex-1 text-start">جست‌وجو در پرونده‌ها، مراجعان، اسناد…</span>
        <kbd className="ltr hidden rounded border border-line bg-surface-2 px-1.5 text-2xs sm:inline">Ctrl K</kbd>
      </button>
      <Modal open={open} onOpenChange={setOpen} title="جست‌وجوی یکپارچه" size="md">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام، شماره پرونده، کد ملی، متن سند…" className="input h-11 ps-9"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, hits.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter") { e.preventDefault(); if (hits[idx]) go(hits[idx].link); else if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`); }
            }} />
        </div>
        <ul className="mt-3 flex min-h-[120px] flex-col gap-0.5">
          {loading && !hits.length && <li className="px-2 py-6 text-center text-sm text-ink-3">در حال جست‌وجو…</li>}
          {!loading && q.trim().length >= 2 && !hits.length && <li className="px-2 py-6 text-center text-sm text-ink-3">نتیجه‌ای یافت نشد.</li>}
          {q.trim().length < 2 && <li className="px-2 py-6 text-center text-sm text-ink-3">دست‌کم دو نویسه وارد کنید. نتایج فقط شامل رکوردهای مجاز شماست.</li>}
          {hits.map((h, i) => (
            <li key={h.type + h.id}>
              <button onClick={() => go(h.link)} onMouseEnter={() => setIdx(i)}
                className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-start", i === idx && "bg-firuze-50")}>
                <span className="seal seal-neutral shrink-0">{h.typeLabel}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{h.title}</span>{h.subtitle && <span className="block truncate text-xs text-ink-3">{h.subtitle}</span>}</span>
              </button>
            </li>
          ))}
        </ul>
        {q.trim().length >= 2 && (
          <button onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)} className="mt-2 w-full border-t border-line pt-3 text-center text-sm text-lapis hover:underline">
            مشاهده همه نتایج و فیلترهای پیشرفته
          </button>
        )}
      </Modal>
    </>
  );
}

function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (r.status === 401) { window.location.assign("/login"); return; }
      if (r.ok) { const j = await r.json(); setItems(j.items); setUnread(j.unread); }
    } catch { /* سرور در دسترس نیست؛ در نوبت بعد تلاش می‌شود */ }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const mark = async (id?: string) => {
    await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(id ? { id } : { all: true }) });
    load(); router.refresh();
  };
  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <Popover.Trigger asChild>
        <button aria-label={`اعلان‌ها${unread ? ` (${unread} خوانده‌نشده)` : ""}`} className="relative flex size-9 items-center justify-center rounded-md text-ink-2 hover:bg-ink/5">
          {unread ? <BellRing className="size-[18px] text-mohr" /> : <Bell className="size-[18px]" />}
          {unread > 0 && <span className="num absolute -end-0.5 -top-0.5 min-w-[18px] rounded-full bg-mohr px-1 text-center text-2xs font-bold leading-[18px] text-white">{toFaDigits(unread > 99 ? "99+" : unread)}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} dir="rtl" className="z-50 w-[min(94vw,380px)] animate-rise-in rounded-lg border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-bold">اعلان‌ها</p>
            {unread > 0 && <button onClick={() => mark()} className="flex items-center gap-1 text-xs text-lapis hover:underline"><Check className="size-3.5" />خواندن همه</button>}
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-10 text-center text-sm text-ink-3">اعلانی وجود ندارد.</li>}
            {items.map((n) => (
              <li key={n.id} className="border-b border-line last:border-0">
                <button onClick={() => { if (!n.readAt) mark(n.id); if (n.link) { setOpen(false); router.push(n.link); } }}
                  className={cn("flex w-full gap-2.5 px-4 py-3 text-start hover:bg-surface-2", !n.readAt && "bg-firuze-50/50")}>
                  <span className={cn("mt-2 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : n.important ? "bg-mohr" : "bg-firuze")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !n.readAt && "font-bold")}>{n.title}</span>
                    {n.body && <span className="line-clamp-2 block text-xs leading-5 text-ink-2">{n.body}</span>}
                    <span className="mt-0.5 block text-2xs text-ink-3">{relativeTime(new Date(n.createdAt))}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-sm text-lapis hover:bg-surface-2">همه اعلان‌ها</Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function UserMenu({ user }: { user: { fullName: string; roleName: string; departmentName: string | null } }) {
  const initials = user.fullName.trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("‌");
  return (
    <Dropdown.Root dir="rtl">
      <Dropdown.Trigger asChild>
        <button className="flex h-9 items-center gap-2 rounded-md ps-1 pe-2 hover:bg-ink/5" aria-label="منوی کاربر">
          <span className="flex size-7 items-center justify-center rounded-full bg-night text-xs font-bold text-white">{initials}</span>
          <span className="hidden text-start leading-tight sm:block">
            <span className="block text-sm font-bold">{user.fullName}</span>
            <span className="block text-2xs text-ink-3">{user.roleName}</span>
          </span>
          <ChevronDown className="size-3.5 text-ink-3" />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={8} className="z-50 min-w-[220px] animate-rise-in rounded-lg border border-line bg-surface p-1 shadow-pop">
          <div className="border-b border-line px-3 py-2">
            <p className="font-bold">{user.fullName}</p>
            <p className="text-xs text-ink-3">{user.roleName}{user.departmentName ? ` · ${user.departmentName}` : ""}</p>
          </div>
          <Dropdown.Item asChild>
            <Link href="/account" className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-2"><KeyRound className="size-4" />حساب کاربری و رمز عبور</Link>
          </Dropdown.Item>
          <Dropdown.Item asChild>
            <form action={logoutAction}>
              <button type="submit" className="flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm text-mohr outline-none hover:bg-mohr-50"><LogOut className="size-4" />خروج از سامانه</button>
            </form>
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
