import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { History } from "lucide-react";
import { EmptyState, LinkTabs, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { Seal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { faNum } from "@/lib/text";
import { userNames } from "@/server/access";

export const metadata = { title: "اجراهای مهارت" };

const PAGE_SIZE = 20;
const RUN_STATUS: Record<string, { label: string; tone: "info" | "accent" | "success" | "danger" | "neutral" }> = {
  QUEUED: { label: "در صف", tone: "info" }, RUNNING: { label: "در حال اجرا", tone: "accent" }, DONE: { label: "آماده", tone: "success" },
  FAILED: { label: "ناموفق", tone: "danger" }, CANCELED: { label: "لغوشده", tone: "neutral" },
};
const REVIEW: Record<string, { label: string; tone: "warning" | "success" | "danger" }> = {
  PENDING_REVIEW: { label: "در انتظار بررسی", tone: "warning" }, APPROVED: { label: "تأییدشده", tone: "success" }, REJECTED: { label: "ردشده", tone: "danger" },
};

export default async function SkillRunsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePerm("skill.run");
  const sp = await searchParams;
  const reviewer = can(user, "draft.review");
  const admin = can(user, "ai.configure");
  const allowed: Record<string, boolean> = { review: reviewer, all: admin };
  const view = sp.view && allowed[sp.view] ? sp.view : "mine";
  const page = Math.max(1, Number(sp.page) || 1);
  const VIEWS: Record<string, Prisma.SkillRunWhereInput> = {
    mine: { userId: user.id },
    review: { status: "DONE", reviewStatus: "PENDING_REVIEW", userId: { not: user.id } },
    all: {},
  };
  const where = VIEWS[view];
  const [rows, total, pending] = await Promise.all([
    db.skillRun.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { skill: { select: { slug: true, titleFa: true, name: true } }, case: { select: { id: true, number: true } } } }),
    db.skillRun.count({ where }),
    reviewer ? db.skillRun.count({ where: VIEWS.review }) : Promise.resolve(0),
  ]);
  const names = await userNames(rows.map((r) => r.userId));
  return (
    <>
      <PageHeader title="اجراهای مهارت" crumbs={[{ label: "مهارت‌های حقوقی", href: "/skills" }, { label: "اجراها" }]} />
      <LinkTabs active={view} tabs={[
        { key: "mine", label: "اجراهای من", href: "/skills/runs" },
        ...(reviewer ? [{ key: "review", label: "در انتظار بررسی من", href: "/skills/runs?view=review", count: faNum(pending) }] : []),
        ...(admin ? [{ key: "all", label: "همه اجراها", href: "/skills/runs?view=all" }] : []),
      ]} />
      {rows.length === 0 ? <div className="mt-4"><EmptyState icon={<History />} title="اجرایی یافت نشد" hint="از صفحه مهارت‌های حقوقی یک مهارت را اجرا کنید." /></div> : (
        <div className="panel mt-4 overflow-x-auto"><table className="tbl"><thead><tr><th>عنوان</th><th>مهارت</th><th>پرونده</th><th>آغازکننده</th><th>زمان</th><th>وضعیت</th><th>بررسی</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td className="max-w-sm"><Link href={`/skills/runs/${r.id}`} className="font-medium text-lapis hover:underline">{r.title}</Link></td>
              <td className="text-sm">{r.skill.titleFa ?? r.skill.name}</td>
              <td className="text-sm">{r.case ? <Link className="hover:underline" href={`/cases/${r.case.id}`}>{r.case.number}</Link> : "—"}</td>
              <td className="whitespace-nowrap text-sm">{names[r.userId] ?? "—"}</td>
              <td className="num whitespace-nowrap text-sm">{formatJalali(r.createdAt, "datetime")}</td>
              <td><Seal tone={RUN_STATUS[r.status]?.tone ?? "neutral"} dot>{RUN_STATUS[r.status]?.label ?? r.status}</Seal></td>
              <td>{r.status === "DONE" ? <Seal tone={REVIEW[r.reviewStatus]?.tone ?? "warning"}>{REVIEW[r.reviewStatus]?.label ?? r.reviewStatus}</Seal> : "—"}</td>
            </tr>))}</tbody></table></div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={{ ...sp, view: view === "mine" ? undefined : view }} basePath="/skills/runs" />
    </>
  );
}
