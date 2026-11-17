import Link from "next/link";
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
import { getOfficeUi } from "@/theme/prefs";
import { LAYOUT_IDS, LAYOUTS_META, SKIN_IDS, SKINS_META } from "@/theme/skins";
import { saveOfficeUiAction } from "./ui-actions";
import { addHolidayAction, removeHolidayAction, saveOfficeAction, saveRuleAction, verifyRuleAction } from "../actions";

export const metadata = { title: "تنظیمات دفتر" };

const DAY_MS = 86_400_000;
const PAST_HOLIDAY_DAYS = 30;
const DESCRIPTION_ROWS = 2;
// eslint-disable-next-line ts-patterns/no-magic-numbers -- FieldDef.span needs the literal type 2
const FULL = 2 as const;

export default async function SettingsPage() {
  const user = await requirePagePerm("settings.manage");
  const [office, officeUi, holidays, rules] = await Promise.all([getOffice(), getOfficeUi(), db.holiday.findMany({ orderBy: { date: "asc" }, where: { date: { gte: new Date(Date.now() - PAST_HOLIDAY_DAYS * DAY_MS) } } }), db.deadlineRule.findMany({ orderBy: { title: "asc" } })]);
  const linked = rules.filter((r) => r.lawCode && r.articleNos.length);
  const articles = linked.length
    ? await db.legalSource.findMany({ where: { OR: linked.map((r) => ({ lawCode: r.lawCode, articleNo: { in: r.articleNos } })) }, select: { id: true, lawCode: true, articleNo: true, title: true, text: true, verified: true, status: true } })
    : [];
  const articlesOf = (r: (typeof rules)[number]) => articles.filter((a) => a.lawCode === r.lawCode && r.articleNos.includes(a.articleNo ?? ""));
  const ruleFields = [{ name: "title", label: "عنوان", required: true, span: FULL }, { name: "days", label: "مدت (روز) — مقیم ایران", type: "number" as const, required: true }, { name: "monthsAbroad", label: "مدت (ماه) — مقیم خارج", type: "number" as const }, { name: "basis", label: "مستند قانونی", required: true, span: FULL }, { name: "description", label: "توضیح", type: "textarea" as const, rows: DESCRIPTION_ROWS }];
  return (
    <>
      <PageHeader title="تنظیمات دفتر" subtitle="مشخصات دفتر، ظاهر پیش‌فرض، تعطیلات رسمی و قواعد مهلت‌های قانونی" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="مشخصات دفتر">
          <SmartForm action={saveOfficeAction} submitLabel="ذخیره" successMessage="مشخصات دفتر ذخیره شد." initial={office as unknown as Record<string, unknown>}
            fields={[{ name: "officeName", label: "نام دفتر", required: true, span: FULL }, { name: "officeCode", label: "کد دفتر", ltr: true }, { name: "city", label: "شهر" }, { name: "phone", label: "تلفن", ltr: true }, { name: "letterheadNote", label: "زیرنویس سربرگ" }, { name: "address", label: "نشانی", span: FULL }]} />
        </Panel>
        <Panel title="ظاهر پیش‌فرض دفتر">
          <p className="mb-3 text-sm text-ink-2">برای صفحه ورود و کارمندانی که چیدمان یا پوسته را خودشان انتخاب نکرده‌اند. هر کاربر از منوی خود یا صفحه «حساب کاربری» می‌تواند ترکیب دلخواهش را برگزیند.</p>
          <SmartForm action={saveOfficeUiAction} submitLabel="ذخیره ظاهر پیش‌فرض" successMessage="ظاهر پیش‌فرض دفتر ذخیره شد." initial={officeUi as unknown as Record<string, unknown>}
            fields={[
              { name: "layout", label: "چیدمان", type: "select", required: true, options: LAYOUT_IDS.map((l) => ({ value: l, label: `${LAYOUTS_META[l].label} — ${LAYOUTS_META[l].hint}` })) },
              { name: "skin", label: "پوسته", type: "select", required: true, options: SKIN_IDS.map((s) => ({ value: s, label: `${SKINS_META[s].label} — ${SKINS_META[s].hint}` })) },
              { name: "chartTimeAxis", label: "جهت محور زمان نمودارها", type: "select", required: true, span: FULL, hint: "راست‌به‌چپ: زمان مانند جهت خواندن فارسی از راست به چپ پیش می‌رود.", options: [{ value: "rtl", label: "راست به چپ (پیش‌فرض)" }, { value: "ltr", label: "چپ به راست" }] },
            ]} />
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
                <td className="num whitespace-nowrap">{faNum(r.days)} روز{r.monthsAbroad ? ` / ${faNum(r.monthsAbroad)} ماه` : ""}</td><td className="max-w-sm text-sm">{r.basis}
                  {articlesOf(r).map((a) => (
                    <details key={a.id} className="mt-1 rounded border border-line bg-surface-2 px-2 py-1 text-xs" data-testid="rule-article">
                      <summary className="cursor-pointer text-lapis">متن {a.title} {a.verified ? "(تأییدشده)" : "(تأییدنشده)"}</summary>
                      <p className="mt-1 whitespace-pre-line leading-6 text-ink-2">{a.text}</p>
                      <Link className="text-lapis underline" href={`/research/library/${a.id}`}>باز کردن در کتابخانه</Link>
                    </details>
                  ))}
                </td>
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
