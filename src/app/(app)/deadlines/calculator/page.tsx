import { PageHeader } from "@/components/ui/page";
import { requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { caseScope } from "@/server/access";
import { DeadlineCalculator } from "./calc";

export const metadata = { title: "محاسبه مهلت قانونی" };

export default async function CalculatorPage({ searchParams }: { searchParams: Promise<{ caseId?: string }> }) {
  const user = await requirePagePerm("deadline.manage");
  const { caseId } = await searchParams;
  const [rules, c] = await Promise.all([
    db.deadlineRule.findMany({ where: { isActive: true }, orderBy: { title: "asc" } }),
    caseId ? db.case.findFirst({ where: { id: caseId, AND: [caseScope(user)] }, select: { id: true, title: true, number: true } }) : null,
  ]);
  return (
    <>
      <PageHeader title="محاسبه مهلت قانونی" crumbs={[{ label: "مهلت‌ها", href: "/deadlines" }, { label: "محاسبه‌گر" }]}
        subtitle="پیشنهاد موعد بر پایه تاریخ ابلاغ، قاعده انتخابی، جمعه‌ها و تعطیلات رسمی ثبت‌شده. نتیجه همیشه نیازمند تأیید انسانی است." />
      <DeadlineCalculator rules={rules} caseId={c?.id} caseLabel={c ? `${c.title} · ${c.number}` : undefined} />
    </>
  );
}
