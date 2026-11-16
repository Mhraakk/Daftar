"use client";
import { FileUp, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Lookup } from "@/components/ui/lookup";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { OPT } from "@/lib/options";
import { formatBytes } from "@/lib/text";

interface Ctx { caseId?: string; caseLabel?: string; clientId?: string; clientLabel?: string; correspondenceId?: string; taskId?: string; contextLabel?: string }

function send(url: string, fd: FormData, onProgress: (p: number) => void): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", url);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => { try { resolve({ status: x.status, body: JSON.parse(x.responseText || "{}") }); } catch { resolve({ status: x.status, body: {} }); } };
    x.onerror = () => reject(new Error("network"));
    x.send(fd);
  });
}

function FileDrop({ file, setFile, accept, maxMb }: { file: File | null; setFile: (f: File | null) => void; accept: string; maxMb: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}
      className={cn("flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-7 text-center transition-colors", over ? "border-firuze bg-firuze-50" : "border-line-strong bg-surface-2/50")}>
      <UploadCloud className="size-7 text-ink-3" />
      {file ? <p className="font-medium">{file.name} <span className="text-sm text-ink-3">({formatBytes(file.size)})</span></p> : <p className="text-ink-2">فایل را اینجا رها کنید یا</p>}
      <Button size="sm" onClick={() => ref.current?.click()}>{file ? "تغییر فایل" : "انتخاب فایل"}</Button>
      <input ref={ref} type="file" accept={accept} className="sr-only" aria-label="انتخاب فایل" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <p className="text-xs text-ink-3">PDF، Word، Excel، تصویر و متن — حداکثر {maxMb} مگابایت. نوع فایل از روی محتوا بررسی می‌شود.</p>
    </div>
  );
}

export function UploadForm({ ctx, accept, maxMb, canConfidential }: { ctx: Ctx; accept: string; maxMb: number; canConfidential: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [v, setV] = useState({ title: "", category: "", description: "", tags: "", confidentiality: "NORMAL", caseId: ctx.caseId ?? "", clientId: ctx.clientId ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  const pickFile = (f: File | null) => { setFile(f); if (f && !v.title) set("title", f.name.replace(/\.[^.]+$/, "")); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!file) errs.file = "فایل را انتخاب کنید.";
    else if (file.size > maxMb * 1024 * 1024) errs.file = `حجم فایل بیش از ${maxMb} مگابایت است.`;
    if (!v.title.trim()) errs.title = "عنوان سند الزامی است.";
    if (!v.category) errs.category = "نوع سند را انتخاب کنید.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const fd = new FormData();
    fd.set("file", file!);
    for (const [k, val] of Object.entries(v)) fd.set(k, val);
    if (ctx.correspondenceId) fd.set("correspondenceId", ctx.correspondenceId);
    if (ctx.taskId) fd.set("taskId", ctx.taskId);
    setFormError(null); setProgress(0);
    try {
      const r = await send("/api/documents", fd, setProgress);
      if (r.status !== 200) { setErrors((r.body.fieldErrors as Record<string, string>) ?? {}); setFormError(String(r.body.error ?? "بارگذاری ناموفق بود.")); setProgress(null); return; }
      const dup = r.body.duplicateOf as { code: string } | null;
      toast.success(dup ? `سند ثبت شد. توجه: فایل یکسانی قبلاً با کد ${dup.code} ثبت شده است.` : "سند بارگذاری و ثبت شد.");
      router.push(`/documents/${r.body.id}`);
    } catch { setFormError("ارتباط با سرور قطع شد. اطلاعات فرم حفظ شده است؛ دوباره تلاش کنید."); setProgress(null); }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <FileDrop file={file} setFile={pickFile} accept={accept} maxMb={maxMb} />
      {errors.file && <p className="text-xs text-mohr" role="alert">{errors.file}</p>}
      <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className="mb-1 block text-sm font-medium text-ink-2">عنوان سند <span className="text-mohr">*</span></span>
          <input className={cn("input", errors.title && "input-error")} value={v.title} onChange={(e) => set("title", e.target.value)} />{errors.title && <span className="mt-1 block text-xs text-mohr">{errors.title}</span>}</label>
        <label className="block"><span className="mb-1 block text-sm font-medium text-ink-2">نوع سند <span className="text-mohr">*</span></span>
          <select className={cn("input", errors.category && "input-error")} value={v.category} onChange={(e) => set("category", e.target.value)}><option value="" disabled>انتخاب کنید…</option>{OPT.docCategory.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          {errors.category && <span className="mt-1 block text-xs text-mohr">{errors.category}</span>}</label>
        <label className="block"><span className="mb-1 block text-sm font-medium text-ink-2">سطح محرمانگی</span>
          <select className="input" value={v.confidentiality} onChange={(e) => set("confidentiality", e.target.value)} disabled={!canConfidential}>{OPT.confidentiality.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          {!canConfidential && <span className="mt-1 block text-xs text-ink-3">ثبت سند محرمانه نیازمند مجوز است.</span>}</label>
        {ctx.contextLabel ? <p className="rounded-md border border-firuze/25 bg-firuze-50 px-3 py-2 text-sm sm:col-span-2">این سند به «{ctx.contextLabel}» متصل می‌شود.</p> : <>
          <div><span className="mb-1 block text-sm font-medium text-ink-2">پرونده</span><Lookup type="case" value={v.caseId} onChange={(x) => set("caseId", x)} initialLabel={ctx.caseLabel} placeholder="اتصال به پرونده" /></div>
          <div><span className="mb-1 block text-sm font-medium text-ink-2">مراجعه‌کننده</span><Lookup type="client" value={v.clientId} onChange={(x) => set("clientId", x)} initialLabel={ctx.clientLabel} placeholder="در نبود پرونده" /></div>
        </>}
        <label className="block"><span className="mb-1 block text-sm font-medium text-ink-2">برچسب‌ها</span><input className="input" value={v.tags} onChange={(e) => set("tags", e.target.value)} placeholder="با «،» جدا کنید" /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium text-ink-2">توضیحات</span><input className="input" value={v.description} onChange={(e) => set("description", e.target.value)} /></label>
      </div>
      {progress !== null && <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={progress}><div className="h-full bg-firuze transition-all" style={{ width: `${progress}%` }} /></div>}
      {formError && <p role="alert" className="rounded-md border border-mohr/30 bg-mohr-50 px-3 py-2 text-sm text-mohr">{formError}</p>}
      <div className="flex justify-end border-t border-line pt-3"><Button type="submit" variant="primary" loading={progress !== null}><FileUp />بارگذاری و ثبت سند</Button></div>
    </form>
  );
}

export function NewVersionForm({ documentId, accept, maxMb }: { documentId: string; accept: string; maxMb: number }) {
  const router = useRouter();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setErr("فایل نسخه جدید را انتخاب کنید."); return; }
    const fd = new FormData(); fd.set("file", file); fd.set("note", note);
    setErr(null); setProgress(0);
    try {
      const r = await send(`/api/documents/${documentId}/versions`, fd, setProgress);
      setProgress(null);
      if (r.status !== 200) { setErr(String(r.body.error ?? "بارگذاری ناموفق بود.")); return; }
      toast.success("نسخه جدید ثبت شد."); setFile(null); setNote(""); router.refresh();
    } catch { setErr("ارتباط با سرور قطع شد."); setProgress(null); }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <FileDrop file={file} setFile={setFile} accept={accept} maxMb={maxMb} />
      <input className="input" placeholder="توضیح تغییرات این نسخه" value={note} onChange={(e) => setNote(e.target.value)} aria-label="توضیح نسخه" />
      {err && <p role="alert" className="text-sm text-mohr">{err}</p>}
      <Button type="submit" variant="primary" loading={progress !== null}>ثبت نسخه جدید</Button>
    </form>
  );
}
