import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NAV } from "@/components/shell/nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { ToastProvider } from "@/components/ui/toast";
import { requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const path = (await headers()).get("x-pathname") ?? "";
  if (user.mustChangePassword && !path.startsWith("/account")) redirect("/account?first=1");

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || user.permissions.has(i.perm)) })).filter((g) => g.items.length);
  const now = new Date();
  const [cartable, tasks, messages, deadlines, reviews] = await Promise.all([
    db.referral.count({ where: { toUserId: user.id, status: "PENDING" } }),
    db.task.count({ where: { assigneeId: user.id, status: { in: ["TODO", "REJECTED"] } } }),
    db.messageRecipient.count({ where: { userId: user.id, readAt: null, archivedAt: null } }),
    db.deadline.count({ where: { assigneeId: user.id, status: "OPEN", dueAt: { lt: now } } }),
    db.legalDraft.count({ where: { reviewerId: user.id, status: "IN_REVIEW" } }),
  ]);

  return (
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-[200] focus:rounded focus:bg-lapis focus:px-3 focus:py-2 focus:text-white">پرش به محتوا</a>
      <Sidebar groups={groups} badges={{ cartable, tasks, messages, deadlines, reviews }} />
      <div className="lg:ps-[248px]">
        <Topbar user={{ fullName: user.fullName, roleName: user.roleName, departmentName: user.departmentName }} today={formatJalali(now, "long")} />
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-5 lg:px-6">{children}</main>
      </div>
    </ToastProvider>
  );
}
