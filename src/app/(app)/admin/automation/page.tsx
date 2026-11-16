import { Workflow } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { FormDialog } from "@/components/ui/form-dialog";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import type { FieldDef } from "@/components/ui/smart-form";
import { requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { OPT } from "@/lib/options";
import { faNum } from "@/lib/text";
import { userNames } from "@/server/access";
import { saveAutomationAction, toggleAutomationAction } from "../actions";

export const metadata = { title: "اتوماسیون" };
const TRIGGERS: Record<string, string> = { CASE_CREATED: "ایجاد پرونده", CORRESPONDENCE_REGISTERED: "ثبت مکاتبه" };
const ACTIONS: Record<string, string> = { ASSIGN_CASE: "ارجاع خودکار پرونده", CREATE_TASK: "ایجاد خودکار وظیفه" };

export default async function AutomationPage() {
  await requirePagePerm("automation.manage");
  const rules = await db.automationRule.findMany({ orderBy: { createdAt: "asc" } });
  const names = await userNames(rules.map((r) => (r.action as { userId?: string }).userId));
  const fields: FieldDef[] = [
    { name: "name", label: "نام قاعده", required: true, span: 2 },
    { name: "trigger", label: "رویداد", type: "select", required: true, options: Object.entries(TRIGGERS).map(([value, label]) => ({ value, label })) },
    { name: "actionType", label: "اقدام", type: "select", required: true, options: Object.entries(ACTIONS).map(([value, label]) => ({ value, label })) },
    { name: "category", label: "شرط: دسته پرونده", type: "select", options: OPT.caseCategory, showIf: { field: "trigger", equals: "CASE_CREATED" } },
    { name: "direction", label: "شرط: نوع مکاتبه", type: "select", options: [{ value: "INCOMING", label: "وارده" }, { value: "OUTGOING", label: "صادره" }, { value: "INTERNAL", label: "داخلی" }], showIf: { field: "trigger", equals: "CORRESPONDENCE_REGISTERED" } },
    { name: "priority", label: "شرط: اولویت", type: "select", options: OPT.priority },
    { name: "userId", label: "کارمند مقصد", type: "lookup", lookup: "user" },
    { name: "leastLoaded", label: "به‌جای کارمند ثابت، کم‌بارترین کارمند انتخاب شود", type: "checkbox", hint: "بر پایه تعداد وظایف باز" },
    { name: "taskTitle", label: "عنوان وظیفه", showIf: { field: "actionType", equals: "CREATE_TASK" } }, { name: "dueInDays", label: "مهلت وظیفه (روز)", type: "number", showIf: { field: "actionType", equals: "CREATE_TASK" } },
  ];
  return (
    <>
      <PageHeader title="قواعد اتوماسیون" subtitle="ارجاع و ایجاد وظیفه خودکار بر پایه قواعد قابل تنظیم. هر اجرا در تاریخچه ثبت می‌شود."
        actions={<FormDialog trigger="قاعده جدید" icon={<Workflow />} title="قاعده اتوماسیون" size="lg" action={saveAutomationAction} fields={fields} initial={{ trigger: "CASE_CREATED", actionType: "ASSIGN_CASE" }} successMessage="قاعده ذخیره شد." />} />
      <div className="panel">
        {rules.length === 0 ? <EmptyState icon={<Workflow />} title="قاعده‌ای تعریف نشده است" hint="مثلاً: هر پرونده «خانواده» به‌صورت خودکار به کم‌بارترین کارمند حقوقی ارجاع شود." /> : (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>نام</th><th>رویداد</th><th>شرط</th><th>اقدام</th><th>اجرا</th><th>وضعیت</th><th>عملیات</th></tr></thead>
            <tbody>{rules.map((r) => {
              const c = r.conditions as { category?: string; priority?: string; direction?: string }; const a = r.action as { type: string; userId?: string; leastLoaded?: boolean; taskTitle?: string };
              return (
                <tr key={r.id}><td className="font-bold">{r.name}</td><td>{TRIGGERS[r.trigger]}</td><td className="text-sm">{[c.category, c.direction, c.priority].filter(Boolean).join(" · ") || "بدون شرط"}</td>
                  <td className="text-sm">{ACTIONS[a.type]} ← {a.leastLoaded && !a.userId ? "کم‌بارترین کارمند" : names[a.userId ?? ""] ?? "—"}{a.taskTitle ? ` («${a.taskTitle}»)` : ""}</td>
                  <td className="num text-sm">{faNum(r.runCount)} بار{r.lastRunAt && <span className="block text-xs text-ink-3">{formatJalali(r.lastRunAt, "datetime")}</span>}</td>
                  <td>{r.enabled ? <Seal tone="success" dot>فعال</Seal> : <Seal dot>متوقف</Seal>}</td>
                  <td><div className="flex gap-1"><ActionButton action={toggleAutomationAction} payload={{ id: r.id, enabled: !r.enabled }} size="sm" successMessage="ذخیره شد.">{r.enabled ? "توقف" : "فعال‌سازی"}</ActionButton>
                    <ActionButton action={toggleAutomationAction} payload={{ id: r.id, remove: true }} size="sm" variant="danger" confirm={{ title: "حذف قاعده", body: `قاعده «${r.name}» حذف شود؟` }} successMessage="حذف شد.">حذف</ActionButton></div></td></tr>
              );
            })}</tbody></table></div>
        )}
      </div>
    </>
  );
}
