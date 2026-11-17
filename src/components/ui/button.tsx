import Link from "next/link";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "icon";

const base =
  "press inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-ctl font-medium transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0";
const variants: Record<Variant, string> = {
  primary: "bg-lapis text-on-lapis hover:bg-lapis-600 active:bg-lapis-600",
  accent: "bg-firuze text-on-firuze hover:brightness-95",
  secondary: "border border-line-strong/70 bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-ink/5 hover:text-ink",
  danger: "border border-mohr/40 bg-surface text-mohr hover:bg-mohr-50",
};
const sizes: Record<Size, string> = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-base", icon: "size-9" };

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)} {...rest}>
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
});

export function LinkButton({
  href, variant = "secondary", size = "md", className, children, ...rest
}: { href: string; variant?: Variant; size?: Size } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  // مسیرهای API (دانلود/خروجی) ناوبری کامل مرورگر می‌خواهند، نه ناوبری سمت کلاینت
  if (href.startsWith("/api/")) return <a href={href} className={buttonClass(variant, size, className)} {...rest}>{children}</a>;
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
