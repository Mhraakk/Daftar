"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Modal({
  open, onOpenChange, title, description, children, size = "md", trigger,
}: {
  open?: boolean; onOpenChange?: (o: boolean) => void; title: string; description?: string;
  children: React.ReactNode; size?: "sm" | "md" | "lg" | "xl"; trigger?: React.ReactNode;
}) {
  const w = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-scrim/40 backdrop-blur-[2px]" />
        <Dialog.Content dir="rtl"
          className={cn("fixed inset-x-3 top-[6vh] z-50 mx-auto flex max-h-[88vh] animate-rise-in flex-col rounded-card border border-line bg-surface shadow-pop", w)}>
          <div className="ledger-rule flex items-start justify-between gap-4 px-5 pb-4 pt-4">
            <div>
              <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-0.5 text-sm text-ink-2">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close className="rounded p-1 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label="بستن"><X className="size-5" /></Dialog.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
