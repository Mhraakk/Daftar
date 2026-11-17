"use client";
// اتصال حساب کاربر به پیام‌رسان: کد یک‌بارمصرف برای ربات دفتر، تأیید اتصال، ثبت دستی شناسه یا قطع اتصال
import { BellRing, Check, Link2, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmMessengerLinkAction, setChatIdAction, startMessengerLinkAction } from "@/app/(app)/account/actions";
import { CopyButton } from "@/components/research/copy-button";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface Code { code: string; until: string; bot: string | null }

export function MessengerLink({ enabled, linked }: { enabled: boolean; linked: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState<Code | null>(null);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, done: (data: unknown) => void) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) { setError(r.error); return; }
    done(r.data);
  });
  const newCode = () => run(() => startMessengerLinkAction({}), (d) => setCode(d as Code));
  const confirm = () => run(() => confirmMessengerLinkAction({}), () => { setCode(null); toast.success("حساب شما به پیام‌رسان وصل شد."); router.refresh(); });
  const saveManual = (value: string) => run(() => setChatIdAction({ chatId: value }), () => { setManual(""); toast.success(value ? "شناسه گفت‌وگو ثبت شد." : "اتصال پیام‌رسان قطع شد."); router.refresh(); });

  return (
    <div className="flex flex-col gap-4 text-sm leading-7">
      <p className="flex items-center gap-2">
        <BellRing className="size-4 text-ink-3" aria-hidden />
        {linked ? <>حساب شما به گفت‌وگوی <span className="ltr font-medium">{linked}</span> وصل است.</> : "حساب شما هنوز به پیام‌رسان وصل نیست."}
      </p>
      {!enabled && <p className="text-ink-3">ارسال اعلان به پیام‌رسان در تنظیمات دفتر خاموش است؛ پس از روشن شدن، اعلان‌های مهم به همین گفت‌وگو می‌رسد.</p>}
      {enabled && !code && <div><Button variant="secondary" size="sm" onClick={newCode} disabled={pending}><Link2 />{linked ? "اتصال دوباره با کد" : "دریافت کد اتصال"}</Button></div>}
      {code && (
        <div className="rounded-card border border-line bg-surface-2 p-4">
          <p>این کد را در پیام‌رسان برای ربات دفتر{code.bot ? <> (<span className="ltr font-medium">@{code.bot}</span>)</> : ""} بفرستید؛ سپس «تأیید اتصال» را بزنید. اعتبار کد تا ساعت {code.until} است.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="ltr rounded-ctl border border-line-strong bg-surface px-3 py-1.5 font-mono text-lg font-bold tracking-widest">{code.code}</span>
            <CopyButton text={code.code} label="کپی کد" />
            <Button variant="primary" size="sm" onClick={confirm} disabled={pending}><Check />تأیید اتصال</Button>
          </div>
        </div>
      )}
      <details className="text-ink-2">
        <summary className="cursor-pointer text-sm text-ink-3 hover:text-lapis">ورود دستی شناسه گفت‌وگو</summary>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-sm font-medium text-ink-2">شناسه عددی گفت‌وگو</span>
            <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" className="input ltr" placeholder="123456789" />
          </label>
          <Button variant="secondary" size="sm" onClick={() => saveManual(manual)} disabled={pending || !manual.trim()}>ثبت</Button>
        </div>
      </details>
      {linked && <div><Button variant="danger" size="sm" onClick={() => saveManual("")} disabled={pending}><Unlink />قطع اتصال</Button></div>}
      {error && <p className="text-mohr" role="alert">{error}</p>}
    </div>
  );
}
