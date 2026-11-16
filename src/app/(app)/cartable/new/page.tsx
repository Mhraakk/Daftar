import { PageHeader, Panel } from "@/components/ui/page";
import { SmartForm } from "@/components/ui/smart-form";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { OPT } from "@/lib/options";
import { caseScope } from "@/server/access";
import { createCorrAction } from "../actions";

export const metadata = { title: "ثبت مکاتبه" };

export default async function NewCorrPage({ searchParams }: { searchParams: Promise<{ caseId?: string }> }) {
  const user = await requirePagePerm("correspondence.create");
  const { caseId } = await searchParams;
  const c = caseId ? await db.case.findFirst({ where: { id: caseId, AND: [caseScope(user)] }, select: { id: true, title: true, number: true } }) : null;
  return (
    <>
      <PageHeader title="ثبت مکاتبه" crumbs={[{ label: "کارتابل", href: "/cartable" }, { label: "ثبت مکاتبه" }]} subtitle="شماره ثبت پس از ذخیره صادر می‌شود. پیوست‌ها را پس از ثبت اضافه کنید." />
      <Panel className="max-w-4xl">
        <SmartForm action={createCorrAction} submitLabel="ثبت مکاتبه" successMessage="مکاتبه ثبت شد." successHref="/cartable/{id}"
          initial={{ direction: "INCOMING", priority: "NORMAL", caseId: c?.id ?? "" }}
          fields={[
            { name: "direction", label: "نوع مکاتبه", type: "select", required: true, options: [{ value: "INCOMING", label: "وارده" }, { value: "OUTGOING", label: "صادره" }, { value: "INTERNAL", label: "داخلی" }] },
            { name: "priority", label: "اولویت", type: "select", required: true, options: OPT.priority },
            { name: "subject", label: "موضوع", required: true, span: 2, autoFocus: true },
            { name: "externalParty", label: "فرستنده / گیرنده بیرونی", placeholder: "نام شخص یا مرجع", hint: "برای مکاتبه وارده و صادره الزامی است." },
            { name: "externalRef", label: "شماره نامه", ltr: true },
            { name: "letterDate", label: "تاریخ نامه", type: "jdate" },
            { name: "deadlineDate", label: "مهلت اقدام", type: "jdate" },
            { name: "caseId", label: "پرونده مرتبط", type: "lookup", lookup: "case", lookupLabel: c ? `${c.title} · ${c.number}` : undefined },
            { name: "clientId", label: "مراجعه‌کننده مرتبط", type: "lookup", lookup: "client", hint: "با انتخاب پرونده، خودکار تعیین می‌شود." },
            { name: "body", label: "متن / خلاصه", type: "textarea", rows: 4 },
            ...(can(user, "correspondence.refer") ? [
              { name: "referToId", label: "ارجاع به", type: "lookup" as const, lookup: "user" as const, hint: "خالی = در کارتابل خودم بماند" },
              { name: "instruction", label: "دستور ارجاع", placeholder: "مثلاً: جهت بررسی و اقدام" },
            ] : []),
          ]} />
      </Panel>
    </>
  );
}
