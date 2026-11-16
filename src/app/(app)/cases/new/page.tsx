import { LinkButton } from "@/components/ui/button";
import { Notice, PageHeader, Panel } from "@/components/ui/page";
import { SmartForm } from "@/components/ui/smart-form";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { caseFields } from "@/lib/form-defs";
import { clientScope } from "@/server/access";
import { createCaseAction } from "../actions";

export const metadata = { title: "پرونده جدید" };

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const user = await requirePagePerm("case.create");
  const { clientId } = await searchParams;
  const client = clientId ? await db.client.findFirst({ where: { id: clientId, archivedAt: null, AND: [clientScope(user)] }, select: { id: true, displayName: true, code: true } }) : null;
  return (
    <>
      <PageHeader title="ایجاد پرونده" crumbs={[{ label: "پرونده‌ها", href: "/cases" }, { label: "پرونده جدید" }]}
        subtitle="شماره اختصاصی پرونده پس از ثبت به‌صورت خودکار صادر می‌شود."
        actions={can(user, "client.create") && <LinkButton href="/clients/new?then=case">مراجعه‌کننده جدید است؟ ابتدا او را ثبت کنید</LinkButton>} />
      <Panel className="max-w-4xl">
        {client && <div className="mb-4"><Notice tone="accent">پرونده برای «{client.displayName}» ({client.code}) ایجاد می‌شود.</Notice></div>}
        <SmartForm action={createCaseAction} submitLabel="ایجاد پرونده" successMessage="پرونده ایجاد شد." successHref="/cases/{id}"
          fields={caseFields({ clientLabel: client?.displayName, canAssign: can(user, "case.assign") })}
          initial={{ clientId: client?.id ?? "", priority: "NORMAL", category: "حقوقی" }} />
      </Panel>
    </>
  );
}
