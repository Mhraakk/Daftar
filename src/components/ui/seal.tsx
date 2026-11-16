import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/labels";

export function Seal({ tone = "neutral", children, className, dot }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("seal", `seal-${tone}`, className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function StatusSeal({ map, value }: { map: Record<string, { label: string; tone: Tone }>; value: string }) {
  const m = map[value] ?? { label: value, tone: "neutral" as Tone };
  return <Seal tone={m.tone} dot>{m.label}</Seal>;
}
