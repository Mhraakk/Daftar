"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";

const RESET_MS = 1600;

/** کپی در حافظه؛ روی شبکه داخلی (http) که Clipboard API در دسترس نیست از راه جایگزین استفاده می‌شود. */
async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

export function CopyButton({ text, label = "کپی", doneLabel = "کپی شد", testId, variant = "ghost" }: {
  text: string; label?: string; doneLabel?: string; testId?: string; variant?: "ghost" | "secondary";
}) {
  const [done, setDone] = useState(false);
  async function copy() {
    await writeClipboard(text);
    setDone(true);
    setTimeout(() => setDone(false), RESET_MS);
  }
  return (
    <button type="button" onClick={copy} className={buttonClass(variant, "sm")} data-testid={testId} aria-live="polite">
      {done ? <Check /> : <Copy />}{done ? doneLabel : label}
    </button>
  );
}
