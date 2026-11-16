"use client";
import { FileText, LayoutTemplate, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Lookup } from "@/components/ui/lookup";
import { Notice } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { LEGAL_DOC_TYPES } from "@/lib/labels";
import { normalizeFa, toFaDigits } from "@/lib/text";
import { createDraftAction, prepareTemplateAction } from "../actions";

interface Tpl { id: string; name: string; docType: string; category: string | null; description: string | null; versionNo: number }
interface Field { name: string; label: string; known: boolean; value: string }

export function NewDraftWizard({ templates, initialCase, initialTemplateId, aiEnabled }: { templates: Tpl[]; initialCase?: { id: string; label: string }; initialTemplateId?: string; aiEnabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [caseId, setCaseId] = useState(initialCase?.id ?? "");
  const [caseLabel, setCaseLabel] = useState(initialCase?.label ?? "");
  const [method, setMethod] = useState<"template" | "blank">(initialTemplateId || templates.length ? "template" : "blank");
  const [q, setQ] = useState("");
  const [tplId, setTplId] = useState(initialTemplateId ?? "");
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("PETITION");
  const [err, setErr] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();
  const tpl = templates.find((t) => t.id === tplId);

  const filtered = useMemo(() => {
    const n = normalizeFa(q);
    return templates.filter((t) => !n || normalizeFa(`${t.name} ${t.description ?? ""} ${LEGAL_DOC_TYPES[t.docType]}`).includes(n));
  }, [q, templates]);

  // انتخاب قالب یا تغییر پرونده → پیش‌نمایش فیلدها با مقادیر خودکار
  useEffect(() => {
    if (method !== "template" || !tplId) { setFields([]); return; }
    startLoad(async () => {
      const r = await prepareTemplateAction({ templateId: tplId, caseId: caseId || undefined });
      if (!r.ok) { setErr(r.error); return; }
      setErr(null);
      const data = r.data as { template: { name: string; docType: string }; fields: Field[] };
      setFields(data.fields);
      setValues((old) => Object.fromEntries(data.fields.map((f) => [f.name, f.known ? f.value : old[f.name] ?? ""])));
      setDocType(data.template.docType);
      setTitle((t) => t || `${data.template.name}${caseLabel ? ` — ${caseLabel.split(" · ")[0]}` : ""}`);
    });
  }, [tplId, caseId, method, caseLabel]);

  const free = fields.filter((f) => !f.known);
  const known = fields.filter((f) => f.known);
  const missing = fields.filter((f) => !values[f.name]?.trim()).length;

  const create = () => startSave(async () => {
    setErr(null);
    if (!title.trim()) { setErr("عنوان سند را وارد کنید."); return; }
    if (method === "template" && !tplId) { setErr("یک قالب انتخاب کنید."); return; }
    const r = await createDraftAction({ title, docType, caseId: caseId || undefined, templateId: method === "template" ? tplId : undefined, values, contentHtml: method === "blank" ? "<p></p>" : undefined });
    if (!r.ok) { setErr(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.error); return; }
    toast.success("سند ایجاد شد.");
    router.push(`/drafts/${(r.data as { id: string }).id}`);
  });

  return (
    <div className="flex flex-col gap-4">
      <section className="panel p-4">
        <h2 className="mb-3 text-md">۱. پرونده</h2>
        <div className="max-w-xl"><Lookup type="case" value={caseId} initialLabel={caseLabel} onChange={(id, it) => { setCaseId(id); setCaseLabel(it ? `${it.label} · ${it.sub ?? ""}` : ""); }} placeholder="انتخاب پرونده (اطلاعات اصحاب دعوا خودکار درج می‌شود)" /></div>
        {!caseId && <p className="mt-2 text-xs text-ink-3">بدون پرونده هم می‌توانید سند بسازید، اما فیلدهای مراجعه‌کننده و طرف مقابل خودکار پر نمی‌شوند.</p>}
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 text-md">۲. روش تنظیم</h2>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
          {([["template", "از قالب آماده", "قالب‌های تأییدشده دفتر با درج خودکار اطلاعات پرونده", LayoutTemplate], ["blank", "سند خالی", "نگارش آزاد در ویرایشگر حقوقی", FileText]] as const).map(([k, l, h, Icon]) => (
            <button key={k} type="button" role="radio" aria-checked={method === k} onClick={() => setMethod(k)}
              className={cn("flex items-start gap-3 rounded-lg border p-3 text-start transition-colors", method === k ? "border-firuze bg-firuze-50 ring-1 ring-firuze" : "border-line-strong hover:bg-surface-2")}>
              <Icon className="mt-0.5 size-5 shrink-0 text-firuze" /><span><span className="block font-bold">{l}</span><span className="text-sm text-ink-2">{h}</span></span>
            </button>
          ))}
        </div>
        {!aiEnabled && <p className="mt-2 text-xs text-ink-3">پیش‌نویس هوشمند پس از پیکربندی ارائه‌دهنده هوش مصنوعی در تنظیمات فعال می‌شود.</p>}
      </section>

      {method === "template" && (
        <section className="panel p-4">
          <h2 className="mb-3 text-md">۳. انتخاب قالب</h2>
          <div className="relative mb-3 max-w-md"><Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><input className="input ps-9" placeholder="جست‌وجوی قالب…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جست‌وجوی قالب" /></div>
          {filtered.length === 0 ? <p className="text-sm text-ink-3">قالبی یافت نشد.</p> : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="قالب‌ها">
              {filtered.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={tplId === t.id} onClick={() => setTplId(t.id)}
                  className={cn("rounded-md border p-3 text-start transition-colors", tplId === t.id ? "border-firuze bg-firuze-50 ring-1 ring-firuze" : "border-line hover:bg-surface-2")}>
                  <span className="block font-bold">{t.name}</span>
                  <span className="text-xs text-ink-3">{LEGAL_DOC_TYPES[t.docType]}{t.category ? ` · ${t.category}` : ""} · نسخه {toFaDigits(t.versionNo)}</span>
                  {t.description && <span className="mt-1 line-clamp-2 block text-sm text-ink-2">{t.description}</span>}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {(method === "blank" || tpl) && (
        <section className="panel p-4">
          <h2 className="mb-3 text-md">{method === "template" ? "۴. تکمیل اطلاعات" : "۳. مشخصات سند"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="mb-1 block text-sm font-medium text-ink-2">عنوان سند <span className="text-mohr">*</span></span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            {method === "blank" && <label className="block"><span className="mb-1 block text-sm font-medium text-ink-2">نوع سند</span>
              <select className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>{Object.entries(LEGAL_DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
          </div>
          {loading && <p className="mt-3 text-sm text-ink-3">در حال آماده‌سازی فیلدها…</p>}
          {free.length > 0 && <>
            <h3 className="mb-2 mt-5 text-sm font-bold text-ink-2">اطلاعات موردی ({toFaDigits(free.length)} فیلد)</h3>
            <div className="grid gap-3 sm:grid-cols-2">{free.map((f) => (
              <label key={f.name} className={cn("block", f.name.length > 14 && "sm:col-span-2")}><span className="mb-1 block text-sm font-medium text-ink-2">{f.label}</span>
                {f.name.length > 14 || /شرح|متن|دلیل|دفاع|جهت/.test(f.name)
                  ? <textarea className="input" rows={3} value={values[f.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
                  : <input className="input" value={values[f.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />}
              </label>))}</div>
          </>}
          {known.length > 0 && <details className="mt-4 rounded-md border border-line p-3" open={known.some((f) => !values[f.name])}>
            <summary className="cursor-pointer text-sm font-bold text-ink-2">اطلاعات خودکار از پرونده و دفتر ({toFaDigits(known.filter((f) => values[f.name]).length)} از {toFaDigits(known.length)} پر شده)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">{known.map((f) => (
              <label key={f.name} className="block"><span className="mb-1 block text-sm text-ink-2">{f.label}</span>
                <input className={cn("input", !values[f.name] && "border-zafaran")} value={values[f.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} placeholder="در پرونده ثبت نشده" /></label>))}</div>
          </details>}
          {missing > 0 && method === "template" && <div className="mt-3"><Notice tone="warning">{toFaDigits(missing)} فیلد خالی است؛ در متن سند با رنگ زرد مشخص می‌شوند و بعداً در ویرایشگر قابل تکمیل‌اند.</Notice></div>}
          {err && <p role="alert" className="mt-3 rounded-md border border-mohr/30 bg-mohr-50 px-3 py-2 text-sm text-mohr">{err}</p>}
          <div className="mt-4 flex justify-end border-t border-line pt-3"><Button variant="primary" onClick={create} loading={saving}>ایجاد سند و ورود به ویرایشگر</Button></div>
        </section>
      )}
      {method === "template" && !tpl && err && <p role="alert" className="text-sm text-mohr">{err}</p>}
    </div>
  );
}
