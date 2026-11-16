"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action";
import { Button, type ButtonProps } from "./button";
import { Modal } from "./modal";
import { useToast } from "./toast";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = (input: any) => Promise<ActionResult<any>>;

/** دکمه اجرای یک اکشن سرور با تأیید اختیاری (برای عملیات حساس) */
export function ActionButton({
  action, payload, children, confirm, confirmLabel = "تأیید", successMessage = "انجام شد.", redirectTo, askNote, noteLabel = "توضیح", noteRequired, ...btn
}: {
  action: AnyAction; payload: Record<string, unknown>; children: React.ReactNode; confirm?: { title: string; body?: string };
  confirmLabel?: string; successMessage?: string; redirectTo?: string; askNote?: string; noteLabel?: string; noteRequired?: boolean;
} & Omit<ButtonProps, "onClick">) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const run = () =>
    start(async () => {
      let res: ActionResult<unknown>;
      try { res = await action(askNote ? { ...payload, [askNote]: note } : payload); }
      catch { toast.error("ارتباط با سرور برقرار نشد."); return; }
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(successMessage);
      setOpen(false); setNote("");
      if (redirectTo) router.push(redirectTo); else router.refresh();
    });
  const needsDialog = !!confirm || !!askNote;
  return (
    <>
      <Button {...btn} loading={pending && !needsDialog} onClick={() => (needsDialog ? setOpen(true) : run())}>{children}</Button>
      {needsDialog && (
        <Modal open={open} onOpenChange={setOpen} title={confirm?.title ?? String(noteLabel)} size="sm">
          {confirm?.body && <p className="mb-3 text-sm leading-7 text-ink-2">{confirm.body}</p>}
          {askNote && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-2">{noteLabel}{noteRequired && <span className="text-mohr"> *</span>}</span>
              <textarea autoFocus className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>انصراف</Button>
            <Button variant={btn.variant === "danger" ? "danger" : "primary"} loading={pending} disabled={!!askNote && noteRequired && !note.trim()} onClick={run}>{confirmLabel}</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
