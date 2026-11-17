"use client";
// انتخاب ظاهر: چهار چیدمان (با طرح کوچک هر کدام) و چهار پوسته (با رنگ‌های واقعی همان پوسته)، ترکیب آزاد.
// انتخاب فوراً روی صفحه اعمال و در پس‌زمینه برای کاربر ذخیره می‌شود؛ «پیش‌فرض دفتر» انتخاب را پاک می‌کند.
import * as Popover from "@radix-ui/react-popover";
import { Check, Palette } from "lucide-react";
import { cn } from "@/lib/cn";
import { LAYOUT_IDS, LAYOUTS_META, SKIN_IDS, SKINS, SKINS_META, type LayoutId } from "@/theme/skins";
import { useShell } from "./shell-context";

/** طرح کوچک هر چیدمان (راست‌به‌چپ: آغاز صفحه سمت راست است) */
function LayoutSketch({ id }: { id: LayoutId }) {
  const block = "fill-current opacity-15";
  const strong = "fill-current opacity-45";
  const sketches: Record<LayoutId, React.ReactNode> = {
    sidebar: (<><rect x="52" y="4" width="16" height="40" rx="3" className={strong} /><rect x="4" y="6" width="44" height="6" rx="2" className={block} /><rect x="4" y="16" width="21" height="12" rx="2" className={block} /><rect x="27" y="16" width="21" height="12" rx="2" className={block} /><rect x="4" y="31" width="44" height="13" rx="2" className={block} /></>),
    dock: (<><rect x="4" y="4" width="64" height="5" rx="2" className={block} /><rect x="4" y="12" width="31" height="14" rx="2" className={block} /><rect x="37" y="12" width="31" height="14" rx="2" className={block} /><rect x="18" y="37" width="36" height="7" rx="3.5" className={strong} /></>),
    columns: (<><rect x="62" y="4" width="6" height="40" rx="2" className={strong} /><rect x="45" y="4" width="15" height="40" rx="2" className="fill-current opacity-30" /><rect x="4" y="4" width="39" height="8" rx="2" className={block} /><rect x="4" y="15" width="39" height="29" rx="2" className={block} /></>),
    command: (<><rect x="4" y="4" width="64" height="5" rx="2" className={block} /><rect x="14" y="13" width="44" height="7" rx="3.5" className={strong} /><rect x="4" y="24" width="64" height="3" rx="1.5" className="fill-current opacity-30" /><rect x="4" y="30" width="64" height="14" rx="2" className={block} /></>),
  };
  return <svg viewBox="0 0 72 48" className="h-12 w-[72px]" aria-hidden>{sketches[id]}</svg>;
}

function SkinSwatch({ id }: { id: (typeof SKIN_IDS)[number] }) {
  const c = SKINS[id].colors;
  const hex = (h: string) => `#${h}`;
  return (
    <span className="relative block h-12 w-[72px] overflow-hidden rounded-md border border-line" style={{ background: hex(c.paper) }} aria-hidden>
      <span className="absolute inset-y-1.5 end-1.5 w-4 rounded-sm" style={{ background: hex(c.chrome), outline: `1px solid ${hex(c["chrome-line"])}` }} />
      <span className="absolute start-1.5 top-1.5 h-4 w-9 rounded-sm" style={{ background: hex(c.surface), outline: `1px solid ${hex(c.line)}` }} />
      <span className="absolute bottom-1.5 start-1.5 h-2.5 w-6 rounded-full" style={{ background: hex(c.lapis) }} />
      <span className="absolute bottom-1.5 start-9 size-2.5 rounded-full" style={{ background: hex(c.firuze) }} />
      <span className="absolute bottom-1.5 start-12 size-2.5 rounded-full" style={{ background: hex(c.mohr) }} />
    </span>
  );
}

function Option({ selected, onSelect, title, hint, children }: { selected: boolean; onSelect: () => void; title: string; hint: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} title={hint}
      className={cn("press group flex flex-col items-center gap-1.5 rounded-ctl border p-2 text-center transition-colors",
        selected ? "border-lapis bg-lapis-50 text-lapis" : "border-line text-ink-2 hover:border-line-strong hover:text-ink")}>
      {children}
      <span className="flex items-center gap-1 text-xs font-bold">{selected && <Check className="size-3.5" aria-hidden />}{title}</span>
    </button>
  );
}

export function AppearancePicker({ compact = false }: { compact?: boolean }) {
  const shell = useShell();
  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-2 flex w-full items-center justify-between text-sm font-bold">
          چیدمان
          {shell.userLayout && <button type="button" onClick={() => shell.setLayout(null)} className="text-xs font-normal text-lapis hover:underline">پیش‌فرض دفتر</button>}
        </legend>
        <div className="grid grid-cols-4 gap-2">
          {LAYOUT_IDS.map((l) => (
            <Option key={l} selected={shell.layout === l} onSelect={() => shell.setLayout(l)} title={LAYOUTS_META[l].label} hint={LAYOUTS_META[l].hint}>
              <LayoutSketch id={l} />
            </Option>
          ))}
        </div>
        {!compact && <p className="mt-2 text-xs text-ink-3">{LAYOUTS_META[shell.layout].hint}</p>}
      </fieldset>
      <fieldset>
        <legend className="mb-2 flex w-full items-center justify-between text-sm font-bold">
          پوسته
          {shell.userSkin && <button type="button" onClick={() => shell.setSkin(null)} className="text-xs font-normal text-lapis hover:underline">پیش‌فرض دفتر</button>}
        </legend>
        <div className="grid grid-cols-4 gap-2">
          {SKIN_IDS.map((s) => (
            <Option key={s} selected={shell.skin === s} onSelect={() => shell.setSkin(s)} title={SKINS_META[s].label} hint={SKINS_META[s].hint}>
              <SkinSwatch id={s} />
            </Option>
          ))}
        </div>
        {!compact && <p className="mt-2 text-xs text-ink-3">{SKINS_META[shell.skin].hint}</p>}
      </fieldset>
    </div>
  );
}

export function AppearanceButton({ className }: { className?: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" aria-label="ظاهر: چیدمان و پوسته" className={cn("tool-btn", className)}><Palette className="size-[18px]" /></button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} dir="rtl" className="floating z-50 w-[min(94vw,380px)] animate-rise-in p-4">
          <AppearancePicker compact />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
