import { DatabaseBackup, Download, ShieldCheck } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import type { Tone } from "@/lib/labels";
import { formatBytes } from "@/lib/text";
import { userNames } from "@/server/access";
import { createBackupAction, verifyBackupAction } from "./actions";

export const metadata = { title: "پشتیبان‌گیری" };
const STATUS: Record<string, { label: string; tone: Tone }> = { CREATED: { label: "تهیه‌شده · آزمون‌نشده", tone: "warning" }, VERIFIED: { label: "بازیابی آزموده‌شده", tone: "success" }, FAILED: { label: "آزمون ناموفق", tone: "danger" }, PRUNED: { label: "حذف دوره‌ای", tone: "neutral" } };

export default async function BackupPage() {
  await requirePagePerm("backup.manage");
  const rows = await db.backupRecord.findMany({ orderBy: { createdAt: "desc" }, take: 60 });
  const names = await userNames(rows.map((r) => r.createdById));
  const lastOk = rows.find((r) => r.status === "VERIFIED");
  const last = rows[0];
  const stale = !last || Date.now() - last.createdAt.getTime() > 36 * 3600_000;
  return (
    <>
      <PageHeader title="پشتیبان‌گیری و بازیابی" subtitle="هر پشتیبان شامل پایگاه داده و همه فایل‌های اسناد است."
        actions={<ActionButton action={createBackupAction} payload={{}} variant="primary" successMessage="پشتیبان تهیه شد." confirm={{ title: "تهیه پشتیبان دستی", body: "یک نسخه کامل از پایگاه داده و فایل‌های اسناد تهیه می‌شود. این کار ممکن است چند دقیقه طول بکشد." }} confirmLabel="تهیه پشتیبان"><DatabaseBackup />تهیه پشتیبان</ActionButton>} />
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Notice tone={stale ? "warning" : "success"} title="آخرین پشتیبان">{last ? `${formatJalali(last.createdAt, "datetime")} (${last.kind === "SCHEDULED" ? "خودکار" : "دستی"})` : "هنوز پشتیبانی تهیه نشده است."}{stale && last ? " — بیش از ۳۶ ساعت گذشته است؛ سرویس worker را بررسی کنید." : ""}</Notice>
        <Notice tone={lastOk ? "success" : "warning"} title="آخرین آزمون بازیابی موفق">{lastOk ? formatJalali(lastOk.verifiedAt, "datetime") : "هیچ پشتیبانی هنوز با بازیابی واقعی آزموده نشده است."}</Notice>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="panel min-w-0">
          {rows.length === 0 ? <EmptyState icon={<DatabaseBackup />} title="پشتیبانی موجود نیست" hint="پشتیبان خودکار هر شب توسط سرویس worker تهیه می‌شود." /> : (
            <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>فایل</th><th>نوع</th><th>حجم</th><th>تاریخ</th><th>تهیه‌کننده</th><th>وضعیت</th><th>عملیات</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}><td><span className="mono-code">{r.fileName}</span>{r.note && r.status !== "CREATED" && <details className="mt-1 text-xs text-ink-2"><summary className="cursor-pointer text-lapis">نتیجه آزمون</summary><pre className="mt-1 whitespace-pre-wrap font-sans leading-6">{r.note}</pre></details>}</td>
                  <td>{r.kind === "SCHEDULED" ? "خودکار" : "دستی"}</td><td className="num">{formatBytes(Number(r.size))}</td><td className="num">{formatJalali(r.createdAt, "datetime")}</td><td>{r.createdById ? names[r.createdById] : "سامانه"}</td>
                  <td><Seal tone={STATUS[r.status]?.tone} dot>{STATUS[r.status]?.label ?? r.status}</Seal></td>
                  <td>{r.status !== "PRUNED" && <div className="flex gap-1">
                    <ActionButton action={verifyBackupAction} payload={{ id: r.id }} size="sm" successMessage="آزمون بازیابی انجام شد؛ نتیجه را در ستون فایل ببینید."><ShieldCheck />آزمون بازیابی</ActionButton>
                    <LinkButton href={`/api/backups/${r.id}`} size="sm" variant="ghost" aria-label="دریافت"><Download /></LinkButton>
                  </div>}</td></tr>))}</tbody></table></div>
          )}
        </div>
        <Panel title="بازیابی کامل">
          <p className="text-sm leading-7 text-ink-2">«آزمون بازیابی» پشتیبان را در یک پایگاه داده موقت بازیابی و شمار رکوردها، ارتباط اسناد با پرونده‌ها و فایل‌ها را کنترل می‌کند؛ داده‌های جاری تغییری نمی‌کند.</p>
          <p className="mt-2 text-sm leading-7 text-ink-2">بازیابی واقعی (جایگزینی داده‌های جاری) عملیاتی حساس است و فقط از خط فرمان سرور مرکزی انجام می‌شود:</p>
          <pre className="ltr mt-2 overflow-x-auto rounded-md bg-night p-3 text-left text-xs leading-6 text-on-night">./scripts/restore.sh backups/daftar-…tar.gz</pre>
          <p className="mt-2 text-xs text-ink-3">راهنمای کامل در DEPLOYMENT.md</p>
        </Panel>
      </div>
    </>
  );
}
