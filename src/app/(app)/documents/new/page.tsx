import { PageHeader, Panel } from "@/components/ui/page";
import { UploadForm } from "@/components/upload-form";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { ALLOWED_EXTENSIONS } from "@/lib/storage";
import { caseScope, clientScope, corrScope, taskScope } from "@/server/access";

export const metadata = { title: "بارگذاری سند" };

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ caseId?: string; clientId?: string; correspondenceId?: string; taskId?: string }> }) {
  const user = await requirePagePerm("document.upload");
  const sp = await searchParams;
  const [c, cl, co, t] = await Promise.all([
    sp.caseId ? db.case.findFirst({ where: { id: sp.caseId, AND: [caseScope(user)] }, select: { id: true, title: true, number: true } }) : null,
    sp.clientId ? db.client.findFirst({ where: { id: sp.clientId, AND: [clientScope(user)] }, select: { id: true, displayName: true } }) : null,
    sp.correspondenceId ? db.correspondence.findFirst({ where: { id: sp.correspondenceId, AND: [corrScope(user)] }, select: { id: true, subject: true, refNumber: true } }) : null,
    sp.taskId ? db.task.findFirst({ where: { id: sp.taskId, AND: [taskScope(user)] }, select: { id: true, title: true, code: true } }) : null,
  ]);
  const contextLabel = co ? `مکاتبه ${co.subject} (${co.refNumber})` : t ? `وظیفه ${t.title} (${t.code})` : undefined;
  return (
    <>
      <PageHeader title="بارگذاری سند" crumbs={[{ label: "اسناد", href: "/documents" }, { label: "بارگذاری" }]} subtitle="متن سند برای جست‌وجو نمایه می‌شود و هش فایل برای کنترل یکپارچگی ثبت می‌گردد." />
      <Panel className="max-w-3xl">
        <UploadForm accept={ALLOWED_EXTENSIONS.join(",")} maxMb={Number(process.env.MAX_UPLOAD_MB ?? 25)} canConfidential={can(user, "document.view_confidential")}
          ctx={{ caseId: c?.id, caseLabel: c ? `${c.title} · ${c.number}` : undefined, clientId: cl?.id, clientLabel: cl?.displayName, correspondenceId: co?.id, taskId: t?.id, contextLabel }} />
      </Panel>
    </>
  );
}
