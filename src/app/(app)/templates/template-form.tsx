"use client";
import type { Editor } from "@tiptap/react";
import { FileUp, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FieldInserter } from "@/components/field-inserter";
import { RichEditor } from "@/components/rich-editor";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { LEGAL_DOC_TYPES } from "@/lib/labels";
import { extractFields, KNOWN_FIELDS } from "@/lib/template-fields";
import { toFaDigits } from "@/lib/text";
import { createTemplateAction, templateVersionAction } from "./actions";

function FieldList({ html }: { html: string }) {
  const f = extractFields(html);
  if (!f.length) return <p className="text-sm text-ink-3">هنوز فیلدی در متن درج نشده است.</p>;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="فیلدهای قالب">
      {f.map((x) => <li key={x} className={cn("rounded px-2 py-0.5 text-xs", x in KNOWN_FIELDS ? "bg-firuze-50 text-firuze" : "bg-zafaran-50 text-zafaran")} title={x in KNOWN_FIELDS ? "خودکار از پرونده" : "توسط کاربر تکمیل می‌شود"}>{KNOWN_FIELDS[x] ?? x}</li>)}
    </ul>
  );
}

/** ایجاد قالب: نگارش مستقیم یا درون‌ریزی از Word/PDF */
export function NewTemplateForm() {
  const router = useRouter();
  const toast = useToast();
  const [meta, setMeta] = useState({ name: "", docType: "PETITION", category: "", description: "", legalBasis: "" });
  const [html, setHtml] = useState("<h1>عنوان سند</h1><p></p>");
  const [ext, setExt] = useState<{ html: string; nonce: number }>();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [source, setSource] = useState<{ key: string; name: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [saving, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof meta, v: string) => setMeta((m) => ({ ...m, [k]: v }));

  const importFile = async (file: File) => {
    setImporting(true); setFormError(null);
    try {
      const fd = new FormData(); fd.set("file", file);
      const r = await fetch("/api/templates/import", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) { setFormError(j.error ?? "درون‌ریزی ناموفق بود."); return; }
      setHtml(j.html); setExt({ html: j.html, nonce: Date.now() }); setSource({ key: j.sourceKey, name: j.sourceName });
      if (!meta.name) set("name", file.name.replace(/\.[^.]+$/, ""));
      toast.success(`متن «${file.name}» درون‌ریزی شد؛ فیلدهای متغیر را با «درج فیلد» جایگزین کنید.`);
    } catch { setFormError("ارتباط با سرور برقرار نشد."); } finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const save = () => start(async () => {
    const errs: Record<string, string> = {};
    if (meta.name.trim().length < 3) errs.name = "نام قالب باید دست‌کم ۳ نویسه باشد.";
    if (!html.replace(/<[^>]+>/g, "").trim()) errs.contentHtml = "متن قالب خالی است.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const r = await createTemplateAction({ ...meta, contentHtml: html, sourceKey: source?.key, sourceName: source?.name });
    if (!r.ok) { setErrors(r.fieldErrors ?? {}); setFormError(r.error); return; }
    toast.success("قالب ذخیره شد.");
    router.push(`/templates/${(r.data as { id: string }).id}`);
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => fileRef.current?.click()} loading={importing}><FileUp />درون‌ریزی از Word یا PDF</Button>
          <input ref={fileRef} type="file" accept=".docx,.pdf" className="sr-only" aria-label="فایل قالب" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          {source && <span className="text-sm text-ink-2">منبع: {source.name}</span>}
        </div>
        <FieldInserter editor={editor} />
        {errors.contentHtml && <p className="text-sm text-mohr" role="alert">{errors.contentHtml}</p>}
        <RichEditor value={html} onChange={setHtml} externalValue={ext} onReady={setEditor} onSaveShortcut={save} />
      </div>
      <aside className="flex flex-col gap-4">
        <div className="panel flex flex-col gap-3 p-4">
          <label className="block"><span className="mb-1 block text-sm font-medium text-ink-2">نام قالب <span className="text-mohr">*</span></span>
            <input className={cn("input", errors.name && "input-error")} value={meta.name} onChange={(e) => set("name", e.target.value)} />{errors.name && <span className="mt-1 block text-xs text-mohr">{errors.name}</span>}</label>
          <label className="block"><span className="mb-1 block text-sm font-medium text-ink-2">نوع سند</span>
            <select className="input" value={meta.docType} onChange={(e) => set("docType", e.target.value)}>{Object.entries(LEGAL_DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-sm font-medium text-ink-2">دسته</span><input className="input" value={meta.category} onChange={(e) => set("category", e.target.value)} placeholder="مثلاً حقوقی، کیفری، خانواده" /></label>
          <label className="block"><span className="mb-1 block text-sm font-medium text-ink-2">توضیح کاربرد</span><textarea className="input" rows={2} value={meta.description} onChange={(e) => set("description", e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-sm font-medium text-ink-2">مستند قانونی (برای بررسی)</span><input className="input" value={meta.legalBasis} onChange={(e) => set("legalBasis", e.target.value)} /></label>
          {formError && <p role="alert" className="rounded-md border border-mohr/30 bg-mohr-50 px-3 py-2 text-sm text-mohr">{formError}</p>}
          <Button variant="primary" onClick={save} loading={saving}><Save />ذخیره قالب</Button>
        </div>
        <div className="panel p-4"><h2 className="mb-2 text-md">فیلدهای شناسایی‌شده ({toFaDigits(extractFields(html).length)})</h2><FieldList html={html} />
          <p className="mt-3 text-xs leading-6 text-ink-3"><span className="rounded bg-firuze-50 px-1 text-firuze">فیروزه‌ای</span>: خودکار از پرونده؛ <span className="rounded bg-zafaran-50 px-1 text-zafaran">زرد</span>: کاربر هنگام ساخت سند وارد می‌کند.</p></div>
      </aside>
    </div>
  );
}

/** ثبت نسخه جدید قالب؛ نسخه‌های پیشین و اسنادِ ساخته‌شده از آن‌ها دست‌نخورده می‌مانند */
export function TemplateVersionEditor({ id, html: initial }: { id: string; html: string }) {
  const router = useRouter();
  const toast = useToast();
  const [html, setHtml] = useState(initial);
  const [note, setNote] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pending, start] = useTransition();
  const dirty = html !== initial;
  const save = () => start(async () => {
    const r = await templateVersionAction({ id, contentHtml: html, note });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`نسخه ${toFaDigits((r.data as { versionNo: number }).versionNo)} قالب ثبت شد.`); setNote(""); router.refresh();
  });
  return (
    <div className="flex flex-col gap-3">
      <FieldInserter editor={editor} />
      <RichEditor value={initial} onChange={setHtml} onReady={setEditor} onSaveShortcut={() => dirty && save()} />
      <div className="panel flex flex-wrap items-center gap-2 p-3">
        <input className="input max-w-md flex-1" placeholder="شرح تغییرات این نسخه" value={note} onChange={(e) => setNote(e.target.value)} aria-label="شرح تغییرات" />
        <Button variant="primary" onClick={save} loading={pending} disabled={!dirty}><Save />ثبت نسخه جدید</Button>
        {!dirty && <span className="text-xs text-ink-3">تغییری ایجاد نشده است.</span>}
      </div>
      <Notice tone="info">اسنادی که پیش‌تر از این قالب ساخته شده‌اند تغییر نمی‌کنند؛ نسخه جدید فقط برای اسناد بعدی به کار می‌رود.</Notice>
      <aside className="panel p-4"><h2 className="mb-2 text-md">فیلدهای این نسخه</h2><FieldList html={html} /></aside>
    </div>
  );
}
