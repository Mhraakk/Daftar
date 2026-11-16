import { cn } from "@/lib/cn";

/** نشان «دفتر»: مُهر هشت‌پر با خط‌کشی دفتر */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <rect x="6" y="6" width="28" height="28" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="6" y="6" width="28" height="28" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" transform="rotate(45 20 20)" />
      <circle cx="20" cy="20" r="7.2" fill="rgb(var(--firuze))" />
      <path d="M16.2 18.2h7.6M16.2 21.8h7.6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ size = "md", tone = "light" }: { size?: "md" | "lg"; tone?: "light" | "dark" }) {
  return (
    <div className={cn("flex items-center gap-3", tone === "light" ? "text-white" : "text-night")}>
      <BrandMark className={size === "lg" ? "size-12" : "size-9"} />
      <div className="leading-tight">
        <p className={cn("font-extrabold", size === "lg" ? "text-2xl" : "text-lg")}>دفتر</p>
        <p className={cn("text-2xs", tone === "light" ? "text-white/55" : "text-ink-3")}>سامانه خدمات الکترونیک قضایی</p>
      </div>
    </div>
  );
}
