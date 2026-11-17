// اتصال‌های بیرونی دفتر: اعلان در پیام‌رسان (Bot API بله/تلگرام) و ورود متن از منابع حقوقی رسمی (فهرست سفید دامنه‌ها).
// هر دو پیش‌فرض خاموش‌اند؛ خطای آن‌ها فقط در وضعیت اتصال ثبت می‌شود و کار سامانه را متوقف نمی‌کند.
import { BellRing, Globe, Info, Send } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { DL, Notice, PageHeader, Panel } from "@/components/ui/page";
import { StatusSeal } from "@/components/ui/seal";
import { SmartForm } from "@/components/ui/smart-form";
import { requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { CONNECTOR_STATUS } from "@/lib/labels";
import { faNum } from "@/lib/text";
import { getConnector, legalWebConfig, messengerConfig, PUSHABLE_TYPES } from "@/server/connectors";
import { saveLegalWebAction, saveMessengerAction, testMessengerAction } from "./actions";

export const metadata = { title: "اتصال‌های بیرونی" };

const DOMAIN_ROWS = 4;
const MS_PER_HOUR = 3_600_000;
const PUSH_WINDOW_HOURS = 24;

function StatusLine({ status, lastSyncAt, lastError }: { status: string; lastSyncAt: Date | null; lastError: string | null }) {
  return (
    <div className="mb-4 flex flex-col gap-2">
      <DL items={[
        { label: "وضعیت", value: <StatusSeal map={CONNECTOR_STATUS} value={status} /> },
        { label: "آخرین ارتباط موفق", value: lastSyncAt && formatJalali(lastSyncAt, "datetime") },
      ]} />
      {lastError && <p className="rounded-ctl bg-mohr-50 px-3 py-2 text-sm text-mohr">آخرین خطا: <span className="ltr inline-block">{lastError}</span></p>}
    </div>
  );
}

export default async function ConnectorsPage() {
  await requirePagePerm("connector.manage");
  const [messenger, legalWeb] = await Promise.all([getConnector("messenger_bot"), getConnector("legal_web")]);
  const mcfg = messengerConfig(messenger.config);
  const wcfg = legalWebConfig(legalWeb.config);
  const since = new Date(Date.now() - PUSH_WINDOW_HOURS * MS_PER_HOUR);
  const [linked, pending] = await Promise.all([
    db.user.count({ where: { isActive: true, messengerChatId: { not: null } } }),
    db.notification.count({ where: { pushedAt: null, type: { in: mcfg.types }, createdAt: { gte: since }, user: { messengerChatId: { not: null } } } }),
  ]);
  return (
    <>
      <PageHeader title="اتصال‌های بیرونی" subtitle="هر اتصال جداگانه روشن می‌شود و بدون اطلاعات دسترسی معتبر دفتر کار نمی‌کند. همه تغییرات در تاریخچه فعالیت‌ها ثبت می‌شود." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="اعلان در پیام‌رسان" icon={<BellRing />}
          action={messenger.secretEnc && <ActionButton action={testMessengerAction} payload={{}} size="sm" variant="secondary" successMessage="پیام آزمایشی ارسال شد."><Send />پیام آزمایشی به من</ActionButton>}>
          <StatusLine status={messenger.status} lastSyncAt={messenger.lastSyncAt} lastError={messenger.lastError} />
          <p className="mb-4 text-sm leading-7 text-ink-2">
            اعلان‌های انتخاب‌شده با Bot API سازگار با تلگرام (پیام‌رسان «بله» یا تلگرام) برای کاربرانی فرستاده می‌شود که حساب خود را در «حساب کاربری» وصل کرده‌اند
            ({faNum(linked)} کاربر). {pending > 0 && `${faNum(pending)} اعلان در صف ارسال است.`}
          </p>
          <SmartForm cols={1} action={saveMessengerAction} submitLabel="ذخیره تنظیمات پیام‌رسان" successMessage="تنظیمات پیام‌رسان ذخیره شد."
            initial={{ enabled: messenger.enabled, baseUrl: mcfg.baseUrl || "https://tapi.bale.ai", token: "", minimal: mcfg.minimal, types: mcfg.types }}
            fields={[
              { name: "enabled", label: "ارسال اعلان به پیام‌رسان فعال باشد", type: "checkbox" },
              { name: "baseUrl", label: "نشانی Bot API", ltr: true, required: true, hint: "بله: https://tapi.bale.ai — تلگرام: https://api.telegram.org" },
              { name: "token", label: "توکن ربات", type: "password", ltr: true, hint: messenger.secretEnc ? "توکن فعلی رمزنگاری‌شده ذخیره است؛ برای حفظ آن خالی بگذارید." : "توکنی که سازنده ربات (BotFather) داده است." },
              { name: "minimal", label: "پیام حداقلی (بدون عنوان پرونده و جزئیات؛ فقط اطلاع وجود مورد تازه)", type: "checkbox" },
              { name: "types", label: "اعلان‌های قابل ارسال", type: "multicheck", options: Object.entries(PUSHABLE_TYPES).map(([value, label]) => ({ value, label })) },
            ]} />
        </Panel>
        <Panel title="منابع حقوقی رسمی (ورود متن از وب)" icon={<Globe />}>
          <StatusLine status={legalWeb.status} lastSyncAt={legalWeb.lastSyncAt} lastError={legalWeb.lastError} />
          <p className="mb-4 text-sm leading-7 text-ink-2">
            در «پژوهش و منابع» متن یک صفحه از دامنه‌های مجاز به کتابخانه حقوقی وارد می‌شود؛ با تاریخ بازیابی و وضعیت «تأییدنشده» تا مسئول حقوقی آن را تطبیق دهد.
            نشانی‌های داخلی شبکه هرگز پذیرفته نمی‌شوند.
          </p>
          <SmartForm cols={1} action={saveLegalWebAction} submitLabel="ذخیره فهرست دامنه‌ها" successMessage="فهرست منابع مجاز ذخیره شد."
            initial={{ enabled: legalWeb.enabled, domains: wcfg.domains.join("\n") }}
            fields={[
              { name: "enabled", label: "ورود متن از منابع رسمی فعال باشد", type: "checkbox" },
              { name: "domains", label: "دامنه‌های مجاز", type: "textarea", rows: DOMAIN_ROWS, placeholder: "rc.majlis.ir\nqavanin.ir", hint: "هر دامنه در یک سطر؛ زیردامنه‌ها هم پذیرفته می‌شوند. بدون http و مسیر." },
            ]} />
        </Panel>
      </div>
      <div className="mt-4">
        <Notice tone="info" title="اتصال‌های دیگر">
          <span className="inline-flex items-start gap-1.5"><Info className="mt-1 size-4 shrink-0" aria-hidden />اتصال به Google Drive، Gmail و Google Calendar در این نسخه پیاده‌سازی نشده است و در سامانه وجود ندارد.</span>
        </Notice>
      </div>
    </>
  );
}
