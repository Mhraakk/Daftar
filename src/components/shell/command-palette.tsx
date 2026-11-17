"use client";
// فرمان‌یاب (Ctrl/⌘+K یا «/»): کارهای پرتکرار، رفتن به بخش‌ها، رکوردهای اخیر، جست‌وجوی پرونده و سند، پرش به ماده
// قانون و تغییر چیدمان/پوسته — همه در یک فهرست با صفحه‌کلید. فقط کارهایی که کاربر مجوزش را دارد نمایش داده می‌شود.
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlarmClockPlus, BookOpenText, CornerDownLeft, FilePlus2, FolderPlus, History, LayoutPanelLeft, ListPlus, Palette, Pin, Search, Sparkles, UserPlus, type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { normalizeFa, toEnDigits, toFaDigits } from "@/lib/text";
import { LAYOUT_IDS, LAYOUTS_META, SKIN_IDS, SKINS_META } from "@/theme/skins";
import { iconOf } from "./nav-icons";
import { useShell } from "./shell-context";

interface Command { id: string; section: string; label: string; hint?: string; icon: LucideIcon; keywords?: string; run: () => void }
interface Hit { id: string; type: string; typeLabel: string; title: string; subtitle: string | null; link: string }

const ACTIONS: { id: string; label: string; href: string; perm: string; icon: LucideIcon; keywords: string }[] = [
  { id: "new-draft", label: "تنظیم سند حقوقی (دادخواست، لایحه، اظهارنامه)", href: "/drafts/new", perm: "draft.create", icon: FilePlus2, keywords: "جدید سند دادخواست لایحه" },
  { id: "new-case", label: "پرونده جدید", href: "/cases/new", perm: "case.create", icon: FolderPlus, keywords: "ایجاد پرونده" },
  { id: "new-client", label: "ثبت مراجعه‌کننده", href: "/clients/new", perm: "client.create", icon: UserPlus, keywords: "موکل مراجع جدید" },
  { id: "new-task", label: "وظیفه جدید", href: "/tasks?new=1", perm: "task.create", icon: ListPlus, keywords: "کار جدید" },
  { id: "new-deadline", label: "ثبت مهلت", href: "/deadlines?new=1", perm: "deadline.manage", icon: AlarmClockPlus, keywords: "مهلت قانونی جدید" },
  { id: "assistant", label: "پرسش از دستیار هوشمند", href: "/assistant", perm: "ai.use", icon: Sparkles, keywords: "هوش مصنوعی دستیار" },
];

const SECTION_ORDER = ["ماده قانون", "کارها", "اخیر", "رفتن به", "پرونده‌ها و اسناد", "ظاهر"];
const SEARCH_MIN = 2;
const SEARCH_DELAY_MS = 180;
const RECORD_LIMIT = 6;
const RECENT_LIMIT = 6;
// A law article number, optionally after «ماده»: matches "ماده ۵۱" and "336", rejects "۵۱ الف".
// https://regex101.com/?regex=%5E%28%3F%3A%D9%85%D8%A7%D8%AF%D9%87%5Cs*%29%3F%28%5Cd%7B1%2C3%7D%29%24&testString=%D9%85%D8%A7%D8%AF%D9%87%2051&flavor=javascript
const ARTICLE_QUERY = /^(?:ماده\s*)?(\d{1,3})$/;

const matchesAll = (terms: string[], text: string): boolean => {
  const n = normalizeFa(text);
  return terms.every((t) => n.includes(t));
};

export function CommandPalette() {
  const shell = useShell();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const { paletteOpen, setPaletteOpen } = shell;

  const close = () => { setPaletteOpen(false); setQ(""); setHits([]); };
  const go = (href: string) => { close(); router.push(href); };

  useEffect(() => {
    const term = q.trim();
    if (!paletteOpen || term.length < SEARCH_MIN) { setHits([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}&limit=${RECORD_LIMIT}`, { signal: ctrl.signal });
        if (r.ok) setHits(((await r.json()) as { results: Hit[] }).results);
      } catch { /* لغو یا خطای شبکه */ }
    }, SEARCH_DELAY_MS);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, paletteOpen]);

  const commands = useMemo<Command[]>(() => {
    const terms = normalizeFa(q).split(" ").filter(Boolean);
    const keep = (c: Command) => !terms.length || matchesAll(terms, `${c.label} ${c.keywords ?? ""} ${c.hint ?? ""}`);
    const article = ARTICLE_QUERY.exec(toEnDigits(q.trim()));
    const law: Command[] = article && shell.can("research.use")
      ? [{ id: "law", section: "ماده قانون", label: `ماده ${toFaDigits(article[1])} قانون آیین دادرسی مدنی`, icon: BookOpenText, run: () => go(`/research/laws/ACP?a=${article[1]}`) }]
      : [];
    const actions = ACTIONS.filter((a) => shell.can(a.perm)).map((a) => ({ id: a.id, section: "کارها", label: a.label, icon: a.icon, keywords: a.keywords, run: () => go(a.href) }));
    const recents = shell.recents.slice(0, terms.length ? undefined : RECENT_LIMIT).map((r) => ({ id: `recent-${r.id}`, section: "اخیر", label: r.title, hint: r.subtitle ?? undefined, icon: r.pinned ? Pin : History, run: () => go(r.link) }));
    const nav = shell.groups.flatMap((g) => g.items.map((it) => ({ id: `nav-${it.href}`, section: "رفتن به", label: it.label, hint: g.title, icon: iconOf(it.icon), run: () => go(it.href) })));
    const records = hits.map((h) => ({ id: `hit-${h.type}-${h.id}`, section: "پرونده‌ها و اسناد", label: h.title, hint: [h.typeLabel, h.subtitle].filter(Boolean).join(" · "), icon: Search, run: () => go(h.link) }));
    const appearance = [
      ...LAYOUT_IDS.map((l) => ({ id: `layout-${l}`, section: "ظاهر", label: `چیدمان «${LAYOUTS_META[l].label}»`, hint: LAYOUTS_META[l].hint, icon: LayoutPanelLeft, keywords: "چیدمان ظاهر طرح", run: () => { shell.setLayout(l); close(); } })),
      ...SKIN_IDS.map((s) => ({ id: `skin-${s}`, section: "ظاهر", label: `پوسته «${SKINS_META[s].label}»`, hint: SKINS_META[s].hint, icon: Palette, keywords: "پوسته رنگ ظاهر تم", run: () => { shell.setSkin(s); close(); } })),
    ];
    const visible = [...law, ...actions.filter(keep), ...recents.filter(keep), ...nav.filter(keep), ...records, ...(terms.length ? appearance.filter(keep) : [])];
    return [...visible].sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section));
  // go/close are stable enough per render; recomputing on their identity would refetch nothing
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, hits, shell.recents, shell.groups]);

  useEffect(() => setIdx(0), [q, hits]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, commands.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter") {
      e.preventDefault();
      const c = commands[idx];
      if (c) c.run();
      else if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  };

  return (
    <Dialog.Root open={paletteOpen} onOpenChange={(o) => (o ? setPaletteOpen(true) : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] animate-fade-in bg-scrim/30 backdrop-blur-[2px]" />
        <Dialog.Content dir="rtl" aria-describedby={undefined}
          className="palette fixed inset-x-3 top-[10vh] z-[60] mx-auto flex max-h-[72vh] max-w-2xl animate-rise-in flex-col overflow-hidden">
          <Dialog.Title className="sr-only">فرمان‌یاب</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-5 shrink-0 text-ink-3" aria-hidden />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
              placeholder="جست‌وجو یا فرمان… «پرونده جدید»، «ماده ۵۱»، نام موکل"
              aria-label="جست‌وجو یا فرمان" role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant={commands[idx] ? `cmd-${idx}` : undefined}
              className="h-14 w-full bg-transparent text-lg text-ink outline-none placeholder:text-ink-3" />
            <kbd className="ltr hidden rounded border border-line bg-surface-2 px-1.5 text-2xs text-ink-2 sm:inline">Esc</kbd>
          </div>
          <ul id="palette-list" ref={listRef} role="listbox" className="flex-1 overflow-y-auto p-2">
            {commands.length === 0 && (
              <li className="px-3 py-10 text-center text-sm text-ink-3">
                {q.trim().length >= SEARCH_MIN ? "موردی یافت نشد — Enter برای جست‌وجوی پیشرفته." : "بنویسید تا جست‌وجو شود."}
              </li>
            )}
            {commands.map((c, i) => (
              <li key={c.id} role="presentation">
                {(i === 0 || commands[i - 1].section !== c.section) && <p className="px-3 pb-1 pt-3 text-2xs font-bold text-ink-3">{c.section}</p>}
                <button id={`cmd-${i}`} data-index={i} role="option" aria-selected={i === idx} onClick={c.run} onMouseMove={() => setIdx(i)}
                  className={cn("flex w-full items-center gap-3 rounded-ctl px-3 py-2.5 text-start transition-colors", i === idx ? "bg-lapis text-on-lapis" : "text-ink")}>
                  <c.icon className={cn("size-[18px] shrink-0", i === idx ? "text-on-lapis" : "text-ink-2")} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.hint && <span className={cn("hidden max-w-[45%] truncate text-xs sm:block", i === idx ? "text-on-lapis/80" : "text-ink-3")}>{c.hint}</span>}
                  {i === idx && <CornerDownLeft className="size-4 shrink-0" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-2xs text-ink-3">
            <span><kbd className="font-sans">↑↓</kbd> جابه‌جایی</span>
            <span><kbd className="font-sans">Enter</kbd> اجرا</span>
            <span className="ms-auto">نتایج فقط شامل رکوردهای مجاز شماست</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
