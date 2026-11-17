"use client";
// راهنمای ابزار نمودارها: یک گره برای همه نمودارهای صفحه؛ با اشاره یا تمرکز صفحه‌کلید روی هر عنصر [data-tip]
// عنوان و مقدارها را نشان می‌دهد. متن‌ها با textContent درج می‌شوند (داده نامطمئن، هرگز innerHTML).
import { useEffect } from "react";

interface TipData { t: string; r: [string, string, string][] }

const OFFSET = 14;
const EDGE = 8;
const HALF = 2;

function parse(raw: string | undefined): TipData | null {
  try {
    const v = JSON.parse(raw ?? "") as TipData;
    return typeof v.t === "string" && Array.isArray(v.r) ? v : null;
  } catch {
    return null;
  }
}

/** گره‌های محتوای راهنما (عنوان و ردیف‌ها) */
function nodesFor(data: TipData): HTMLElement[] {
  const title = document.createElement("b");
  title.textContent = data.t;
  const rows = data.r.map(([label, value, color]) => {
    const row = document.createElement("div");
    const key = document.createElement("i");
    key.style.background = color || "transparent";
    const strong = document.createElement("strong");
    strong.textContent = value;
    const name = document.createElement("span");
    name.textContent = label;
    row.append(key, strong, name);
    return row;
  });
  return [title, ...rows];
}

/** جای راهنما بالای نقطه اشاره، درون صفحه؛ اگر بالا جا نشود زیر آن */
function translateFor(size: { w: number; h: number }, x: number, y: number): string {
  const left = Math.min(Math.max(EDGE, x - size.w / HALF), window.innerWidth - size.w - EDGE);
  const top = y - size.h - OFFSET < EDGE ? y + OFFSET : y - size.h - OFFSET;
  return `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

export function ChartTips() {
  useEffect(() => {
    const el = document.createElement("div");
    el.className = "dfc-tip";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "left:0;top:0;display:none";
    document.body.append(el);
    const target = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>("[data-tip]") : null);
    const show = (node: HTMLElement, x: number, y: number) => {
      const data = parse(node.dataset.tip);
      if (!data) return;
      el.replaceChildren(...nodesFor(data));
      el.style.display = "block";
      el.style.transform = translateFor({ w: el.offsetWidth, h: el.offsetHeight }, x, y);
    };
    const hide = () => { el.style.display = "none"; };
    const onMove = (e: PointerEvent) => {
      const node = target(e);
      if (node) show(node, e.clientX, e.clientY);
      else hide();
    };
    const onFocus = (e: FocusEvent) => {
      const node = target(e);
      if (!node) return;
      const r = node.getBoundingClientRect();
      show(node, r.left + r.width / HALF, r.top);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("scroll", hide, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("scroll", hide, { capture: true });
      el.remove();
    };
  }, []);
  return null;
}
