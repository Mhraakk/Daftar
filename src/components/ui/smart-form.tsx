"use client";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { JalaliDateInput } from "./date-picker";
import { Lookup, type LookupType } from "./lookup";
import { useToast } from "./toast";

export interface FieldDef {
  name: string;
  label: string;
  type?: "text" | "textarea" | "select" | "jdate" | "time" | "lookup" | "checkbox" | "number" | "password" | "tags" | "multicheck";
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  lookup?: LookupType;
  lookupLabel?: string;
  span?: 1 | 2;
  rows?: number;
  ltr?: boolean;
  /** نمایش مشروط بر مقدار فیلد دیگر */
  showIf?: { field: string; equals: string | boolean };
  autoFocus?: boolean;
}

type Values = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = (input: any) => Promise<ActionResult<any>>;

export function SmartForm({
  fields, initial = {}, action, hidden = {}, submitLabel = "ثبت", successMessage = "با موفقیت ثبت شد.",
  onSuccess, successHref, cols = 2, onCancel, refresh = true, resetOnSuccess, onValuesChange, footer,
}: {
  fields: FieldDef[]; initial?: Values; action: AnyAction; hidden?: Values; submitLabel?: string; successMessage?: string;
  onSuccess?: (data: unknown) => void; successHref?: string | ((data: never) => string); cols?: 1 | 2; onCancel?: () => void;
  refresh?: boolean; resetOnSuccess?: boolean; onValuesChange?: (v: Values) => void; footer?: React.ReactNode;
}) {
  const uid = useId();
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<Values>(() => {
    const v: Values = {};
    for (const f of fields) v[f.name] = initial[f.name] ?? (f.type === "checkbox" ? false : f.type === "multicheck" || f.type === "tags" ? [] : "");
    return v;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (name: string, v: unknown) => {
    setValues((s) => { const n = { ...s, [name]: v }; onValuesChange?.(n); return n; });
    if (errors[name]) setErrors((e) => { const n = { ...e }; delete n[name]; return n; });
  };
  const visible = (f: FieldDef) => !f.showIf || values[f.showIf.field] === f.showIf.equals;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const f of fields) {
      if (!visible(f) || !f.required) continue;
      const v = values[f.name];
      if (v === "" || v === null || v === undefined || v === false || (Array.isArray(v) && v.length === 0)) errs[f.name] = `«${f.label}» الزامی است.`;
    }
    if (Object.keys(errs).length) { setErrors(errs); setFormError("لطفاً موارد مشخص‌شده را تکمیل کنید."); return; }
    setFormError(null);
    const payload: Values = { ...hidden };
    for (const f of fields) if (visible(f)) payload[f.name] = values[f.name];
    start(async () => {
      let res: ActionResult<unknown>;
      try { res = await action(payload); }
      catch { setFormError("ارتباط با سرور برقرار نشد. اطلاعات فرم حفظ شده است؛ دوباره تلاش کنید."); return; }
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.error);
        return;
      }
      toast.success(successMessage);
      if (resetOnSuccess) setValues((s) => Object.fromEntries(Object.keys(s).map((k) => [k, Array.isArray(s[k]) ? [] : typeof s[k] === "boolean" ? false : ""])));
      onSuccess?.(res.data);
      if (successHref) {
        // الگوی «/cases/{id}» با مقادیر پاسخ اکشن پر می‌شود (تابع را نمی‌توان از کامپوننت سرور فرستاد)
        const d = (res.data ?? {}) as Record<string, unknown>;
        router.push(typeof successHref === "string" ? successHref.replace(/\{(\w+)\}/g, (_, k) => String(d[k] ?? "")) : successHref(res.data as never));
      }
      else if (refresh) router.refresh();
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className={cn("grid gap-x-4 gap-y-3.5", cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
        {fields.filter(visible).map((f) => {
          const id = `${uid}-${f.name}`;
          const err = errors[f.name];
          const v = values[f.name];
          const wide = f.span === 2 || f.type === "textarea" || f.type === "multicheck";
          if (f.type === "checkbox") {
            return (
              <label key={f.name} htmlFor={id} className={cn("flex cursor-pointer items-start gap-2.5 rounded-md border border-line bg-surface-2/60 px-3 py-2.5", wide && "sm:col-span-2")}>
                <input id={id} type="checkbox" checked={!!v} onChange={(e) => set(f.name, e.target.checked)} className="mt-1 size-4 accent-[rgb(var(--firuze))]" />
                <span><span className="font-medium">{f.label}</span>{f.hint && <span className="block text-xs text-ink-3">{f.hint}</span>}{err && <span className="block text-xs text-mohr" role="alert">تأیید این مورد الزامی است.</span>}</span>
              </label>
            );
          }
          return (
            <div key={f.name} className={cn("min-w-0", wide && cols === 2 && "sm:col-span-2")}>
              <label htmlFor={id} className={cn("mb-1 block text-sm font-medium text-ink-2", f.required && "after:ms-0.5 after:text-mohr after:content-['*']")}>{f.label}</label>
              {f.type === "textarea" ? (
                <textarea id={id} rows={f.rows ?? 3} value={String(v ?? "")} placeholder={f.placeholder} autoFocus={f.autoFocus}
                  onChange={(e) => set(f.name, e.target.value)} className={cn("input", err && "input-error")} />
              ) : f.type === "select" ? (
                <select id={id} value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} className={cn("input", err && "input-error")}>
                  {!f.required && <option value="">—</option>}
                  {f.required && v === "" && <option value="" disabled>انتخاب کنید…</option>}
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === "jdate" ? (
                <JalaliDateInput id={id} value={String(v ?? "")} onChange={(x) => set(f.name, x)} invalid={!!err} />
              ) : f.type === "lookup" ? (
                <Lookup id={id} type={f.lookup!} value={String(v ?? "")} initialLabel={f.lookupLabel} onChange={(x) => set(f.name, x)} invalid={!!err} placeholder={f.placeholder} />
              ) : f.type === "multicheck" ? (
                <div className="grid grid-cols-1 gap-1.5 rounded-md border border-line p-2.5 sm:grid-cols-2">
                  {f.options?.map((o) => {
                    const arr = (v as string[]) ?? [];
                    return (
                      <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-surface-2">
                        <input type="checkbox" checked={arr.includes(o.value)} className="size-4 accent-[rgb(var(--firuze))]"
                          onChange={(e) => set(f.name, e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value))} />
                        <span className="text-sm">{o.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : f.type === "tags" ? (
                <input id={id} value={((v as string[]) ?? []).join("، ")} placeholder={f.placeholder ?? "برچسب‌ها را با «،» جدا کنید"}
                  onChange={(e) => set(f.name, e.target.value.split(/[،,]/).map((s) => s.trim()).filter((s, i, a) => s || i === a.length - 1))}
                  onBlur={() => set(f.name, ((v as string[]) ?? []).filter(Boolean))} className={cn("input", err && "input-error")} />
              ) : (
                <input id={id} type={f.type === "password" ? "password" : f.type === "time" ? "time" : f.type === "number" ? "number" : "text"}
                  dir={f.ltr || f.type === "time" || f.type === "number" || f.type === "password" ? "ltr" : undefined}
                  value={String(v ?? "")} placeholder={f.placeholder} autoFocus={f.autoFocus} autoComplete={f.type === "password" ? "new-password" : "off"}
                  onChange={(e) => set(f.name, e.target.value)} className={cn("input", (f.ltr || f.type === "number") && "text-right", err && "input-error")} />
              )}
              {err ? <p className="mt-1 text-xs text-mohr" role="alert">{err}</p> : f.hint ? <p className="mt-1 text-xs text-ink-3">{f.hint}</p> : null}
            </div>
          );
        })}
      </div>
      {footer}
      {formError && <p role="alert" className="rounded-md border border-mohr/30 bg-mohr-50 px-3 py-2 text-sm text-mohr">{formError}</p>}
      <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
        {onCancel && <Button variant="ghost" onClick={onCancel} disabled={pending}>انصراف</Button>}
        <Button type="submit" variant="primary" loading={pending}>{submitLabel}</Button>
      </div>
    </form>
  );
}
