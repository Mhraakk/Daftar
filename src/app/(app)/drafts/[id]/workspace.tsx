"use client";
import { Check, CheckCheck, CloudOff, FileDown, Loader2, Lock, Printer, RotateCcw, Save, Send, Stamp, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RichEditor } from "@/components/rich-editor";
import { Button, LinkButton } from "@/components/ui/button";
import { Lookup } from "@/components/ui/lookup";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/cn";
import { extractFields, KNOWN_FIELDS } from "@/lib/template-fields";
import { toFaDigits } from "@/lib/text";
import { finalizeDraftAction, reopenDraftAction, reviewDraftAction, saveDraftAction, submitDraftAction } from "../actions";

type SaveState = "saved" | "dirty" | "saving" | "error";
type Dialog = null | "submit" | "approve" | "changes" | "reopen" | "finalize";

export interface DraftPerms { submit: boolean; review: boolean; reopen: boolean; finalize: boolean }

export function DraftWorkspace(props: {
  id: string; initialHtml: string; initialVersion: number; editable: boolean; title: string; status: string; aiAssisted: boolean;
  perms: DraftPerms; blockers: string[]; finalDocId: string | null; external?: { html: string; nonce: number };
}) {
  const { id, initialHtml, initialVersion, editable, perms, blockers, finalDocId } = props;
  const router = useRouter();
  const toast = useToast();
  const [html, setHtml] = useState(initialHtml);
  const [title, setTitle] = useState(props.title);
  const [state, setState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">(editable ? "edit" : "preview");
  const [conflict, setConflict] = useState<string | null>(null);
  const [recovered, setRecovered] = useState<string | null>(null);
  const [ext, setExt] = useState<{ html: string; nonce: number } | undefined>(undefined);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reviewerId, setReviewerId] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const version = useRef(initialVersion);
  const latest = useRef({ html: initialHtml, title: props.title });
  const lastSaved = useRef({ html: initialHtml, title: props.title });
  const busy = useRef(false);
  const queued = useRef(false);
  const backupKey = `daftar-draft-${id}`;

  useEffect(() => { if (initialVersion > version.current) version.current = initialVersion; }, [initialVersion]);
  useEffect(() => { if (!editable) setMode("preview"); }, [editable]);
  useEffect(() => { if (props.external) setExt(props.external); }, [props.external]);

  // بازیابی متن ذخیره‌نشده پس از بسته‌شدن ناگهانی مرورگر یا قطع ارتباط
  useEffect(() => {
    try {
      const raw = localStorage.getItem(backupKey);
      if (!raw) return;
      const b = JSON.parse(raw) as { html: string; version: number };
      if (editable && b.html !== initialHtml && b.version === initialVersion) setRecovered(b.html); else localStorage.removeItem(backupKey);
    } catch { /* دسترسی به حافظه مرورگر ممکن نیست */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (kind: "AUTOSAVE" | "MANUAL", manualNote?: string): Promise<boolean> => {
    if (!editable || conflict) return false;
    if (busy.current) { queued.current = true; return false; }
    busy.current = true; setState("saving");
    const snap = { ...latest.current };
    try {
      const r = await saveDraftAction({ id, version: version.current, contentHtml: snap.html, mode: kind, note: manualNote, title: snap.title });
      if (!r.ok) {
        setState("error");
        if (r.code === "CONFLICT" || r.code === "LOCKED") setConflict(r.error); else if (kind === "MANUAL") toast.error(r.error);
        return false;
      }
      version.current = r.data.version;
      lastSaved.current = snap;
      setSavedAt(new Date());
      const dirty = latest.current.html !== snap.html || latest.current.title !== snap.title;
      setState(dirty ? "dirty" : "saved");
      if (!dirty) try { localStorage.removeItem(backupKey); } catch { /* */ }
      if (kind === "MANUAL") { toast.success(`نسخه ${toFaDigits(r.data.versionNo)} ثبت شد.`); router.refresh(); }
      return true;
    } catch { setState("error"); return false; } finally {
      busy.current = false;
      if (queued.current) { queued.current = false; void save("AUTOSAVE"); }
    }
  }, [editable, conflict, id, toast, router, backupKey]);

  /** پیش از هر تغییر وضعیت، آخرین متن ذخیره می‌شود تا هیچ تغییری از دست نرود */
  const flush = async (): Promise<boolean> => {
    if (!editable) return true;
    for (let i = 0; busy.current && i < 100; i++) await new Promise((r) => setTimeout(r, 100));
    if (latest.current.html === lastSaved.current.html && latest.current.title === lastSaved.current.title) return true;
    return save("AUTOSAVE");
  };

  const onChange = (h: string) => {
    latest.current.html = h; setHtml(h); setState("dirty");
    try { localStorage.setItem(backupKey, JSON.stringify({ html: h, version: version.current })); } catch { /* */ }
  };

  useEffect(() => {
    if ((state !== "dirty" && state !== "error") || conflict) return;
    const t = setTimeout(() => void save("AUTOSAVE"), state === "error" ? 10_000 : 2500);
    return () => clearTimeout(t);
  }, [html, title, state, save, conflict]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (state !== "saved") { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [state]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = async (fn: () => Promise<ActionResult<any>>, ok: string, after?: (data: any) => void) => {
    setPending(true);
    try {
      if (!(await flush())) { toast.error("ذخیره آخرین تغییرات ممکن نشد؛ پیش از ادامه، ارتباط با سرور را بررسی کنید."); return; }
      const r = await fn();
      if (!r.ok) { toast.error(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.error); return; }
      toast.success(ok); setDialog(null); setNote(""); setReviewerId("");
      after?.(r.data);
      router.refresh();
    } catch { toast.error("ارتباط با سرور برقرار نشد."); } finally { setPending(false); }
  };

  const unfilled = extractFields(html);
  const words = html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  const st = props.status;

  return (
    <div className="flex flex-col gap-3">
      {recovered && (
        <Notice tone="warning" title="متن ذخیره‌نشده‌ای از نشست قبلی پیدا شد">
          <div className="mt-1 flex gap-2">
            <Button size="sm" variant="primary" onClick={() => { onChange(recovered); setExt({ html: recovered, nonce: Date.now() }); setRecovered(null); }}>بازیابی متن</Button>
            <Button size="sm" onClick={() => { try { localStorage.removeItem(backupKey); } catch { /* */ } setRecovered(null); }}>نادیده‌گرفتن</Button>
          </div>
        </Notice>
      )}
      {conflict && <Notice tone="danger" title="ذخیره متوقف شد">{conflict} متن فعلی شما روی همین رایانه نگه داشته شده است. <button className="font-bold underline" onClick={() => location.reload()}>تازه‌سازی صفحه</button></Notice>}
      {props.aiAssisted && st !== "FINAL" && <Notice tone="warning">این سند با کمک هوش مصنوعی تهیه شده است. همه ادعاها، مواد قانونی و ارقام آن باید پیش از تأیید با منبع معتبر تطبیق داده شود.</Notice>}

      <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-2">
        {editable ? <input value={title} onChange={(e) => { setTitle(e.target.value); latest.current.title = e.target.value; setState("dirty"); }} className="input h-9 min-w-[200px] max-w-md flex-1 font-bold" aria-label="عنوان سند" />
          : <span className="flex min-w-[120px] flex-1 items-center gap-1.5 text-sm text-ink-2"><Lock className="size-4" />{st === "FINAL" ? "سند نهایی و قفل است." : st === "APPROVED" ? "تأییدشده؛ برای ویرایش باید به پیش‌نویس برگردد." : "در حال بررسی؛ ویرایش تا پایان بررسی قفل است."}</span>}
        <div className="flex overflow-hidden rounded-md border border-line-strong text-sm">
          {editable && <button onClick={() => setMode("edit")} className={cn("px-3 py-1.5", mode === "edit" ? "bg-night text-white" : "bg-surface hover:bg-surface-2")}>ویرایش</button>}
          <button onClick={() => setMode("preview")} className={cn("px-3 py-1.5", mode === "preview" ? "bg-night text-white" : "bg-surface hover:bg-surface-2")}>پیش‌نمایش چاپ</button>
        </div>
        {editable && (
          <span className={cn("flex items-center gap-1.5 text-xs", state === "error" ? "text-mohr" : "text-ink-3")} role="status" aria-live="polite" data-save-state={state}>
            {state === "saving" && <><Loader2 className="size-3.5 animate-spin" />در حال ذخیره…</>}
            {state === "saved" && <><Check className="size-3.5 text-sabz" />{savedAt ? `ذخیره شد ${savedAt.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}` : "ذخیره‌شده"}</>}
            {state === "dirty" && "تغییرات ذخیره‌نشده…"}
            {state === "error" && !conflict && <><CloudOff className="size-3.5" />سرور در دسترس نیست؛ متن روی این رایانه حفظ شده و دوباره تلاش می‌شود.</>}
          </span>
        )}
        <span className="flex-1" />
        {editable && <Button size="sm" onClick={() => void save("MANUAL")} disabled={state === "saving" || !!conflict} title="Ctrl+S"><Save />ثبت نسخه</Button>}
        <LinkButton href={`/api/drafts/${id}/export?format=docx`} size="sm"><FileDown />Word</LinkButton>
        <LinkButton href={`/api/drafts/${id}/export?format=pdf`} size="sm"><FileDown />PDF</LinkButton>
        <Button size="sm" onClick={() => { setMode("preview"); setTimeout(() => window.print(), 150); }}><Printer />چاپ</Button>
        {perms.submit && <Button size="sm" variant="primary" onClick={() => setDialog("submit")}><Send />ارسال برای بررسی</Button>}
        {perms.review && <><Button size="sm" variant="accent" onClick={() => setDialog("approve")}><CheckCheck />تأیید سند</Button><Button size="sm" variant="danger" onClick={() => setDialog("changes")}><RotateCcw />درخواست اصلاح</Button></>}
        {perms.reopen && <Button size="sm" onClick={() => setDialog("reopen")}><Undo2 />بازگشت به پیش‌نویس</Button>}
        {perms.finalize && <Button size="sm" variant="primary" onClick={() => setDialog("finalize")}><Stamp />نهایی‌سازی</Button>}
        {finalDocId && <LinkButton href={`/documents/${finalDocId}`} size="sm" variant="primary">مشاهده نسخه نهایی در بایگانی</LinkButton>}
      </div>

      {unfilled.length > 0 && st !== "FINAL" && (
        <p className="no-print rounded-md border border-zafaran/30 bg-zafaran-50 px-3 py-2 text-sm" data-testid="unfilled">
          <b className="text-zafaran">{toFaDigits(unfilled.length)} فیلد تکمیل‌نشده:</b> {unfilled.slice(0, 8).map((f) => KNOWN_FIELDS[f] ?? f).join("، ")}{unfilled.length > 8 && " و…"} — در متن با رنگ زرد مشخص شده‌اند و تا تکمیل، سند قابل نهایی‌سازی نیست.
        </p>
      )}

      {mode === "edit" && editable
        ? <RichEditor value={initialHtml} onChange={onChange} onSaveShortcut={() => void save("MANUAL")} externalValue={ext} />
        : <div className="mx-auto w-full max-w-[210mm] rounded border border-line-strong bg-white px-6 py-8 shadow-pop sm:px-[22mm] sm:py-[25mm] print:border-0 print:p-0 print:shadow-none"><div className="legal-doc" dir="rtl" dangerouslySetInnerHTML={{ __html: html }} /></div>}
      <p className="no-print text-xs text-ink-3">{toFaDigits(words)} واژه · متن هر ۲٫۵ ثانیه خودکار ذخیره می‌شود؛ «ثبت نسخه» نسخه‌ای شماره‌دار برای مقایسه و بازگردانی می‌سازد.</p>

      <Modal open={dialog === "submit"} onOpenChange={(o) => !o && setDialog(null)} title="ارسال سند برای بررسی" description="ویرایش سند تا پایان بررسی قفل می‌شود. تنظیم‌کننده نمی‌تواند بررسی‌کننده سند خود باشد." size="sm">
        <label className="mb-1 block text-sm font-medium text-ink-2" htmlFor="reviewer">بررسی‌کننده</label>
        <Lookup id="reviewer" type="user" extraQuery="perm=draft.review" value={reviewerId} onChange={setReviewerId} placeholder="انتخاب بررسی‌کننده دارای مجوز" />
        <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDialog(null)}>انصراف</Button>
          <Button variant="primary" loading={pending} disabled={!reviewerId} onClick={() => run(() => submitDraftAction({ id, reviewerId }), "سند برای بررسی ارسال شد.")}>ارسال</Button></div>
      </Modal>
      <Modal open={dialog === "approve" || dialog === "changes"} onOpenChange={(o) => !o && setDialog(null)} title={dialog === "approve" ? "تأیید سند" : "درخواست اصلاح"} size="sm"
        description={dialog === "approve" ? "با تأیید، صحت محتوا، استنادها و فیلدها را از نظر حقوقی تأیید می‌کنید." : "موارد اصلاحی برای تنظیم‌کننده ارسال می‌شود."}>
        <label className="block"><span className="mb-1 block text-sm font-medium text-ink-2">{dialog === "approve" ? "نظر (اختیاری)" : "موارد اصلاحی"}{dialog === "changes" && <span className="text-mohr"> *</span>}</span>
          <textarea className="input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} autoFocus /></label>
        <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDialog(null)}>انصراف</Button>
          <Button variant={dialog === "approve" ? "accent" : "danger"} loading={pending} disabled={dialog === "changes" && !note.trim()}
            onClick={() => run(() => reviewDraftAction({ id, decision: dialog === "approve" ? "APPROVE" : "CHANGES", comment: note }), dialog === "approve" ? "سند تأیید شد." : "درخواست اصلاح ارسال شد.")}>{dialog === "approve" ? "تأیید" : "ارسال درخواست اصلاح"}</Button></div>
      </Modal>
      <Modal open={dialog === "reopen"} onOpenChange={(o) => !o && setDialog(null)} title="بازگشت به پیش‌نویس" size="sm" description="سند دوباره قابل ویرایش می‌شود و تأیید قبلی (در صورت وجود) باطل خواهد شد.">
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDialog(null)}>انصراف</Button><Button variant="primary" loading={pending} onClick={() => run(() => reopenDraftAction({ id }), "سند به پیش‌نویس برگشت.")}>تأیید</Button></div>
      </Modal>
      <Modal open={dialog === "finalize"} onOpenChange={(o) => !o && setDialog(null)} title="نهایی‌سازی سند" size="sm"
        description="نسخه نهایی Word و PDF ساخته، در بایگانی اسناد پرونده ثبت و سند برای همیشه قفل می‌شود.">
        {blockers.length > 0
          ? <ul className="list-disc space-y-1 ps-5 text-sm text-mohr">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          : <p className="text-sm leading-7 text-ink-2">پس از نهایی‌سازی هیچ تغییری در متن ممکن نیست؛ برای اصلاحات بعدی باید سند جدیدی تنظیم شود.</p>}
        <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDialog(null)}>انصراف</Button>
          <Button variant="primary" loading={pending} disabled={blockers.length > 0} onClick={() => run(() => finalizeDraftAction({ id }), "سند نهایی و در بایگانی ثبت شد.")}>نهایی‌سازی</Button></div>
      </Modal>
      {finalDocId && <span className="hidden"><Link href={`/documents/${finalDocId}`}>نسخه نهایی</Link></span>}
    </div>
  );
}
