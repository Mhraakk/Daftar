import { Archive, ArchiveRestore, FolderPlus, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteBox } from "@/components/note-box";
import { ActionButton } from "@/components/ui/action-button";
import { LinkButton } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { DL, EmptyState, LinkTabs, PageHeader, Panel } from "@/components/ui/page";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { Timeline } from "@/components/ui/timeline";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { dateOnlyInput, formatDateOnly, formatJalali } from "@/lib/jalali";
import { CASE_STATUS, CONFIDENTIALITY } from "@/lib/labels";
import { faNum } from "@/lib/text";
import { caseScope, clientScope, documentScope, userNames } from "@/server/access";
import { activityFor } from "@/server/activity";
import { archiveClientAction, updateClientAction } from "../actions";
import { clientFields } from "../client-fields";

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePagePerm("client.view");
  const { id } = await params;
  const tab = (await searchParams).tab ?? "overview";
  const c = await db.client.findFirst({ where: { id, AND: [clientScope(user)] } });
  if (!c) notFound();
  const [cases, docs, notes, names, counts] = await Promise.all([
    db.case.findMany({ where: { clientId: id, AND: [caseScope(user)] }, orderBy: { updatedAt: "desc" } }),
    can(user, "document.view") ? db.document.findMany({ where: { clientId: id, AND: [documentScope(user)] }, orderBy: { updatedAt: "desc" }, take: 50, include: { case: { select: { number: true } } } }) : [],
    db.note.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" } }),
    userNames([c.assignedToId, c.createdById]),
    db.correspondence.count({ where: { clientId: id } }),
  ]);
  const noteAuthors = await userNames(notes.map((n) => n.authorId));
  const timeline = tab === "timeline" ? await activityFor({ clientId: id }) : [];
  const base = `/clients/${id}`;
  return (
    <>
      <PageHeader title={c.displayName} crumbs={[{ label: "مراجعان", href: "/clients" }, { label: c.code }]}
        meta={<><span className="mono-code">{c.code}</span><Seal>{c.type === "PERSON" ? "شخص حقیقی" : "شخص حقوقی"}</Seal>{c.archivedAt && <Seal tone="warning">بایگانی‌شده</Seal>}</>}
        actions={<>
          {can(user, "case.create") && !c.archivedAt && <LinkButton href={`/cases/new?clientId=${id}`} variant="primary"><FolderPlus />پرونده جدید</LinkButton>}
          {can(user, "client.edit") && !c.archivedAt && (
            <FormDialog trigger="ویرایش" triggerVariant="secondary" icon={<Pencil />} title="ویرایش مراجعه‌کننده" size="lg" action={updateClientAction} hidden={{ id, version: c.version }}
              fields={clientFields(c.assignedToId ? names[c.assignedToId] : undefined)} successMessage="تغییرات ذخیره شد."
              initial={{ ...c, birthDate: dateOnlyInput(c.birthDate), nationalId: c.nationalId ?? "", assignedToId: c.assignedToId ?? "" } as Record<string, unknown>} />
          )}
          {can(user, "client.archive") && (c.archivedAt
            ? <ActionButton action={archiveClientAction} payload={{ id, archived: false }} successMessage="بازگردانی شد."><ArchiveRestore />بازگردانی</ActionButton>
            : <ActionButton action={archiveClientAction} payload={{ id, archived: true }} variant="danger" successMessage="بایگانی شد."
                confirm={{ title: "بایگانی مراجعه‌کننده", body: "مراجعه‌کننده از فهرست فعال خارج می‌شود اما سوابق، پرونده‌ها و اسناد او حفظ می‌شود و قابل بازگردانی است." }}><Archive />بایگانی</ActionButton>)}
        </>} />
      <LinkTabs active={tab} tabs={[
        { key: "overview", label: "مشخصات", href: base },
        { key: "cases", label: "پرونده‌ها", href: `${base}?tab=cases`, count: faNum(cases.length) },
        { key: "documents", label: "اسناد", href: `${base}?tab=documents`, count: faNum(docs.length) },
        { key: "notes", label: "یادداشت‌ها", href: `${base}?tab=notes`, count: faNum(notes.length) },
        { key: "timeline", label: "تاریخچه", href: `${base}?tab=timeline` },
      ]} />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="مشخصات هویتی و تماس" className="lg:col-span-2">
            <DL cols={3} items={[
              ...(c.type === "PERSON" ? [{ label: "نام", value: c.firstName }, { label: "نام خانوادگی", value: c.lastName }, { label: "نام پدر", value: c.fatherName }, { label: "تاریخ تولد", value: c.birthDate && formatDateOnly(c.birthDate) }] : [{ label: "نام شخص حقوقی", value: c.companyName }]),
              { label: c.type === "PERSON" ? "کد ملی" : "شناسه ملی", value: c.nationalId && <span className="ltr num">{c.nationalId}</span> },
              { label: "تلفن همراه", value: c.mobile && <span className="ltr num">{c.mobile}</span> }, { label: "تلفن ثابت", value: c.phone && <span className="ltr num">{c.phone}</span> },
              { label: "ایمیل", value: c.email && <span className="ltr">{c.email}</span> }, { label: "کد پستی", value: c.postalCode && <span className="ltr num">{c.postalCode}</span> },
            ]} />
            <div className="mt-4 border-t border-line pt-3"><DL cols={1} items={[{ label: "نشانی", value: c.address }, { label: "توضیحات", value: c.notes && <span className="whitespace-pre-wrap">{c.notes}</span> }]} /></div>
          </Panel>
          <Panel title="خلاصه">
            <DL cols={1} items={[
              { label: "کارمند مسئول", value: c.assignedToId && names[c.assignedToId] }, { label: "ثبت‌کننده", value: names[c.createdById] },
              { label: "تاریخ ثبت", value: formatJalali(c.createdAt, "datetime") }, { label: "آخرین تغییر", value: formatJalali(c.updatedAt, "datetime") },
              { label: "پرونده‌ها", value: faNum(cases.length) }, { label: "مکاتبات مرتبط", value: faNum(counts) },
            ]} />
          </Panel>
        </div>
      )}
      {tab === "cases" && (
        <div className="panel">
          {cases.length === 0 ? <EmptyState title="پرونده‌ای برای این مراجعه‌کننده ثبت نشده است" action={can(user, "case.create") && !c.archivedAt && <LinkButton href={`/cases/new?clientId=${id}`} variant="primary">ایجاد پرونده</LinkButton>} /> : (
            <table className="tbl"><thead><tr><th>عنوان</th><th>شماره</th><th>دسته</th><th>وضعیت</th><th>تاریخ تشکیل</th></tr></thead>
              <tbody>{cases.map((x) => (
                <tr key={x.id}><td><Link href={`/cases/${x.id}`} className="font-bold hover:text-lapis">{x.title}</Link></td><td><span className="mono-code">{x.number}</span></td><td>{x.category}</td><td><StatusSeal map={CASE_STATUS} value={x.status} /></td><td className="num">{formatJalali(x.openedAt, "date")}</td></tr>
              ))}</tbody></table>
          )}
        </div>
      )}
      {tab === "documents" && (
        <div className="panel">
          <div className="flex justify-end border-b border-line p-3">{can(user, "document.upload") && <LinkButton href={`/documents/new?clientId=${id}`} size="sm" variant="primary">بارگذاری سند</LinkButton>}</div>
          {docs.length === 0 ? <EmptyState title="سندی برای این مراجعه‌کننده ثبت نشده است" /> : (
            <table className="tbl"><thead><tr><th>عنوان</th><th>کد</th><th>نوع</th><th>پرونده</th><th>محرمانگی</th><th>تاریخ</th></tr></thead>
              <tbody>{docs.map((d) => (
                <tr key={d.id}><td><Link href={`/documents/${d.id}`} className="font-medium hover:text-lapis">{d.title}</Link></td><td><span className="mono-code">{d.code}</span></td><td>{d.category}</td><td>{d.case ? <span className="mono-code">{d.case.number}</span> : "—"}</td><td><StatusSeal map={CONFIDENTIALITY} value={d.confidentiality} /></td><td className="num">{formatJalali(d.createdAt, "date")}</td></tr>
              ))}</tbody></table>
          )}
        </div>
      )}
      {tab === "notes" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="یادداشت‌ها" className="lg:col-span-2">
            {notes.length === 0 ? <EmptyState title="یادداشتی ثبت نشده است" /> : (
              <ul className="flex flex-col gap-3">{notes.map((n) => (
                <li key={n.id} className="rounded-md border border-line bg-surface-2/50 p-3"><p className="whitespace-pre-wrap leading-7">{n.body}</p><p className="mt-1 text-xs text-ink-3">{noteAuthors[n.authorId] ?? "—"} · {formatJalali(n.createdAt, "datetime")}</p></li>
              ))}</ul>
            )}
          </Panel>
          <Panel title="افزودن یادداشت"><NoteBox clientId={id} /></Panel>
        </div>
      )}
      {tab === "timeline" && <Panel title="تاریخچه فعالیت‌ها"><Timeline items={timeline} /></Panel>}
    </>
  );
}
