"use client";
import { useState } from "react";
import { Button, type ButtonProps } from "./button";
import { Modal } from "./modal";
import { SmartForm } from "./smart-form";

type FormProps = React.ComponentProps<typeof SmartForm>;

/** دکمه + پنجره فرم. پس از موفقیت بسته می‌شود و صفحه تازه‌سازی می‌گردد. */
export function FormDialog({
  trigger, triggerVariant = "primary", triggerSize = "md", title, description, size = "md", icon, defaultOpen = false, ...form
}: {
  trigger: string; triggerVariant?: ButtonProps["variant"]; triggerSize?: ButtonProps["size"]; title: string; description?: string;
  size?: "sm" | "md" | "lg"; icon?: React.ReactNode; defaultOpen?: boolean;
} & FormProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>{icon}{trigger}</Button>
      <Modal open={open} onOpenChange={setOpen} title={title} description={description} size={size}>
        {open && <SmartForm {...form} onCancel={() => setOpen(false)} onSuccess={(d) => { setOpen(false); form.onSuccess?.(d); }} />}
      </Modal>
    </>
  );
}
