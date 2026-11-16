import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, BookmarkPlus, ChevronLeft, ChevronRight, FileText, Pencil, Trash2 } from "lucide-react";
import { CopyButton } from "@/components/research/copy-button";
import { ActionButton } from "@/components/ui/action-button";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { DL, Notice, PageHeader, Panel } from "@/components/ui/page";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { SOURCE_STATUS } from "@/lib/labels";
import { faNum, toFaDigits } from "@/lib/text";
import { userNames } from "@/server/access";
import { SOURCE_KINDS, citationOf } from "@/server/legal-library";
import { deleteLegalSourceAction, saveLegalSourceAction, saveResearchAction, verifyLegalSourceAction } from "../../actions";
import { LAW_ARTICLE_FIELDS, SOURCE_FIELDS } from "../fields";

const SNIPPET_CHARS = 900;
const NOTE_ROWS = 3;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const s = await db.legalSource.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: s?.title ?? "منبع" };
}

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePerm("research.use");
  const { id } = await params;
  const s = await db.legalSource.findUnique({ where: { id }, include: { law: { select: { code: true, shortTitle: true, title: true } }, _count: { select: { draftSources: true } } } });
  if (!s) notFound();
  const [names, prev, next] = await Promise.all([
    userNames([s.verifiedById, s.editedById, s.createdById].filter((x): x is string => !!x)),
    s.lawCode && s.orderNo ? db.legalSource.findFirst({ where: { lawCode: s.lawCode, orderNo: s.orderNo - 1 }, select: { id: true, title: true } }) : null,
    s.lawCode && s.orderNo ? db.legalSource.findFirst({ where: { lawCode: s.lawCode, orderNo: s.orderNo + 1 }, select: { id: true, title: true } }) : null,
  ]);
  const manage = can(user, "legal_source.manage");
  const citation = citationOf(s);
  const isLaw = !!s.lawCode;
  const editInitial = {
    kind: s.kind, title: s.title, reference: s.reference ?? "", articleNo: s.articleNo ?? "", text: s.text, sourceName: s.sourceName ?? "", sourceUrl: s.sourceUrl ?? "",
    retrievedAt: s.retrievedAt ? formatJalali(s.retrievedAt) : "", tags: s.tags, status: s.status, statusNote: s.statusNote ?? "",
  };
  return (
    <>
      <PageHeader title={s.title}
        crumbs={[{ label: "پژوهش و منابع", href: "/research" }, ...(s.law ? [{ label: s.law.shortTitle ?? s.law.code, href: `/research/laws/${s.law.code}?a=${s.articleNo}#a-${s.articleNo}` }] : [{ label: "کتابخانه", href: "/research/library" }]), { label: s.articleNo ? `ماده ${toFaDigits(s.articleNo)}` : "منبع" }]}
        meta={<>
          <Seal tone="info">{SOURCE_KINDS[s.kind] ?? s.kind}</Seal>
          <StatusSeal map={SOURCE_STATUS} value={s.status} />
          {s.verified ? <Seal tone="success"><BadgeCheck className="size-3" aria-hidden />تأییدشده</Seal> : <Seal tone="warning">تأییدنشده</Seal>}
          {s.editedAt && <Seal tone="accent">اصلاح دستی {formatJalali(s.editedAt)}</Seal>}
        </>}
        actions={<>
          <FormDialog trigger="افزودن به پرونده" triggerVariant="secondary" icon={<BookmarkPlus />} title="ثبت در سوابق پژوهش پرونده" action={saveResearchAction} cols={1}
            hidden={{ title: citation, snippet: s.text.slice(0, SNIPPET_CHARS), source: s.law ? s.law.title : (s.sourceName ?? "کتابخانه داخلی دفتر"), sourceUrl: `/research/library/${s.id}`, category: SOURCE_KINDS[s.kind] ?? s.kind, query: citation }}
            successMessage="در سوابق پژوهش پرونده ثبت شد."
            fields={[{ name: "caseId", label: "پرونده", type: "lookup", lookup: "case", required: true }, { name: "note", label: "یادداشت (اختیاری)", type: "textarea", rows: NOTE_ROWS }]} />
          {manage && (s.verified
            ? <ActionButton action={verifyLegalSourceAction} payload={{ id: s.id, verified: false }} variant="ghost" successMessage="تأیید لغو شد.">لغو تأیید</ActionButton>
            : <ActionButton action={verifyLegalSourceAction} payload={{ id: s.id, verified: true }} variant="primary" successMessage="منبع تأیید شد."
                confirm={{ title: "تأیید منبع", body: "تأیید می‌کنید متن این منبع با منبع رسمی تطبیق داده شده است؟ این اقدام به نام شما ثبت می‌شود." }}><BadgeCheck />تأیید منبع</ActionButton>)}
          {manage && (
            <FormDialog trigger="ویرایش" triggerVariant="secondary" icon={<Pencil />} title={isLaw ? "اصلاح متن یا وضعیت ماده" : "ویرایش منبع"} action={saveLegalSourceAction}
              hidden={{ id: s.id, ...(isLaw ? { kind: s.kind, title: s.title } : {}) }} fields={isLaw ? LAW_ARTICLE_FIELDS : SOURCE_FIELDS} initial={editInitial}
              successMessage="ذخیره شد؛ اگر متن تغییر کرده باشد تأیید باطل شده است." />
          )}
          {manage && !isLaw && (
            <ActionButton action={deleteLegalSourceAction} payload={{ id: s.id }} variant="danger" redirectTo="/research/library" successMessage="منبع حذف شد."
              confirm={{ title: "حذف منبع", body: "منبع از کتابخانه حذف می‌شود. منبعی که در پیش‌نویس‌ها استناد شده حذف نمی‌شود." }}><Trash2 />حذف</ActionButton>
          )}
        </>} />
      {s.status === "REPEALED" && <div className="mb-4"><Notice tone="danger" title="ماده منسوخ">{s.statusNote ?? "این ماده منسوخ است"} — در دادخواست و لایحه به آن استناد نکنید؛ در فهرست استناد پیش‌نویس هم پیشنهاد نمی‌شود.</Notice></div>}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Panel title="متن" action={<div className="flex gap-1"><CopyButton text={citation} label="کپی استناد" /><CopyButton text={`${citation}:\n${s.text}`} label="کپی متن" /></div>}>
            <p className="whitespace-pre-line text-md leading-9" data-testid="source-text">{s.text}</p>
          </Panel>
          {isLaw && (
            <div className="flex items-center justify-between gap-2">
              {prev ? <LinkButton href={`/research/library/${prev.id}`} variant="ghost" size="sm"><ChevronRight />{prev.title}</LinkButton> : <span />}
              {next ? <LinkButton href={`/research/library/${next.id}`} variant="ghost" size="sm">{next.title}<ChevronLeft /></LinkButton> : <span />}
            </div>
          )}
        </div>
        <Panel title="مشخصات">
          <DL cols={1} items={[
            { label: "استناد", value: citation },
            { label: "مرجع", value: s.reference },
            ...(s.headingPath.length ? [{ label: "جایگاه در قانون", value: s.headingPath.slice(1).join(" › ") }] : []),
            ...(s.law && s.sourcePages.length ? [{ label: "صفحه در PDF منبع", value: <a className={buttonClass("ghost", "sm")} href={`/api/library/laws/${s.law.code}/source#page=${s.sourcePages[0]}`} target="_blank" rel="noopener"><FileText />{s.sourcePages.map((p) => faNum(p)).join("، ")}</a> }] : []),
            { label: "منبع", value: s.sourceUrl ? <a className="text-lapis hover:underline" href={s.sourceUrl} target="_blank" rel="noopener noreferrer">{s.sourceName ?? s.sourceUrl}</a> : s.sourceName },
            { label: "تاریخ بازیابی", value: s.retrievedAt && formatJalali(s.retrievedAt) },
            { label: "تأیید", value: s.verified && s.verifiedAt ? `${names[s.verifiedById ?? ""] ?? "—"} — ${formatJalali(s.verifiedAt, "datetime")}` : "تأییدنشده" },
            { label: "وضعیت", value: s.statusNote },
            { label: "استناد در پیش‌نویس‌ها", value: faNum(s._count.draftSources) },
            { label: "برچسب‌ها", value: s.tags.length ? s.tags.join("، ") : null },
            ...(s.lawCode ? [] : [{ label: "ثبت", value: `${names[s.createdById ?? ""] ?? "—"} — ${formatJalali(s.createdAt)}` }]),
          ]} />
          {isLaw && <p className="mt-3 text-xs leading-6 text-ink-3">{s.law?.title}: متن از PDF دفتر استخراج شده است. اصلاح دستی متن ثبت و حفظ می‌شود و ورود دوباره قانون آن را بازنویسی نمی‌کند.</p>}
        </Panel>
      </div>
    </>
  );
}
