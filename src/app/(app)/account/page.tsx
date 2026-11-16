import { DL, Notice, PageHeader, Panel } from "@/components/ui/page";
import { SmartForm } from "@/components/ui/smart-form";
import { requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { changePasswordAction } from "./actions";

export const metadata = { title: "حساب کاربری" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const user = await requireUser();
  const { first } = await searchParams;
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { lastLoginAt: true, createdAt: true, email: true, phone: true } });
  const sessions = await db.session.count({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } } });
  return (
    <>
      <PageHeader title="حساب کاربری" subtitle="مشخصات شما و تغییر رمز عبور" />
      {(first || user.mustChangePassword) && (
        <div className="mb-4"><Notice tone="warning" title="تغییر رمز عبور الزامی است">برای ادامه کار با سامانه، رمز عبور اولیه خود را تغییر دهید.</Notice></div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="مشخصات">
          <DL items={[
            { label: "نام و نام خانوادگی", value: user.fullName }, { label: "نام کاربری", value: <span className="ltr">{user.username}</span> },
            { label: "نقش", value: user.roleName }, { label: "واحد", value: user.departmentName }, { label: "سمت", value: user.title },
            { label: "تلفن همراه", value: row.phone && <span className="ltr">{row.phone}</span> },
            { label: "آخرین ورود", value: formatJalali(row.lastLoginAt, "datetime") }, { label: "نشست‌های فعال", value: sessions },
          ]} />
          <p className="mt-4 border-t border-line pt-3 text-xs text-ink-3">تغییر مشخصات و نقش فقط توسط مدیر سامانه انجام می‌شود.</p>
        </Panel>
        <Panel title="تغییر رمز عبور">
          <SmartForm cols={1} action={changePasswordAction} submitLabel="تغییر رمز عبور" successMessage="رمز عبور تغییر کرد." successHref="/"
            fields={[
              { name: "current", label: "رمز عبور فعلی", type: "password", required: true },
              { name: "next", label: "رمز عبور جدید", type: "password", required: true, hint: "دست‌کم ۸ نویسه، شامل حرف و رقم" },
              { name: "confirm", label: "تکرار رمز جدید", type: "password", required: true },
            ]} />
        </Panel>
      </div>
    </>
  );
}
