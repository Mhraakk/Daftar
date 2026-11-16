import { Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { FormDialog } from "@/components/ui/form-dialog";
import { Notice, PageHeader, Panel } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { SmartForm } from "@/components/ui/smart-form";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatDateOnly } from "@/lib/jalali";
import { faNum } from "@/lib/text";
import { getOffice } from "@/server/admin";
import { addHolidayAction, removeHolidayAction, saveOfficeAction, saveRuleAction, verifyRuleAction } from "../actions";

export const metadata = { title: "تنظیمات دفتر" };

export default async function SettingsPage() {
  const user = await requirePagePerm("settings.manage");
  const [office, holidays, rules] = await Promise.all([getOffice(), db.holiday.findMany({ orderBy: { date: "asc" }, where: { date: { gte: new Date(Date.now() - 30 * 86_400_000) } } }), db.deadlineRule.findMany({ orderBy: { title: "asc" } })]);
  const ruleFields = [{ name: "title", label: "عنوان", required: true, span: 2 as const }, { name: "days", label: "مدت (روز) — مقیم ایران", type: "number" as const, required: true }, { name: "monthsAbroad", label: "مدت (ماه) — مقیم خارج", type: "number" as const }, { name: "basis", label: "مستند قانونی", required: true, span: 2 as const }, { name: "description", label: "توضیح", type: "textarea" as const, rows: 2 }];
  return (
    <>
      <PageHeader title="تنظیمات دفتر" subtitle="مشخصات دفتر، تعطیلات رسمی و قواعد مهلت‌های قانونی" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="مشخصات دفتر">
          <SmartForm action={saveOfficeAction} submitLabel="ذخیره" successMessage="مشخصات دفتر ذخیره شد." initial={office as unknown as Record<string, unknown>}
            fields={[{ name: "officeName", label: "نام دفتر", required: true, span: 2 }, { name: "officeCode", label: "کد دفتر", ltr: true }, { name: "city", label: "شهر" }, { name: "phone", label: "تلفن", ltr: true }, { name: "letterheadNote", label: "زیرنویس سربرگ" }, { name: "address", label: "نشانی", span: 2 }]} />
        </Panel>
        <Panel title={`تعطیلات رسمی (${faNum(holidays.length)})`} action={<FormDialog trigger="افزودن تعطیلی" triggerVariant="secondary" triggerSize="sm" title="افزودن تعطیلی رسمی" size="sm" cols={1} action={addHolidayAction} successMessage="افزوده شد."
          fields={[{ name: "date", label: "تاریخ", type: "jdate", required: true }, { name: "title", label: "عنوان", required: true, placeholder: "مثلاً عید نوروز" }]} />}>
          <Notice tone="info">جمعه‌ها خودکار تعطیل محسوب می‌شوند. تعطیلات رسمی و غیرمترقبه را اینجا ثبت کنید تا در محاسبه مهلت‌های قانونی لحاظ شوند.</Notice>
          {holidays.length === 0 ? <p className="mt-3 text-sm text-ink-3">تعطیلی‌ای ثبت نشده است.</p> : (
            <ul className="mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto">{holidays.map((h) => (
              <li key={h.date.toISOString()} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-surface-2"><span><span className="num font-medium">{formatDateOnly(h.date)}</span> — {h.title}</span>
                <ActionButton action={removeHolidayAction} payload={{ date: h.date.toISOString() }} size="icon" variant="ghost" aria-label="حذف" successMessage="حذف شد."><Trash2 /></ActionButton></li>))}</ul>
          )}
        </Panel>
        <Panel title="قواعد مهلت‌های قانونی" className="xl:col-span-2" bodyClass="p-0" action={<FormDialog trigger="قاعده جدید" triggerVariant="secondary" triggerSize="sm" title="قاعده مهلت جدید" action={saveRuleAction} successMessage="قاعده ثبت شد (تأییدنشده)." fields={ruleFields} />}>
          <div className="border-b border-line p-3"><Notice tone="warning" title="مسئولیت تطبیق با متن قانون">قواعد پیش‌فرض، پیشنهاد اولیه هستند. مسئول حقوقی دفتر باید هر قاعده را با متن رسمی و معتبر قانون تطبیق دهد و سپس «تأیید» کند. هر ویرایش، تأیید قبلی را باطل می‌کند.</Notice></div>
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>عنوان</th><th>مدت</th><th>مستند</th><th>وضعیت</th><th>عملیات</th></tr></thead>
            <tbody>{rules.map((r) => (
              <tr key={r.id}><td className="font-medium">{r.title}<span className="block max-w-md text-xs text-ink-3">{r.description}</span></td>
                <td className="num whitespace-nowrap">{faNum(r.days)} روز{r.monthsAbroad ? ` / ${faNum(r.monthsAbroad)} ماه` : ""}</td><td className="max-w-xs text-sm">{r.basis}</td>
                <td>{r.verified ? <Seal tone="success" dot>تأییدشده</Seal> : <Seal tone="warning" dot>تأییدنشده</Seal>}</td>
                <td><div className="flex gap-1">
                  {can(user, "deadline.verify_legal") && (r.verified
                    ? <ActionButton action={verifyRuleAction} payload={{ id: r.id, verified: false }} size="sm" variant="ghost" successMessage="تأیید لغو شد.">لغو تأیید</ActionButton>
                    : <ActionButton action={verifyRuleAction} payload={{ id: r.id, verified: true }} size="sm" variant="accent" confirm={{ title: "تأیید قاعده", body: `مدت و مستند قاعده «${r.title}» را با متن رسمی قانون تطبیق داده‌ام و صحت آن را تأیید می‌کنم.` }} successMessage="قاعده تأیید شد.">تأیید</ActionButton>)}
                  <FormDialog trigger="ویرایش" triggerVariant="ghost" triggerSize="sm" title="ویرایش قاعده" action={saveRuleAction} hidden={{ id: r.id }} successMessage="ذخیره شد." fields={ruleFields}
                    initial={{ title: r.title, days: r.days, monthsAbroad: r.monthsAbroad ?? "", basis: r.basis, description: r.description ?? "" }} />
                </div></td></tr>))}</tbody></table></div>
        </Panel>
      </div>
    </>
  );
}
