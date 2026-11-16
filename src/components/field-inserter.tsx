"use client";
import type { Editor } from "@tiptap/react";
import { Braces } from "lucide-react";
import { useState } from "react";
import { KNOWN_FIELDS } from "@/lib/template-fields";
import { Button } from "./ui/button";

/** درج فیلد پویا در محل نشانگر ویرایشگر */
export function FieldInserter({ editor }: { editor: Editor | null }) {
  const [custom, setCustom] = useState("");
  const insert = (name: string) => { if (editor && name.trim()) editor.chain().focus().insertContent(`{{${name.trim()}}}`).run(); };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-2/60 p-2">
      <Braces className="size-4 text-zafaran" aria-hidden />
      <select className="input h-8 w-auto min-w-[200px] text-sm" value="" onChange={(e) => { insert(e.target.value); e.target.value = ""; }} aria-label="درج فیلد خودکار" disabled={!editor}>
        <option value="">درج فیلد خودکار…</option>
        {Object.entries(KNOWN_FIELDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <input className="input h-8 w-48 text-sm" placeholder="فیلد آزاد، مثلاً: مبلغ خواسته" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="نام فیلد آزاد"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); insert(custom); setCustom(""); } }} />
      <Button size="sm" onClick={() => { insert(custom); setCustom(""); }} disabled={!custom.trim() || !editor}>درج</Button>
      <span className="text-xs text-ink-3">فیلدهای خودکار هنگام ساخت سند از اطلاعات پرونده پر می‌شوند؛ فیلدهای آزاد را کاربر وارد می‌کند.</span>
    </div>
  );
}
