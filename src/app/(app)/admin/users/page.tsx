import { Building2, KeyRound, Pencil, UserPlus } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { FilterBar } from "@/components/ui/filter-bar";
import { FormDialog } from "@/components/ui/form-dialog";
import { EmptyState, PageHeader, Panel } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import type { FieldDef } from "@/components/ui/smart-form";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { faNum } from "@/lib/text";
import { createUserAction, resetPasswordAction, saveDepartmentAction, updateUserAction, userActiveAction } from "../actions";

export const metadata = { title: "کارمندان" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; state?: string }> }) {
  const me = await requirePagePerm("user.manage");
  const sp = await searchParams;
  const [users, roles, depts] = await Promise.all([
    db.user.findMany({
      where: { ...(sp.q ? { OR: [{ fullName: { contains: sp.q, mode: "insensitive" } }, { username: { contains: sp.q, mode: "insensitive" } }] } : {}), ...(sp.role ? { roleId: sp.role } : {}), ...(sp.state === "inactive" ? { isActive: false } : sp.state === "all" ? {} : { isActive: true }) },
      include: { role: true, department: true }, orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
    }),
    db.role.findMany({ orderBy: { createdAt: "asc" } }),
    db.department.findMany({ include: { _count: { select: { users: true } }, manager: { select: { fullName: true } } }, orderBy: { name: "asc" } }),
  ]);
  const roleOpts = roles.filter((r) => r.key !== "admin" || me.roleKey === "admin").map((r) => ({ value: r.id, label: r.name }));
  const deptOpts = depts.map((d) => ({ value: d.id, label: d.name }));
  const fields = (isNew: boolean): FieldDef[] => [
    { name: "fullName", label: "نام و نام خانوادگی", required: true, autoFocus: true }, { name: "username", label: "نام کاربری", required: true, ltr: true, hint: "حروف لاتین کوچک" },
    { name: "roleId", label: "نقش", type: "select", required: true, options: roleOpts }, { name: "departmentId", label: "واحد", type: "select", options: deptOpts },
    { name: "title", label: "سمت" }, { name: "nationalId", label: "کد ملی", ltr: true }, { name: "phone", label: "تلفن همراه", ltr: true }, { name: "email", label: "ایمیل", ltr: true },
    ...(isNew ? [{ name: "password", label: "رمز عبور اولیه", type: "password" as const, required: true, hint: "کاربر در نخستین ورود باید آن را تغییر دهد." }] : []),
  ];
  return (
    <>
      <PageHeader title="کارمندان" subtitle={`${faNum(users.length)} حساب کاربری`}
        actions={<FormDialog trigger="کارمند جدید" icon={<UserPlus />} title="ایجاد حساب کارمند" size="lg" action={createUserAction} fields={fields(true)} successMessage="حساب کاربری ایجاد شد." />} />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="panel min-w-0">
          <FilterBar searchPlaceholder="نام یا نام کاربری…" filters={[{ name: "role", label: "نقش", options: roles.map((r) => ({ value: r.id, label: r.name })) }, { name: "state", label: "وضعیت", options: [{ value: "inactive", label: "غیرفعال" }, { value: "all", label: "همه" }] }]} />
          {users.length === 0 ? <EmptyState title="کاربری یافت نشد" /> : (
            <div className="overflow-x-auto"><table className="tbl">
              <thead><tr><th>نام</th><th>نام کاربری</th><th>نقش</th><th>واحد</th><th>آخرین ورود</th><th>وضعیت</th><th>عملیات</th></tr></thead>
              <tbody>{users.map((u) => {
                const locked = u.role.key === "admin" && me.roleKey !== "admin";
                return (
                  <tr key={u.id}>
                    <td><span className="font-bold">{u.fullName}</span><span className="block text-xs text-ink-3">{u.title}</span></td><td><span className="mono-code">{u.username}</span></td><td>{u.role.name}</td><td>{u.department?.name ?? "—"}</td>
                    <td className="num text-ink-2">{u.lastLoginAt ? formatJalali(u.lastLoginAt, "datetime") : "هرگز"}</td>
                    <td>{u.isActive ? (u.lockedUntil && u.lockedUntil > new Date() ? <Seal tone="warning" dot>قفل موقت</Seal> : <Seal tone="success" dot>فعال</Seal>) : <Seal tone="danger" dot>غیرفعال</Seal>}{u.mustChangePassword && <Seal>رمز اولیه</Seal>}</td>
                    <td>{!locked && <div className="flex gap-1">
                      <FormDialog trigger="ویرایش" triggerVariant="ghost" triggerSize="sm" icon={<Pencil />} title={`ویرایش ${u.fullName}`} size="lg" action={updateUserAction} hidden={{ id: u.id }} fields={fields(false)} successMessage="ذخیره شد."
                        initial={{ ...u, departmentId: u.departmentId ?? "", title: u.title ?? "", nationalId: u.nationalId ?? "", phone: u.phone ?? "", email: u.email ?? "" } as Record<string, unknown>} />
                      <FormDialog trigger="رمز" triggerVariant="ghost" triggerSize="sm" icon={<KeyRound />} title={`بازنشانی رمز ${u.fullName}`} size="sm" cols={1} action={resetPasswordAction} hidden={{ id: u.id }} successMessage="رمز بازنشانی شد؛ نشست‌های کاربر بسته شد."
                        description="کاربر در ورود بعدی باید رمز را تغییر دهد." fields={[{ name: "password", label: "رمز عبور جدید", type: "password", required: true }]} />
                      {u.id !== me.id && (u.isActive
                        ? <ActionButton action={userActiveAction} payload={{ id: u.id, active: false }} size="sm" variant="danger" confirm={{ title: "غیرفعال‌سازی حساب", body: `دسترسی «${u.fullName}» بلافاصله قطع و همه نشست‌های او بسته می‌شود. سوابق کاری او حفظ می‌شود.` }} successMessage="حساب غیرفعال شد.">غیرفعال</ActionButton>
                        : <ActionButton action={userActiveAction} payload={{ id: u.id, active: true }} size="sm" successMessage="حساب فعال شد.">فعال‌سازی</ActionButton>)}
                    </div>}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </div>
        <Panel title="واحدها" icon={<Building2 />} action={can(me, "department.manage") && <FormDialog trigger="واحد جدید" triggerVariant="ghost" triggerSize="sm" title="واحد جدید" size="sm" cols={1} action={saveDepartmentAction} successMessage="واحد ایجاد شد."
          fields={[{ name: "name", label: "نام واحد", required: true }, { name: "managerId", label: "مدیر واحد", type: "lookup", lookup: "user" }]} />}>
          <ul className="flex flex-col gap-2">{depts.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
              <span><span className="font-medium">{d.name}</span><span className="block text-xs text-ink-3">{faNum(d._count.users)} نفر{d.manager ? ` · مدیر: ${d.manager.fullName}` : ""}</span></span>
              {can(me, "department.manage") && <FormDialog trigger="ویرایش" triggerVariant="ghost" triggerSize="sm" title="ویرایش واحد" size="sm" cols={1} action={saveDepartmentAction} hidden={{ id: d.id }} successMessage="ذخیره شد."
                fields={[{ name: "name", label: "نام واحد", required: true }, { name: "managerId", label: "مدیر واحد", type: "lookup", lookup: "user", lookupLabel: d.manager?.fullName }]} initial={{ name: d.name, managerId: d.managerId ?? "" }} />}
            </li>))}</ul>
        </Panel>
      </div>
    </>
  );
}
