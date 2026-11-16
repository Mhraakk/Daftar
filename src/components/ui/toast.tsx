"use client";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/cn";

interface Toast { id: number; kind: "success" | "error"; text: string }
const Ctx = createContext<{ push: (kind: Toast["kind"], text: string) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 start-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id}
            className={cn("pointer-events-auto flex animate-rise-in items-start gap-2.5 rounded-lg border bg-surface p-3 shadow-pop",
              t.kind === "success" ? "border-sabz/40" : "border-mohr/40")}>
            {t.kind === "success" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-sabz" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-mohr" />}
            <p className="flex-1 text-sm leading-6">{t.text}</p>
            <button onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="text-ink-3 hover:text-ink" aria-label="بستن">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const { push } = useContext(Ctx);
  return { success: (t: string) => push("success", t), error: (t: string) => push("error", t) };
}
