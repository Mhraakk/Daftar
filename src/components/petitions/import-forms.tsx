"use client";
// ورود گروهی فرم‌های دادخواست PDF (مدیر اسناد حقوقی): نتیجه هر فایل — نوع تازه (پیش‌نویس)، تکراری، یا خطا
import { FileUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { faNum } from "@/lib/text";

interface Outcome { fileName: string; id?: string; existed?: boolean; warnings?: string[]; error?: string }

export function ImportForms() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Outcome[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/petitions/import", { method: "POST", body: new FormData(e.currentTarget) });
      const j = (await r.json()) as { results?: Outcome[]; error?: string };
      if (!r.ok) setError(j.error ?? "ورود ناموفق بود.");
      setResults(j.results ?? []);
      router.refresh();
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><FileUp />ورود فرم دادخواست (PDF)</Button>
      <Modal open={open} onOpenChange={setOpen} title="ورود فرم دادخواست" description="فرم‌های جدول‌دار «دادخواست خدمات قضایی» (Fk01/00). هر فایل یک نوع پیش‌نویس می‌سازد که پس از بازبینی منتشر می‌کنید.">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input type="file" name="files" accept="application/pdf,.pdf" multiple required className="input h-auto py-2" aria-label="فایل‌های PDF" />
          <Button type="submit" variant="primary" loading={busy}>بارگذاری و تجزیه</Button>
        </form>
        {error && <p className="mt-3 text-sm text-mohr" role="alert">{error}</p>}
        {results.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2" aria-live="polite">
            {results.map((r) => (
              <li key={r.fileName} className="rounded-ctl border border-line p-2.5 text-sm">
                <p className="font-medium">{r.fileName}</p>
                {r.error && <p className="text-mohr">{r.error}</p>}
                {r.id && (
                  <p className="text-ink-2">
                    {r.existed ? "قبلاً وارد شده است — " : "نوع پیش‌نویس ساخته شد — "}
                    <Link href={`/petitions/${r.id}`} className="text-lapis hover:underline">بازبینی</Link>
                    {r.warnings && r.warnings.length > 0 && <span className="text-zafaran"> · {faNum(r.warnings.length)} هشدار</span>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
