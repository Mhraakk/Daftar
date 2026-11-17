"use client";
// صفحه ویجت‌های پیشخوان: ترتیب با کشیدن (اشاره‌گر و لمس) یا دکمه‌های جابه‌جایی، پنهان/نمایش، و ذخیره خودکار برای هر کاربر
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveDashboardAction } from "@/app/(app)/dashboard-actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { faNum } from "@/lib/text";
import { arrange, moveTo, shift, WIDGET_META, type DashboardLayout, type WidgetId, type WidgetSize } from "@/lib/dashboard-widgets";

export interface BoardWidget { id: WidgetId; node: React.ReactNode }

const SAVE_DEBOUNCE_MS = 600;
const SPAN: Record<WidgetSize, string> = { full: "xl:col-span-3", wide: "xl:col-span-2", narrow: "xl:col-span-1" };

/** قاب حالت ویرایش: خط‌چین برای همه، خط پیوسته رنگی برای هدف رها کردن */
const frame = (target: boolean): string => cn("rounded-card outline-2 outline-offset-2", target ? "outline outline-lapis" : "outline-dashed outline-line-strong/60");

export function WidgetBoard({ widgets, saved }: { widgets: BoardWidget[]; saved: { order: string[]; hidden: string[] } }) {
  const toast = useToast();
  const available = widgets.map((w) => w.id);
  const [layout, setLayout] = useState<DashboardLayout>(() => arrange(available, saved));
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<{ id: WidgetId; over: WidgetId | null } | null>(null);
  const dragRef = useRef(drag);
  const [, start] = useTransition();
  const dirty = useRef(false);
  const nodes = new Map(widgets.map((w) => [w.id, w.node]));

  useEffect(() => {
    if (!dirty.current) return undefined;
    const timer = setTimeout(() => start(async () => {
      const r = await saveDashboardAction({ layout });
      if (!r.ok) toast.error(r.error);
    }), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [layout, toast]);

  const update = (fn: (l: DashboardLayout) => DashboardLayout) => { dirty.current = true; setLayout(fn); };
  const toggle = (id: WidgetId) => update((l) => ({ ...l, hidden: l.hidden.includes(id) ? l.hidden.filter((h) => h !== id) : [...l.hidden, id] }));
  const reset = () => start(async () => {
    dirty.current = false;
    setLayout(arrange(available));
    const r = await saveDashboardAction({ layout: null });
    if (r.ok) toast.success("چیدمان پیش‌فرض بازگردانده شد.");
  });

  // کشیدن: هدف در حین کشیدن فقط برجسته می‌شود و جابه‌جایی یک‌بار هنگام رها کردن انجام می‌شود
  // (جابه‌جایی زنده چیدمان شبکه را می‌لرزاند و هدف زیر اشاره‌گر را عوض می‌کند)
  const dragging = drag?.id ?? null;
  useEffect(() => { dragRef.current = drag; }, [drag]);
  useEffect(() => {
    if (!dragging) return undefined;
    const move = (e: PointerEvent) => {
      const over = (document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-widget]")?.getAttribute("data-widget") ?? null) as WidgetId | null;
      setDrag((d) => (d && d.over !== over ? { ...d, over } : d));
    };
    const drop = () => {
      const d = dragRef.current;
      setDrag(null);
      if (d?.over && d.over !== d.id) update((l) => ({ ...l, order: moveTo(l.order, d.id, d.over as WidgetId) }));
    };
    const cancel = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragging]);

  const visible = layout.order.filter((id) => editing || !layout.hidden.includes(id));
  const hiddenCount = layout.hidden.length;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {editing && <span className="me-auto text-sm text-ink-2">ویجت‌ها را با دستگیره بکشید یا با پیکان‌ها جابه‌جا کنید؛ تغییرات خودکار ذخیره می‌شود.</span>}
        {!editing && hiddenCount > 0 && <span className="text-xs text-ink-3">{faNum(hiddenCount)} ویجت پنهان</span>}
        {editing && <Button variant="ghost" size="sm" onClick={reset}><RotateCcw />چیدمان پیش‌فرض</Button>}
        <Button variant={editing ? "primary" : "ghost"} size="sm" onClick={() => setEditing(!editing)} aria-pressed={editing}>
          <SlidersHorizontal />{editing ? "پایان شخصی‌سازی" : "شخصی‌سازی پیشخوان"}
        </Button>
      </div>
      <div className="grid gap-4 xl:grid-flow-row-dense xl:grid-cols-3">
        {visible.map((id, i) => {
          const meta = WIDGET_META[id];
          const off = layout.hidden.includes(id);
          return (
            <section key={id} data-widget={id} aria-label={meta.title}
              className={cn("min-w-0", SPAN[meta.size], editing && frame(drag?.over === id && dragging !== id), dragging === id && "opacity-60")}>
              {editing && (
                <div className="flex items-center gap-1 rounded-t-card bg-surface-2 px-2 py-1.5 text-sm">
                  <button type="button" className="cursor-grab touch-none rounded-ctl p-1.5 text-ink-3 hover:bg-ink/5 active:cursor-grabbing" aria-label={`کشیدن «${meta.title}»`}
                    onPointerDown={(e) => { e.preventDefault(); setDrag({ id, over: null }); }}>
                    <GripVertical className="size-4" aria-hidden />
                  </button>
                  <span className={cn("min-w-0 flex-1 truncate font-medium", off && "text-ink-3 line-through")}>{meta.title}</span>
                  <button type="button" onClick={() => update((l) => ({ ...l, order: shift(l.order, id, -1) }))} disabled={i === 0} className="rounded-ctl p-1.5 text-ink-3 hover:bg-ink/5 disabled:opacity-30" aria-label={`جابه‌جایی «${meta.title}» به جلو`}><ArrowUp className="size-4" /></button>
                  <button type="button" onClick={() => update((l) => ({ ...l, order: shift(l.order, id, 1) }))} disabled={i === visible.length - 1} className="rounded-ctl p-1.5 text-ink-3 hover:bg-ink/5 disabled:opacity-30" aria-label={`جابه‌جایی «${meta.title}» به عقب`}><ArrowDown className="size-4" /></button>
                  <button type="button" onClick={() => toggle(id)} className="rounded-ctl p-1.5 text-ink-3 hover:bg-ink/5" aria-pressed={!off} aria-label={off ? `نمایش «${meta.title}»` : `پنهان کردن «${meta.title}»`}>
                    {off ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              )}
              <div className={cn(editing && "pointer-events-none select-none", off && "opacity-40")} inert={editing}>{nodes.get(id)}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
