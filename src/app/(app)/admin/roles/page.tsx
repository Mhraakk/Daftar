import Link from "next/link";
import { FormDialog } from "@/components/ui/form-dialog";
import { Notice, PageHeader, Panel } from "@/components/ui/page";
import { requirePagePerm } from "@/lib/auth/guard";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { faNum } from "@/lib/text";
import { createRoleAction } from "../actions";
import { PermissionMatrix } from "./matrix";

export const metadata = { title: "نقش‌ها و مجوزها" };

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  await requirePagePerm("role.manage");
  const sp = await searchParams;
  const [roles, perms] = await Promise.all([
    db.role.findMany({ include: { permissions: true, _count: { select: { users: true } } }, orderBy: { createdAt: "asc" } }),
    db.permission.findMany(),
  ]);
  const role = roles.find((r) => r.id === sp.role) ?? roles.find((r) => r.key !== "admin") ?? roles[0];
  const order = [...new Set(perms.map((p) => p.group))];
  const groups = order.map((group) => ({ group, items: perms.filter((p) => p.group === group).map((p) => ({ key: p.key, label: p.label })) }));
  return (
    <>
      <PageHeader title="نقش‌ها و مجوزها" subtitle="مجوزها بدون تغییر کد قابل تنظیم‌اند و در سمت سرور اعمال می‌شوند."
        actions={<FormDialog trigger="نقش جدید" title="ایجاد نقش" size="sm" cols={1} action={createRoleAction} successMessage="نقش ایجاد شد."
          fields={[{ name: "name", label: "نام نقش", required: true }, { name: "description", label: "توضیح" }, { name: "copyFromId", label: "رونوشت مجوزها از", type: "select", options: roles.filter((r) => r.key !== "admin").map((r) => ({ value: r.id, label: r.name })) }]} />} />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <nav className="panel h-fit p-2" aria-label="نقش‌ها"><ul className="flex flex-col gap-1">{roles.map((r) => (
          <li key={r.id}><Link href={`/admin/roles?role=${r.id}`} className={cn("block rounded-md px-3 py-2", r.id === role.id ? "bg-firuze-50 font-bold text-firuze" : "hover:bg-surface-2")}>
            {r.name}<span className="block text-xs font-normal text-ink-3">{faNum(r._count.users)} کاربر · {faNum(r.permissions.length)} مجوز</span></Link></li>))}</ul></nav>
        <Panel title={`مجوزهای نقش «${role.name}»`}>
          {role.description && <p className="mb-3 text-sm text-ink-2">{role.description}</p>}
          {role.key === "admin" && <div className="mb-3"><Notice tone="info">نقش مدیر سامانه همواره همه مجوزها را دارد و قابل تغییر نیست.</Notice></div>}
          <PermissionMatrix key={role.id} roleId={role.id} roleName={role.name} locked={role.key === "admin"} groups={groups} initial={role.permissions.map((p) => p.permissionKey)} />
        </Panel>
      </div>
    </>
  );
}
