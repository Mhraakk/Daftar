"use client";
// زنگوله اعلان‌ها: شمار خوانده‌نشده از پوسته (هر ۳۰ ثانیه)، فهرست هنگام باز شدن، خواندن یکی یا همه
import * as Popover from "@radix-ui/react-popover";
import { Bell, BellRing, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/jalali";
import { toFaDigits } from "@/lib/text";
import { useShell } from "./shell-context";

interface Notif { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string; important: boolean }

const BADGE_CAP = 99;
/** رنگ نقطه هر اعلان: خوانده‌شده بی‌رنگ، مهم قرمز، بقیه فیروزه‌ای */
const dotOf = (n: { readAt: string | null; important: boolean }): string => {
  if (n.readAt) return "bg-transparent";
  return n.important ? "bg-mohr" : "bg-firuze";
};
export const capped = (n: number): string => toFaDigits(n > BADGE_CAP ? `${BADGE_CAP}+` : n);

export function Notifications({ className }: { className?: string }) {
  const router = useRouter();
  const shell = useShell();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const unread = shell.badges.unread;

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (r.ok) setItems(((await r.json()) as { items: Notif[] }).items);
    } catch { /* سرور در دسترس نیست */ }
  }, []);

  const mark = async (id?: string) => {
    await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(id ? { id } : { all: true }) });
    await Promise.all([load(), shell.refresh()]);
    router.refresh();
  };

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) void load(); }}>
      <Popover.Trigger asChild>
        <button type="button" aria-label={`اعلان‌ها${unread ? ` (${toFaDigits(unread)} خوانده‌نشده)` : ""}`} className={cn("tool-btn relative", className)}>
          {unread ? <BellRing className="size-[18px] text-mohr" /> : <Bell className="size-[18px]" />}
          {unread > 0 && <span className="count-badge absolute -end-1 -top-1">{capped(unread)}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} dir="rtl" className="floating z-50 w-[min(94vw,380px)] animate-rise-in overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-bold">اعلان‌ها</p>
            {unread > 0 && <button type="button" onClick={() => void mark()} className="flex items-center gap-1 text-xs text-lapis hover:underline"><Check className="size-3.5" />خواندن همه</button>}
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-10 text-center text-sm text-ink-3">اعلانی وجود ندارد.</li>}
            {items.map((n) => (
              <li key={n.id} className="border-b border-line last:border-0">
                <button type="button" onClick={() => { if (!n.readAt) void mark(n.id); if (n.link) { setOpen(false); router.push(n.link); } }}
                  className={cn("flex w-full gap-2.5 px-4 py-3 text-start hover:bg-surface-2", !n.readAt && "bg-firuze-50/60")}>
                  <span className={cn("mt-2 size-2 shrink-0 rounded-full", dotOf(n))} />
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
