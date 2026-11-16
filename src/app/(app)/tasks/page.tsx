import { ListChecks, ListPlus } from "lucide-react";
import Link from "next/link";
import { FilterBar } from "@/components/ui/filter-bar";
import { FormDialog } from "@/components/ui/form-dialog";
import { EmptyState, LinkTabs, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { StatusSeal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { cn } from "@/lib/cn";
import { taskFields } from "@/lib/form-defs";
import { formatJalali, relativeDay } from "@/lib/jalali";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { OPT } from "@/lib/options";
import { faNum } from "@/lib/text";
import { userNames } from "@/server/access";
import { listTasks } from "@/server/tasks";
import { createTaskAction } from "./actions";

export const metadata = { title: "وظایف" };
type SP = { q?: string; status?: string; priority?: string; view?: string; page?: string; new?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePagePerm("task.view");
  const sp = await searchParams;
  const view = sp.view ?? "mine";
  const page = Math.max(1, Number(sp.page ?? 1));
  const { total, rows } = await listTasks(user, { ...sp, view, page, pageSize: 20 });
  const names = await userNames(rows.flatMap((r) => [r.assigneeId, r.createdById]));
  const now = new Date();
  const tabs = [
    { key: "mine", label: "وظایف من" }, { key: "created", label: "ارجاع‌شده توسط من" }, { key: "review", label: "منتظر تأیید من" },
    { key: "overdue", label: "معوق" }, ...(can(user, "task.view_all") ? [{ key: "unassigned", label: "بدون مجری" }] : []), { key: "all", label: "همه" },
  ].map((t) => ({ ...t, href: `/tasks?view=${t.key}` }));
  return (
    <>
      <PageHeader title="وظایف" subtitle={`${faNum(total)} وظیفه در این نما`}
        actions={can(user, "task.create") && (
          <FormDialog trigger="وظیفه جدید" icon={<ListPlus />} title="وظیفه جدید" size="lg" action={createTaskAction} successMessage="وظیفه ثبت شد." defaultOpen={sp.new === "1"}
            fields={taskFields({ canAssign: can(user, "task.assign"), withCase: true })} initial={{ priority: "NORMAL" }} />
        )} />
      <LinkTabs tabs={tabs} active={view} />
      <div className="panel">
        <FilterBar searchPlaceholder="عنوان یا کد وظیفه…" filters={[
          { name: "status", label: "وضعیت", options: [...Object.entries(TASK_STATUS).map(([value, v]) => ({ value, label: v.label })), { value: "all", label: "همه وضعیت‌ها" }] },
          { name: "priority", label: "اولویت", options: OPT.priority },
        ]}><input type="hidden" name="view" value={view} /></FilterBar>
        {rows.length === 0 ? <EmptyState icon={<ListChecks />} title="وظیفه‌ای در این نما وجود ندارد" hint={view === "mine" ? "وظایف ارجاع‌شده به شما اینجا نمایش داده می‌شود." : undefined} /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>عنوان</th><th>کد</th><th>پرونده</th><th>مجری</th><th>ارجاع‌دهنده</th><th>مهلت</th><th>اولویت</th><th>وضعیت</th></tr></thead>
              <tbody>
                {rows.map((t) => {
                  const late = t.dueAt && t.dueAt < now && !["DONE", "CANCELLED"].includes(t.status);
                  return (
                    <tr key={t.id}>
                      <td className="max-w-[320px]"><Link href={`/tasks/${t.id}`} className="block truncate font-bold hover:text-lapis">{t.title}</Link>
                        {t.status === "IN_PROGRESS" && <div className="mt-1 h-1 w-28 rounded-full bg-line"><div className="h-full rounded-full bg-firuze" style={{ width: `${t.progress}%` }} /></div>}</td>
                      <td><span className="mono-code">{t.code}</span></td>
                      <td>{t.case ? <Link href={`/cases/${t.case.id}`} className="hover:text-lapis"><span className="mono-code">{t.case.number}</span></Link> : "—"}</td>
                      <td>{t.assigneeId ? names[t.assigneeId] ?? "—" : <span className="text-zafaran">بدون مجری</span>}</td>
                      <td className="text-ink-2">{names[t.createdById] ?? "—"}</td>
                      <td className={cn("num", late && "font-bold text-mohr")}>{t.dueAt ? <>{formatJalali(t.dueAt, "date")}<span className="block text-xs">{relativeDay(t.dueAt, now)}</span></> : "—"}</td>
                      <td><StatusSeal map={PRIORITY} value={t.priority} /></td>
                      <td><StatusSeal map={TASK_STATUS} value={t.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={20} total={total} params={{ ...sp, view }} basePath="/tasks" />
      </div>
    </>
  );
}
