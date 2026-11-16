import { PageHeader } from "@/components/ui/page";
import { requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { caseScope } from "@/server/access";
import { NewDraftWizard } from "./wizard";

export const metadata = { title: "تنظیم سند حقوقی" };

export default async function NewDraftPage({ searchParams }: { searchParams: Promise<{ caseId?: string; templateId?: string }> }) {
  const user = await requirePagePerm("draft.create");
  const sp = await searchParams;
  const [templates, c, ai] = await Promise.all([
    db.legalTemplate.findMany({ where: { isActive: true }, orderBy: [{ docType: "asc" }, { name: "asc" }], select: { id: true, name: true, docType: true, category: true, description: true, versions: { orderBy: { versionNo: "desc" }, take: 1, select: { versionNo: true } } } }),
    sp.caseId ? db.case.findFirst({ where: { id: sp.caseId, AND: [caseScope(user)] }, select: { id: true, title: true, number: true } }) : null,
    db.setting.findUnique({ where: { key: "ai" } }),
  ]);
  return (
    <>
      <PageHeader title="تنظیم سند حقوقی" crumbs={[{ label: "اسناد حقوقی", href: "/drafts" }, { label: "سند جدید" }]} subtitle="سند پس از ایجاد در ویرایشگر حقوقی باز می‌شود و تا تأیید بررسی‌کننده، پیش‌نویس است." />
      <NewDraftWizard aiEnabled={!!(ai?.value as { enabled?: boolean } | undefined)?.enabled}
        templates={templates.map((t) => ({ id: t.id, name: t.name, docType: t.docType, category: t.category, description: t.description, versionNo: t.versions[0]?.versionNo ?? 1 }))}
        initialCase={c ? { id: c.id, label: `${c.title} · ${c.number}` } : undefined} initialTemplateId={sp.templateId} />
    </>
  );
}
