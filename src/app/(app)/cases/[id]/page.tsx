import { AlarmClock, FileUp, ListPlus, Pencil, Trash2, UserCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteBox } from "@/components/note-box";
import { ActionButton } from "@/components/ui/action-button";
import { LinkButton } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { DL, EmptyState, LinkTabs, Notice, PageHeader, Panel } from "@/components/ui/page";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { Timeline } from "@/components/ui/timeline";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { caseFields, deadlineFields, taskFields } from "@/lib/form-defs";
import { formatJalali, relativeDay } from "@/lib/jalali";
import { CASE_STATUS, CONFIDENTIALITY, CORR_DIRECTION, CORR_STATUS, DEADLINE_STATUS, DEADLINE_TYPE, DRAFT_STATUS, LEGAL_DOC_TYPES, PRIORITY, TASK_STATUS } from "@/lib/labels";
import { OPT } from "@/lib/options";
import { faNum, formatBytes } from "@/lib/text";
import { caseScope, corrScope, documentScope, draftScope, userNames } from "@/server/access";
import { activityFor } from "@/server/activity";
import { CASE_TRANSITIONS, closingSummary } from "@/server/cases";
import { createDeadlineAction, deadlineStatusAction, verifyDeadlineAction } from "../../deadlines/actions";
import { createTaskAction } from "../../tasks/actions";
import { addPartyAction, assignCaseAction, caseMemberAction, changeCaseStatusAction, removePartyAction, updateCaseAction } from "../actions";

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePagePerm("case.view");
  const { id } = await params;
  const tab = (await searchParams).tab ?? "overview";
  const c = await db.case.findFirst({
    where: { id, AND: [caseScope(user)] },
    include: { client: true, parties: { orderBy: { createdAt: "asc" } }, members: { include: { user: { select: { id: true, fullName: true, title: true } } } } },
  });
  if (!c) notFound();
  const now = new Date();
  const [docs, tasks, deadlines, corr, drafts, notes, events, closing] = await Promise.all([
    can(user, "document.view") ? db.document.findMany({ where: { caseId: id, AND: [documentScope(user)] }, orderBy: { createdAt: "desc" }, include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } } }) : [],
    db.task.findMany({ where: { caseId: id }, orderBy: [{ status: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }] }),
    db.deadline.findMany({ where: { caseId: id }, orderBy: { dueAt: "asc" } }),
    can(user, "correspondence.view") ? db.correspondence.findMany({ where: { caseId: id, AND: [corrScope(user)] }, orderBy: { registeredAt: "desc" } }) : [],
    can(user, "draft.view") ? db.legalDraft.findMany({ where: { caseId: id, AND: [draftScope(user)] }, orderBy: { updatedAt: "desc" } }) : [],
    db.note.findMany({ where: { caseId: id }, orderBy: { createdAt: "desc" } }),
    db.calendarEvent.findMany({ where: { caseId: id, cancelledAt: null, startAt: { gte: now } }, orderBy: { startAt: "asc" }, take: 5 }),
    closingSummary(id),
  ]);
  const names = await userNames([c.responsibleId, c.createdById, ...tasks.map((t) => t.assigneeId), ...deadlines.map((d) => d.assigneeId), ...notes.map((n) => n.authorId), ...drafts.map((d) => d.authorId), ...docs.map((d) => d.createdById)]);
  const timeline = tab === "timeline" ? await activityFor({ caseId: id }, 150) : [];
  const base = `/cases/${id}`;
  const locked = c.status === "ARCHIVED" || c.status === "CLOSED";
  const canEdit = can(user, "case.edit") && c.status !== "ARCHIVED";
  const openTasks = tasks.filter((t) => ["TODO", "IN_PROGRESS", "WAITING_REVIEW", "REJECTED"].includes(t.status));
  const openDeadlines = deadlines.filter((d) => d.status === "OPEN");
  const nextSteps = CASE_TRANSITIONS[c.status].filter((s) => s !== "CLOSED" && s !== "ARCHIVED" && !(locked && s === "OPEN"));
  const label = `${c.title} (${c.number})`;

  return (
    <>
      <PageHeader title={c.title} crumbs={[{ label: "پرونده‌ها", href: "/cases" }, { label: c.number }]}
        meta={<>
          <span className="mono-code">{c.number}</span><StatusSeal map={CASE_STATUS} value={c.status} /><StatusSeal map={PRIORITY} value={c.priority} /><Seal>{c.category}</Seal>
          <span className="text-sm text-ink-2">مراجعه‌کننده: <Link href={`/clients/${c.clientId}`} className="font-bold text-lapis hover:underline">{c.client.displayName}</Link></span>
        </>}
        actions={<>
          {canEdit && !locked && nextSteps.map((s) => (
            <ActionButton key={s} action={changeCaseStatusAction} payload={{ id, to: s }} size="sm" successMessage="وضعیت پرونده تغییر کرد.">{`تغییر به «${CASE_STATUS[s].label}»`}</ActionButton>
          ))}
          {canEdit && (
            <FormDialog trigger="ویرایش" triggerVariant="secondary" triggerSize="sm" icon={<Pencil />} title="ویرایش پرونده" size="lg" action={updateCaseAction}
              hidden={{ id, version: c.version, clientId: c.clientId }} fields={caseFields({ lockClient: true })} successMessage="تغییرات ذخیره شد."
              initial={{ ...c, description: c.description ?? "", courtName: c.courtName ?? "", courtBranch: c.courtBranch ?? "", courtCaseNumber: c.courtCaseNumber ?? "", archiveNumber: c.archiveNumber ?? "" } as Record<string, unknown>} />
          )}
          {can(user, "case.assign") && c.status !== "ARCHIVED" && (
            <FormDialog trigger={c.responsibleId ? "تغییر مسئول" : "ارجاع به کارمند"} triggerVariant={c.responsibleId ? "secondary" : "primary"} triggerSize="sm" icon={<UserCheck />} title="ارجاع پرونده"
              description="کارمند مسئول اعلان دریافت می‌کند و پرونده در کارتابل او قرار می‌گیرد." action={assignCaseAction} hidden={{ id }} cols={1} submitLabel="ارجاع" successMessage="پرونده ارجاع شد."
              fields={[{ name: "responsibleId", label: "کارمند مسئول", type: "lookup", lookup: "user", required: true }, { name: "note", label: "دستور / توضیح", type: "textarea", rows: 2 }]} />
          )}
          {can(user, "case.close") && !locked && (
            <FormDialog trigger="بستن پرونده" triggerVariant="danger" triggerSize="sm" title="مختومه‌کردن پرونده" action={changeCaseStatusAction} hidden={{ id, to: "CLOSED" }} cols={1} submitLabel="تأیید و بستن پرونده" successMessage="پرونده مختومه شد."
              description={closing.openTasks.length + closing.openDeadlines.length > 0
                ? `این پرونده ${faNum(closing.openTasks.length)} وظیفه باز و ${faNum(closing.openDeadlines.length)} مهلت باز دارد${closing.openDrafts ? ` و ${faNum(closing.openDrafts)} سند حقوقی ناتمام` : ""}. با تأیید، موارد باز لغو می‌شوند.`
                : "وظیفه یا مهلت بازی برای این پرونده وجود ندارد."}
              fields={[
                { name: "reason", label: "نتیجه / دلیل مختومه‌شدن", type: "textarea", rows: 3, required: true },
                ...(closing.openTasks.length + closing.openDeadlines.length > 0 ? [{ name: "acknowledgeOpenItems", label: "وضعیت موارد باز را بررسی کرده‌ام و لغو آن‌ها را تأیید می‌کنم", type: "checkbox" as const, required: true }] : []),
              ]} />
          )}
          {can(user, "case.close") && c.status === "CLOSED" && (
            <ActionButton action={changeCaseStatusAction} payload={{ id, to: "ARCHIVED" }} size="sm" successMessage="پرونده بایگانی شد."
              confirm={{ title: "انتقال به بایگانی", body: "پرونده به بایگانی منتقل می‌شود. اطلاعات و تاریخچه آن برای کاربران مجاز قابل بازیابی می‌ماند." }}>انتقال به بایگانی</ActionButton>
          )}
          {can(user, "case.close") && locked && (
            <ActionButton action={changeCaseStatusAction} payload={{ id, to: "OPEN" }} size="sm" successMessage="پرونده بازگشایی شد." confirm={{ title: "بازگشایی پرونده", body: "پرونده دوباره به وضعیت «باز» برمی‌گردد." }}>بازگشایی</ActionButton>
          )}
        </>} />

      {c.status === "CLOSED" && <div className="mb-4"><Notice tone="success" title={`مختومه در ${formatJalali(c.closedAt, "date")}`}>{c.closeReason}</Notice></div>}
      {!c.responsibleId && !locked && <div className="mb-4"><Notice tone="warning">این پرونده هنوز مسئول ندارد.</Notice></div>}

      <LinkTabs active={tab} tabs={[
        { key: "overview", label: "نمای کلی", href: base },
        { key: "documents", label: "اسناد", href: `${base}?tab=documents`, count: faNum(docs.length) },
        { key: "tasks", label: "وظایف", href: `${base}?tab=tasks`, count: faNum(openTasks.length) },
        { key: "deadlines", label: "مهلت‌ها", href: `${base}?tab=deadlines`, count: faNum(openDeadlines.length) },
        { key: "correspondence", label: "مکاتبات", href: `${base}?tab=correspondence`, count: faNum(corr.length) },
        { key: "drafts", label: "اسناد حقوقی", href: `${base}?tab=drafts`, count: faNum(drafts.length) },
        { key: "notes", label: "یادداشت‌ها", href: `${base}?tab=notes`, count: faNum(notes.length) },
        { key: "timeline", label: "تاریخچه", href: `${base}?tab=timeline` },
      ]} />

      {tab === "overview" && (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-2">
            <Panel title="مشخصات پرونده">
              <DL cols={3} items={[
                { label: "مرجع قضایی", value: c.courtName }, { label: "شعبه", value: c.courtBranch }, { label: "کلاسه پرونده قضایی", value: c.courtCaseNumber && <span className="ltr num">{c.courtCaseNumber}</span> },
                { label: "شماره بایگانی شعبه", value: c.archiveNumber && <span className="ltr num">{c.archiveNumber}</span> }, { label: "تاریخ تشکیل", value: formatJalali(c.openedAt, "date") }, { label: "ثبت‌کننده", value: names[c.createdById] },
              ]} />
              {c.description && <p className="mt-4 whitespace-pre-wrap border-t border-line pt-3 leading-8">{c.description}</p>}
            </Panel>
            <Panel title="اصحاب پرونده" bodyClass="p-0"
              action={canEdit && <FormDialog trigger="افزودن طرف" triggerVariant="ghost" triggerSize="sm" icon={<UserPlus />} title="افزودن طرف پرونده" action={addPartyAction} hidden={{ caseId: id }} successMessage="افزوده شد."
                fields={[{ name: "role", label: "سمت", type: "select", required: true, options: OPT.partyRole }, { name: "name", label: "نام و نام خانوادگی / نام شخص حقوقی", required: true }, { name: "nationalId", label: "کد / شناسه ملی", ltr: true }, { name: "phone", label: "تلفن", ltr: true }, { name: "address", label: "نشانی", span: 2 }]} />}>
              <table className="tbl"><thead><tr><th>سمت</th><th>نام</th><th>کد ملی</th><th>تلفن</th><th>نشانی</th><th /></tr></thead>
                <tbody>{c.parties.map((p) => (
                  <tr key={p.id}><td><Seal tone={p.clientId ? "accent" : "neutral"}>{p.role}</Seal></td><td className="font-medium">{p.name}</td><td className="num ltr text-right">{p.nationalId ?? "—"}</td><td className="num ltr text-right">{p.phone ?? "—"}</td><td className="max-w-[240px] truncate">{p.address ?? "—"}</td>
                    <td>{canEdit && !p.clientId && <ActionButton action={removePartyAction} payload={{ partyId: p.id }} variant="ghost" size="icon" aria-label="حذف" confirm={{ title: "حذف طرف پرونده", body: `«${p.name}» از اصحاب پرونده حذف شود؟` }}><Trash2 /></ActionButton>}</td></tr>
                ))}</tbody></table>
            </Panel>
            <Panel title="مهلت‌ها و وظایف باز" bodyClass="p-0">
              {openDeadlines.length + openTasks.length === 0 ? <EmptyState title="مورد بازی وجود ندارد" hint="از زبانه‌های «وظایف» و «مهلت‌ها» مورد جدید ثبت کنید." /> : (
                <ul>
                  {openDeadlines.slice(0, 5).map((d) => (
                    <li key={d.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                      <AlarmClock className={cn("size-4 shrink-0", d.dueAt < now ? "text-mohr" : "text-zafaran")} />
                      <span className="min-w-0 flex-1 truncate">{d.title}</span>
                      <span className={cn("num text-sm", d.dueAt < now ? "font-bold text-mohr" : "text-ink-2")}>{relativeDay(d.dueAt, now)} · {formatJalali(d.dueAt, "date")}</span>
                    </li>
                  ))}
                  {openTasks.slice(0, 5).map((t) => (
                    <li key={t.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                      <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate hover:text-lapis">{t.title}</Link>
                      <span className="text-sm text-ink-2">{t.assigneeId ? names[t.assigneeId] : "بدون مجری"}</span><StatusSeal map={TASK_STATUS} value={t.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <div className="flex flex-col gap-4">
            <Panel title="مسئول و اعضا" action={can(user, "case.assign") && c.status !== "ARCHIVED" && (
              <FormDialog trigger="افزودن عضو" triggerVariant="ghost" triggerSize="sm" title="افزودن عضو به پرونده" description="اعضا به اطلاعات این پرونده دسترسی خواهند داشت." action={caseMemberAction} hidden={{ id, add: true }} cols={1} successMessage="عضو افزوده شد."
                fields={[{ name: "userId", label: "کارمند", type: "lookup", lookup: "user", required: true }]} />)}>
              <p className="text-xs text-ink-3">کارمند مسئول</p>
              <p className="mb-3 font-bold">{c.responsibleId ? names[c.responsibleId] : <span className="text-zafaran">تعیین نشده</span>}</p>
              <p className="text-xs text-ink-3">اعضای همکار</p>
              {c.members.length === 0 ? <p className="text-sm text-ink-2">—</p> : (
                <ul className="mt-1 flex flex-col gap-1">{c.members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-2"><span>{m.user.fullName}<span className="text-xs text-ink-3"> {m.user.title ? `· ${m.user.title}` : ""}</span></span>
                    {can(user, "case.assign") && <ActionButton action={caseMemberAction} payload={{ id, userId: m.userId, add: false }} variant="ghost" size="icon" aria-label="حذف عضو" successMessage="عضو حذف شد."><Trash2 /></ActionButton>}</li>
                ))}</ul>
              )}
            </Panel>
            <Panel title="رویدادهای پیش رو">
              {events.length === 0 ? <p className="text-sm text-ink-3">رویدادی ثبت نشده است.</p> : <ul className="flex flex-col gap-2">{events.map((e) => <li key={e.id}><p className="font-medium">{e.title}</p><p className="text-xs text-ink-3">{formatJalali(e.startAt, "long")}{!e.allDay && ` · ${formatJalali(e.startAt, "time")}`}</p></li>)}</ul>}
              <Link href="/calendar" className="mt-3 inline-block text-sm text-lapis hover:underline">ثبت رویداد در تقویم</Link>
            </Panel>
            <Panel title="مراجعه‌کننده">
              <DL cols={1} items={[{ label: "نام", value: <Link href={`/clients/${c.clientId}`} className="font-bold text-lapis hover:underline">{c.client.displayName}</Link> }, { label: "کد ملی", value: c.client.nationalId && <span className="ltr num">{c.client.nationalId}</span> }, { label: "تلفن همراه", value: c.client.mobile && <span className="ltr num">{c.client.mobile}</span> }]} />
            </Panel>
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div className="panel">
          <div className="flex items-center justify-between border-b border-line p-3"><p className="text-sm text-ink-2">اسناد متصل به این پرونده</p>
            {can(user, "document.upload") && c.status !== "ARCHIVED" && <LinkButton href={`/documents/new?caseId=${id}`} size="sm" variant="primary"><FileUp />بارگذاری سند</LinkButton>}</div>
          {docs.length === 0 ? <EmptyState icon={<FileUp />} title="سندی به این پرونده متصل نشده است" hint="مدارک هویتی، وکالت‌نامه، ابلاغیه‌ها و مستندات را بارگذاری کنید." /> : (
            <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>عنوان</th><th>کد</th><th>نوع</th><th>فایل</th><th>نسخه</th><th>محرمانگی</th><th>ثبت‌کننده</th><th>تاریخ</th></tr></thead>
              <tbody>{docs.map((d) => { const v = d.versions[0]; return (
                <tr key={d.id}><td><Link href={`/documents/${d.id}`} className="font-medium hover:text-lapis">{d.title}</Link></td><td><span className="mono-code">{d.code}</span></td><td>{d.category}</td>
                  <td className="max-w-[200px] truncate text-sm text-ink-2">{v?.fileName} {v && <span className="text-xs text-ink-3">({formatBytes(v.size)})</span>}</td><td className="num">{faNum(v?.versionNo ?? 1)}</td>
                  <td><StatusSeal map={CONFIDENTIALITY} value={d.confidentiality} /></td><td>{names[d.createdById] ?? "—"}</td><td className="num">{formatJalali(d.createdAt, "date")}</td></tr>
              ); })}</tbody></table></div>
          )}
        </div>
      )}

      {tab === "tasks" && (
        <div className="panel">
          <div className="flex items-center justify-between border-b border-line p-3"><p className="text-sm text-ink-2">وظایف این پرونده</p>
            {can(user, "task.create") && !locked && <FormDialog trigger="وظیفه جدید" triggerSize="sm" icon={<ListPlus />} title={`وظیفه جدید — ${label}`} size="lg" action={createTaskAction} hidden={{ caseId: id }} successMessage="وظیفه ثبت شد."
              fields={taskFields({ canAssign: can(user, "task.assign") })} initial={{ priority: "NORMAL" }} />}</div>
          {tasks.length === 0 ? <EmptyState icon={<ListPlus />} title="وظیفه‌ای برای این پرونده ثبت نشده است" /> : (
            <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>عنوان</th><th>کد</th><th>مجری</th><th>مهلت</th><th>اولویت</th><th>وضعیت</th></tr></thead>
              <tbody>{tasks.map((t) => (
                <tr key={t.id}><td><Link href={`/tasks/${t.id}`} className="font-medium hover:text-lapis">{t.title}</Link></td><td><span className="mono-code">{t.code}</span></td><td>{t.assigneeId ? names[t.assigneeId] : <span className="text-zafaran">بدون مجری</span>}</td>
                  <td className={cn("num", t.dueAt && t.dueAt < now && !["DONE", "CANCELLED"].includes(t.status) && "font-bold text-mohr")}>{t.dueAt ? formatJalali(t.dueAt, "date") : "—"}</td><td><StatusSeal map={PRIORITY} value={t.priority} /></td><td><StatusSeal map={TASK_STATUS} value={t.status} /></td></tr>
              ))}</tbody></table></div>
          )}
        </div>
      )}

      {tab === "deadlines" && (
        <div className="panel">
          <div className="flex items-center justify-between border-b border-line p-3"><p className="text-sm text-ink-2">مهلت‌ها و تاریخ‌های مهم پرونده</p>
            <div className="flex gap-2">
              {can(user, "deadline.manage") && !locked && <LinkButton href={`/deadlines/calculator?caseId=${id}`} size="sm">محاسبه مهلت قانونی</LinkButton>}
              {can(user, "deadline.manage") && !locked && <FormDialog trigger="مهلت جدید" triggerSize="sm" icon={<AlarmClock />} title={`مهلت جدید — ${label}`} size="lg" action={createDeadlineAction} hidden={{ caseId: id }} successMessage="مهلت ثبت و یادآورها زمان‌بندی شد."
                fields={deadlineFields()} initial={{ priority: "NORMAL", type: "FILING", reminderOffsets: ["4320", "1440", "120"] }} />}
            </div></div>
          {deadlines.length === 0 ? <EmptyState icon={<AlarmClock />} title="مهلتی برای این پرونده ثبت نشده است" /> : (
            <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>عنوان</th><th>نوع</th><th>سررسید</th><th>مسئول</th><th>وضعیت</th><th>اقدام</th></tr></thead>
              <tbody>{deadlines.map((d) => { const late = d.status === "OPEN" && d.dueAt < now; return (
                <tr key={d.id}><td><span className="font-medium">{d.title}</span>{d.isLegal && <span className="ms-2"><Seal tone={d.verifiedAt ? "success" : "warning"}>{d.verifiedAt ? "قانونی · تأییدشده" : "قانونی · نیازمند تأیید"}</Seal></span>}{d.legalBasis && <span className="block text-xs text-ink-3">{d.legalBasis}</span>}</td>
                  <td>{DEADLINE_TYPE[d.type]}</td><td className={cn("num", late && "font-bold text-mohr")}>{formatJalali(d.dueAt, "datetime")}<span className="block text-xs">{d.status === "OPEN" ? relativeDay(d.dueAt, now) : ""}</span></td><td>{names[d.assigneeId] ?? "—"}</td>
                  <td>{late ? <Seal tone="danger" dot>معوق</Seal> : <StatusSeal map={DEADLINE_STATUS} value={d.status} />}</td>
                  <td><div className="flex gap-1">
                    {d.status === "OPEN" && <ActionButton action={deadlineStatusAction} payload={{ id: d.id, status: "DONE" }} size="sm" variant="accent" successMessage="مهلت انجام‌شده ثبت شد.">انجام شد</ActionButton>}
                    {d.status === "OPEN" && d.isLegal && !d.verifiedAt && can(user, "deadline.verify_legal") && <ActionButton action={verifyDeadlineAction} payload={{ id: d.id }} size="sm" successMessage="مهلت قانونی تأیید شد." confirm={{ title: "تأیید مهلت قانونی", body: `تاریخ ${formatJalali(d.dueAt, "long")} را با قانون حاکم، نوع ابلاغ و تعطیلات تطبیق داده‌ام و تأیید می‌کنم.` }}>تأیید</ActionButton>}
                  </div></td></tr>
              ); })}</tbody></table></div>
          )}
        </div>
      )}

      {tab === "correspondence" && (
        <div className="panel">
          <div className="flex items-center justify-between border-b border-line p-3"><p className="text-sm text-ink-2">مکاتبات مرتبط با پرونده</p>
            {can(user, "correspondence.create") && !locked && <LinkButton href={`/cartable/new?caseId=${id}`} size="sm" variant="primary">ثبت مکاتبه</LinkButton>}</div>
          {corr.length === 0 ? <EmptyState title="مکاتبه‌ای برای این پرونده ثبت نشده است" /> : (
            <table className="tbl"><thead><tr><th>موضوع</th><th>شماره</th><th>نوع</th><th>طرف مکاتبه</th><th>وضعیت</th><th>تاریخ ثبت</th></tr></thead>
              <tbody>{corr.map((x) => (<tr key={x.id}><td><Link href={`/cartable/${x.id}`} className="font-medium hover:text-lapis">{x.subject}</Link></td><td><span className="mono-code">{x.refNumber}</span></td><td>{CORR_DIRECTION[x.direction]}</td><td>{x.externalParty ?? "—"}</td><td><StatusSeal map={CORR_STATUS} value={x.status} /></td><td className="num">{formatJalali(x.registeredAt, "date")}</td></tr>))}</tbody></table>
          )}
        </div>
      )}

      {tab === "drafts" && (
        <div className="panel">
          <div className="flex items-center justify-between border-b border-line p-3"><p className="text-sm text-ink-2">دادخواست‌ها، لوایح و سایر اسناد حقوقی پرونده</p>
            {can(user, "draft.create") && !locked && <LinkButton href={`/drafts/new?caseId=${id}`} size="sm" variant="primary">تنظیم سند حقوقی</LinkButton>}</div>
          {drafts.length === 0 ? <EmptyState title="سند حقوقی‌ای برای این پرونده تنظیم نشده است" hint="از قالب‌های آماده، دادخواست، لایحه یا اظهارنامه بسازید." /> : (
            <table className="tbl"><thead><tr><th>عنوان</th><th>کد</th><th>نوع</th><th>تنظیم‌کننده</th><th>وضعیت</th><th>به‌روزرسانی</th></tr></thead>
              <tbody>{drafts.map((d) => (<tr key={d.id}><td><Link href={`/drafts/${d.id}`} className="font-medium hover:text-lapis">{d.title}</Link></td><td><span className="mono-code">{d.code}</span></td><td>{LEGAL_DOC_TYPES[d.docType] ?? d.docType}</td><td>{names[d.authorId] ?? "—"}</td><td><StatusSeal map={DRAFT_STATUS} value={d.status} /></td><td className="num">{formatJalali(d.updatedAt, "date")}</td></tr>))}</tbody></table>
          )}
        </div>
      )}

      {tab === "notes" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="یادداشت‌های پرونده" className="lg:col-span-2">
            {notes.length === 0 ? <EmptyState title="یادداشتی ثبت نشده است" /> : <ul className="flex flex-col gap-3">{notes.map((n) => (
              <li key={n.id} className="rounded-md border border-line bg-surface-2/50 p-3"><p className="whitespace-pre-wrap leading-7">{n.body}</p><p className="mt-1 text-xs text-ink-3">{names[n.authorId] ?? "—"} · {formatJalali(n.createdAt, "datetime")}</p></li>))}</ul>}
          </Panel>
          <Panel title="افزودن یادداشت"><NoteBox caseId={id} /></Panel>
        </div>
      )}

      {tab === "timeline" && <Panel title="تاریخچه کامل پرونده" action={can(user, "report.export") && <LinkButton href={`/api/export/case-history/${id}`} size="sm">خروجی PDF سوابق</LinkButton>}><Timeline items={timeline} /></Panel>}
    </>
  );
}
