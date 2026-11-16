import { AlarmClock, Calculator } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { LinkButton } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { FormDialog } from "@/components/ui/form-dialog";
import { EmptyState, LinkTabs, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { cn } from "@/lib/cn";
import { deadlineFields } from "@/lib/form-defs";
import { formatJalali, relativeDay } from "@/lib/jalali";
import { DEADLINE_SOURCE, DEADLINE_STATUS, DEADLINE_TYPE, PRIORITY } from "@/lib/labels";
import { OPT } from "@/lib/options";
import { faNum } from "@/lib/text";
import { userNames } from "@/server/access";
import { listDeadlines } from "@/server/deadlines";
import { createDeadlineAction, deadlineStatusAction, updateDeadlineAction, verifyDeadlineAction } from "./actions";

export const metadata = { title: "مهلت‌ها" };
type SP = { view?: string; type?: string; q?: string; page?: string; focus?: string };

export default async function DeadlinesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePagePerm("deadline.view");
  const sp = await searchParams;
  const view = sp.view ?? "open";
  const page = Math.max(1, Number(sp.page ?? 1));
  const { total, rows } = await listDeadlines(user, { ...sp, view, page, pageSize: 25 });
  const names = await userNames(rows.flatMap((r) => [r.assigneeId, r.verifiedById]));
  const now = new Date();
  const manage = can(user, "deadline.manage");
  const tabs = [{ key: "open", label: "همه مهلت‌های باز" }, { key: "mine", label: "مهلت‌های من" }, { key: "week", label: "هفت روز آینده" }, { key: "overdue", label: "معوق" }, { key: "unverified", label: "قانونیِ تأییدنشده" }, { key: "done", label: "بسته‌شده" }]
    .map((t) => ({ ...t, href: `/deadlines?view=${t.key}` }));
  return (
    <>
      <PageHeader title="مهلت‌ها و یادآورها" subtitle="یادآورها در پایگاه داده زمان‌بندی می‌شوند و بدون بازبودن مرورگر یا اتصال اینترنت اجرا می‌گردند."
        actions={manage && <>
          <LinkButton href="/deadlines/calculator"><Calculator />محاسبه مهلت قانونی</LinkButton>
          <FormDialog trigger="مهلت جدید" icon={<AlarmClock />} title="ثبت مهلت" size="lg" action={createDeadlineAction} successMessage="مهلت ثبت و یادآورها زمان‌بندی شد."
            fields={deadlineFields({ withCase: true })} initial={{ priority: "NORMAL", type: "FILING", reminderOffsets: ["4320", "1440", "120"] }} />
        </>} />
      <LinkTabs tabs={tabs} active={view} />
      <div className="panel">
        <FilterBar searchPlaceholder="عنوان مهلت…" filters={[{ name: "type", label: "نوع", options: OPT.deadlineType }]} />
        {rows.length === 0 ? <EmptyState icon={<AlarmClock />} title="مهلتی در این نما وجود ندارد" /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>سررسید</th><th>عنوان</th><th>نوع</th><th>پرونده</th><th>مسئول</th><th>وضعیت</th><th>اقدام</th></tr></thead>
              <tbody>
                {rows.map((d) => {
                  const late = d.status === "OPEN" && d.dueAt < now;
                  return (
                    <tr key={d.id} id={d.id} className={cn(sp.focus === d.id && "bg-firuze-50")}>
                      <td className="whitespace-nowrap"><span className={cn("num font-bold", late && "text-mohr")}>{formatJalali(d.dueAt, "date")}</span><span className="num block text-xs text-ink-3">{formatJalali(d.dueAt, "time")}{d.status === "OPEN" && ` · ${relativeDay(d.dueAt, now)}`}</span></td>
                      <td className="max-w-[340px]"><span className="font-medium">{d.title}</span> {d.priority !== "NORMAL" && <StatusSeal map={PRIORITY} value={d.priority} />}
                        {d.isLegal && <span className="mt-0.5 block text-xs text-ink-2">{d.verifiedAt ? <Seal tone="success">قانونی · تأیید {names[d.verifiedById ?? ""] ?? ""}</Seal> : <Seal tone="warning">قانونی · نیازمند تأیید</Seal>} {d.legalBasis}</span>}
                        {d.source !== "MANUAL" && <span className="block text-2xs text-ink-3">منبع: {DEADLINE_SOURCE[d.source]}</span>}</td>
                      <td>{DEADLINE_TYPE[d.type]}</td>
                      <td>{d.case ? <Link href={`/cases/${d.case.id}?tab=deadlines`} className="hover:text-lapis"><span className="mono-code">{d.case.number}</span><span className="block max-w-[180px] truncate text-xs text-ink-3">{d.case.title}</span></Link> : "—"}</td>
                      <td>{names[d.assigneeId] ?? "—"}</td>
                      <td>{late ? <Seal tone="danger" dot>معوق</Seal> : <StatusSeal map={DEADLINE_STATUS} value={d.status} />}</td>
                      <td><div className="flex flex-wrap gap-1">
                        {d.status === "OPEN" && <ActionButton action={deadlineStatusAction} payload={{ id: d.id, status: "DONE" }} size="sm" variant="accent" successMessage="انجام‌شده ثبت شد.">انجام شد</ActionButton>}
                        {d.status === "OPEN" && d.isLegal && !d.verifiedAt && can(user, "deadline.verify_legal") && <ActionButton action={verifyDeadlineAction} payload={{ id: d.id }} size="sm" successMessage="تأیید شد." confirm={{ title: "تأیید مهلت قانونی", body: `تاریخ ${formatJalali(d.dueAt, "long")} را با قانون حاکم، نوع ابلاغ و تعطیلات تطبیق داده‌ام و تأیید می‌کنم.` }}>تأیید قانونی</ActionButton>}
                        {d.status === "OPEN" && manage && <FormDialog trigger="ویرایش" triggerVariant="ghost" triggerSize="sm" title="ویرایش مهلت" size="lg" action={updateDeadlineAction} hidden={{ id: d.id }} successMessage="ذخیره شد." fields={deadlineFields({ assigneeLabel: names[d.assigneeId] })}
                          initial={{ title: d.title, type: d.type, priority: d.priority, dueDate: formatJalali(d.dueAt, "input"), dueTime: formatJalali(d.dueAt, "inputTime"), assigneeId: d.assigneeId, isLegal: d.isLegal, legalBasis: d.legalBasis ?? "", description: d.description ?? "", reminderOffsets: d.reminderOffsets.map(String) }} />}
                        {late && <ActionButton action={deadlineStatusAction} payload={{ id: d.id, status: "MISSED" }} size="sm" variant="danger" askNote="note" noteLabel="توضیح" confirm={{ title: "ثبت به‌عنوان مهلت ازدست‌رفته" }} successMessage="ثبت شد.">از دست رفت</ActionButton>}
                        {d.status === "OPEN" && !late && manage && <ActionButton action={deadlineStatusAction} payload={{ id: d.id, status: "CANCELLED" }} size="sm" variant="ghost" confirm={{ title: "لغو مهلت", body: "یادآورهای این مهلت نیز لغو می‌شود." }} successMessage="لغو شد.">لغو</ActionButton>}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={25} total={total} params={{ ...sp, view }} basePath="/deadlines" />
      </div>
      <p className="mt-3 text-xs text-ink-3">{faNum(total)} مورد · مهلت‌های قانونی تا تأیید کارمند مجاز قطعی تلقی نمی‌شوند.</p>
    </>
  );
}
