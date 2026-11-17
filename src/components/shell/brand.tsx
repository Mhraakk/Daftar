import { cn } from "@/lib/cn";

/** نشان «دفتر»: مُهر هشت‌پر با خط‌کشی دفتر؛ رنگ‌ها از پوسته فعال */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <rect x="6" y="6" width="28" height="28" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="6" y="6" width="28" height="28" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" transform="rotate(45 20 20)" />
      <circle cx="20" cy="20" r="7.2" fill="rgb(var(--lapis))" />
      <path d="M16.2 18.2h7.6M16.2 21.8h7.6" stroke="rgb(var(--on-lapis))" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** نشان و نام سامانه؛ compact فقط نام کوتاه، tone="page" برای زمینه صفحه (نه نوار ناوبری) */
export function Brand({ size = "md", compact = false, tone = "chrome" }: { size?: "md" | "lg"; compact?: boolean; tone?: "chrome" | "page" }) {
  const ink = tone === "chrome" ? "text-chrome-ink" : "text-ink";
  const sub = tone === "chrome" ? "text-chrome-ink-2" : "text-ink-3";
  return (
    <div className={cn("flex items-center gap-3", ink)}>
      <BrandMark className={size === "lg" ? "size-12" : "size-9"} />
      <div className="leading-tight">
        <p className={cn("font-extrabold", size === "lg" ? "text-2xl" : "text-lg")}>دفتر</p>
        {!compact && <p className={cn("text-2xs", sub)}>سامانه خدمات الکترونیک قضایی</p>}
      </div>
    </div>
  );
}
