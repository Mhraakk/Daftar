import { PageHeader, Panel } from "@/components/ui/page";
import { SmartForm } from "@/components/ui/smart-form";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { sendMessageAction } from "../actions";

export const metadata = { title: "پیام جدید" };

export default async function NewMessagePage({ searchParams }: { searchParams: Promise<{ to?: string; re?: string; parent?: string }> }) {
  const user = await requirePagePerm("message.send");
  const sp = await searchParams;
  const staff = await db.user.findMany({ where: { isActive: true, NOT: { id: user.id } }, select: { id: true, fullName: true, department: { select: { name: true } } }, orderBy: { fullName: "asc" } });
  const ann = can(user, "announcement.send");
  return (
    <>
      <PageHeader title={ann ? "پیام / اطلاعیه جدید" : "پیام جدید"} crumbs={[{ label: "پیام‌ها", href: "/messages" }, { label: "جدید" }]} />
      <Panel className="max-w-3xl">
        <SmartForm cols={1} action={sendMessageAction} hidden={{ parentId: sp.parent ?? "" }} submitLabel="ارسال" successMessage="پیام ارسال شد." successHref="/messages?box=sent"
          initial={{ audience: "users", recipientIds: sp.to ? [sp.to] : [], subject: sp.re ? `پاسخ: ${sp.re}`.slice(0, 190) : "" }}
          fields={[
            ...(ann ? [{ name: "audience", label: "مخاطب", type: "select" as const, required: true, options: [{ value: "users", label: "کارمندان انتخابی (پیام)" }, { value: "department", label: "همه اعضای واحد من (اطلاعیه)" }, { value: "all", label: "همه کارمندان دفتر (اطلاعیه)" }] }] : []),
            { name: "recipientIds", label: "گیرندگان", type: "multicheck", required: true, showIf: { field: "audience", equals: "users" }, options: staff.map((s) => ({ value: s.id, label: `${s.fullName}${s.department ? ` — ${s.department.name}` : ""}` })) },
            { name: "subject", label: "موضوع", required: true }, { name: "body", label: "متن", type: "textarea", rows: 6, required: true },
            { name: "important", label: "علامت‌گذاری به‌عنوان مهم", type: "checkbox" },
          ]} />
      </Panel>
    </>
  );
}
