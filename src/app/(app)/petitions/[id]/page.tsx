// یک نوع دادخواست: مرجع و مبنای صلاحیت، اشخاص، دلایل و الزام‌ها، متن قالب با جاهای خالی، و تنظیم سند تازه از آن
import { Archive, BookOpenText, CalendarClock, FileDown, FilePen, Gavel, ListChecks, Pencil, ScrollText, Send, Undo2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TemplateText } from "@/components/petitions/template-text";
import { ActionButton } from "@/components/ui/action-button";
import { FormDialog } from "@/components/ui/form-dialog";
import { DL, Notice, PageHeader, Panel } from "@/components/ui/page";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { SmartForm, type FieldDef } from "@/components/ui/smart-form";
import { can, getSessionUser, requirePagePerm, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { formatJalali } from "@/lib/jalali";
import { DRAFT_STATUS, PETITION_KIND, PETITION_SOURCE, PETITION_TYPE_STATUS, VALUE_TYPE } from "@/lib/labels";
import { faNum, toFaDigits } from "@/lib/text";
import { caseScope, draftScope } from "@/server/access";
import { getPetitionType } from "@/server/petitions/catalog";
import { evidenceRequired, toSpec } from "@/server/petitions/data";
import { sideLabels, userBlanks } from "@/server/petitions/render";
import { createPetitionAction, setPetitionTypeStatusAction, updatePetitionTypeAction } from "../actions";

const MANAGE = "petition.manage";
/** قانون آیین دادرسی مدنی در کتابخانه؛ بررسی شکلی هر دادخواست به مواد ۵۱ و ۵۳ آن استناد می‌کند */
const ACP = "ACP";
const FORM_ARTICLES = ["48", "51", "53"];
const RECENT = 6;
const SHORT_ROWS = 2;
const NOTE_ROWS = 3;
const LIST_ROWS = 4;
const BODY_ROWS = 14;
// eslint-disable-next-line ts-patterns/no-magic-numbers -- FieldDef.span needs the literal type 2
const FULL = 2 as const;

type TypeRow = Awaited<ReturnType<typeof getPetitionType>>;

async function loadType(id: string, user: SessionUser): Promise<TypeRow> {
  try {
    return await getPetitionType(id, user);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const [u, { id }] = await Promise.all([getSessionUser(), params]);
  const r = await db.petitionType.findUnique({ where: { id }, select: { title: true, status: true } });
  return { title: r && u && (r.status === "PUBLISHED" || can(u, MANAGE)) ? r.title : "دادخواست" };
}

const articleHref = (lawCode: string, n: string) => `/research/laws/${lawCode}?a=${n}#a-${n}`;

function Items({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-ink-3">{empty}</p>;
  return <ul className="flex list-disc flex-col gap-1 ps-5 text-sm leading-7 marker:text-ink-3">{items.map((x) => <li key={x}>{x}</li>)}</ul>;
}

const REQUIRED_SEAL: Record<string, { tone: "danger" | "neutral"; label: string }> = {
  true: { tone: "danger", label: "الزامی" },
  false: { tone: "neutral", label: "در صورت وجود" },
};

function editFields(): FieldDef[] {
  return [
    { name: "title", label: "عنوان", required: true, span: FULL },
    { name: "kind", label: "گروه", type: "select", options: Object.entries(PETITION_KIND).map(([value, v]) => ({ value, label: v.label })) },
    { name: "category", label: "دسته", required: true },
    { name: "court", label: "مرجع رسیدگی" },
    { name: "valueType", label: "نوع خواسته", type: "select", options: [{ value: "", label: "—" }, ...Object.entries(VALUE_TYPE).map(([value, label]) => ({ value, label }))] },
    { name: "courtBasis", label: "مبنای صلاحیت", type: "textarea", rows: SHORT_ROWS },
    { name: "eligible", label: "اشخاص مجاز به تقدیم", type: "textarea", rows: SHORT_ROWS },
    { name: "defendant", label: "خوانده", type: "textarea", rows: SHORT_ROWS },
    { name: "evidence", label: "دلایل و منضمات", type: "lines", rows: LIST_ROWS },
    { name: "evidenceInfo", label: "توضیح دلایل", type: "lines", rows: SHORT_ROWS },
    { name: "investigations", label: "تحقیقات و اقدامات", type: "lines", rows: SHORT_ROWS },
    { name: "ancillary", label: "خواسته‌های فرعی", type: "lines", rows: SHORT_ROWS },
    { name: "fees", label: "هزینه‌ها", type: "lines", rows: SHORT_ROWS },
    { name: "keywords", label: "کلیدواژه‌های جست‌وجو", type: "lines", rows: SHORT_ROWS },
    { name: "bodyTemplate", label: "متن شرح خواسته", type: "textarea", rows: BODY_ROWS, required: true, hint: "جای خالی را به شکل {{برچسب}} بنویسید؛ فهرست جاهای خالی از روی متن ساخته می‌شود." },
    { name: "notes", label: "یادداشت", type: "textarea", rows: NOTE_ROWS },
  ];
}

function ManagerActions({ row }: { row: TypeRow }) {
  const initial = {
    title: row.title, kind: row.kind, category: row.category, court: row.court ?? "", valueType: row.valueType ?? "", courtBasis: row.courtBasis ?? "", eligible: row.eligible ?? "",
    defendant: row.defendant ?? "", evidence: row.evidence, evidenceInfo: row.evidenceInfo, investigations: row.investigations, ancillary: row.ancillary, fees: row.fees,
    keywords: row.keywords, bodyTemplate: row.bodyTemplate, notes: row.notes ?? "",
  };
  return (
    <>
      <FormDialog trigger="ویرایش" triggerVariant="secondary" icon={<Pencil />} title={`ویرایش «${row.title}»`} size="lg" action={updatePetitionTypeAction}
        hidden={{ id: row.id, version: row.version }} initial={initial} fields={editFields()} successMessage="نوع دادخواست ویرایش شد."
        description="ویرایش در سابقه ثبت می‌شود. اسناد پیشین تغییر نمی‌کنند؛ سند تازه با متن جدید ساخته می‌شود." />
      {row.status !== "PUBLISHED" && (
        <ActionButton action={setPetitionTypeStatusAction} payload={{ id: row.id, status: "PUBLISHED" }} variant="primary" successMessage="منتشر شد."
          confirm={{ title: "انتشار نوع دادخواست", body: "پس از انتشار، همه کارکنان مجاز می‌توانند از این نوع سند بسازند. متن و الزام‌ها را پیش از انتشار با فرم اصلی تطبیق دهید." }}>
          <Send />انتشار
        </ActionButton>
      )}
      {row.status === "PUBLISHED" && (
        <ActionButton action={setPetitionTypeStatusAction} payload={{ id: row.id, status: "DRAFT" }} variant="ghost" successMessage="از انتشار خارج شد."
          confirm={{ title: "خروج از انتشار", body: "این نوع از کاتالوگ کارکنان پنهان می‌شود؛ اسناد ساخته‌شده باقی می‌مانند." }}>
          <Undo2 />خروج از انتشار
        </ActionButton>
      )}
      {row.status !== "ARCHIVED" && (
        <ActionButton action={setPetitionTypeStatusAction} payload={{ id: row.id, status: "ARCHIVED" }} variant="danger" successMessage="بایگانی شد."
          confirm={{ title: "بایگانی نوع دادخواست", body: "نوع بایگانی‌شده در کاتالوگ نمایش داده نمی‌شود و سند تازه از آن ساخته نمی‌شود." }}>
          <Archive />بایگانی
        </ActionButton>
      )}
    </>
  );
}

export default async function PetitionTypePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ caseId?: string }> }) {
  const user = await requirePagePerm("draft.view");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const row = await loadType(id, user);
  const spec = toSpec(row);
  const manager = can(user, MANAGE);
  const canCreate = can(user, "draft.create") && row.status !== "ARCHIVED";
  const [rule, caseRow, recent] = await Promise.all([
    row.deadlineRuleKey ? db.deadlineRule.findFirst({ where: { key: row.deadlineRuleKey, isActive: true } }) : null,
    sp.caseId ? db.case.findFirst({ where: { id: sp.caseId, AND: [caseScope(user)] }, select: { id: true, number: true, title: true } }) : null,
    db.legalDraft.findMany({ where: { petitionTypeId: id, archivedAt: null, AND: [draftScope(user)] }, orderBy: { updatedAt: "desc" }, take: RECENT, select: { id: true, code: true, title: true, status: true, updatedAt: true } }),
  ]);
  const [firstSide, secondSide] = sideLabels(spec);
  const lawCode = row.lawCode ?? ACP;
  const lawRequirements = spec.requirements.flatMap((r) => ("law" in r ? [r.law] : []));
  const articles = [...new Set([...row.articleRefs, ...(row.source === "FORM" ? FORM_ARTICLES : [])])].sort((a, b) => Number(a) - Number(b));
  const blanks = userBlanks(spec);
  return (
    <>
      <PageHeader title={row.title} subtitle={PETITION_KIND[row.kind]?.hint}
        crumbs={[{ label: "دادخواست‌ها", href: "/petitions" }, { label: PETITION_KIND[row.kind]?.label ?? row.kind, href: `/petitions?kind=${row.kind}` }, { label: row.category }]}
        meta={<>
          <Seal tone={row.source === "LAW" ? "warning" : "info"}>{PETITION_SOURCE[row.source] ?? row.source}</Seal>
          {row.formCode && <span className="mono-code">{row.formCode}</span>}
          {row.valueType && <Seal>{VALUE_TYPE[row.valueType] ?? row.valueType}</Seal>}
          {row.status !== "PUBLISHED" && <StatusSeal map={PETITION_TYPE_STATUS} value={row.status} />}
        </>}
        actions={manager && <ManagerActions row={row} />} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {row.status === "DRAFT" && <Notice tone="warning" title="منتشرنشده">این نوع فقط برای مدیران دیده می‌شود. پیش از انتشار، متن و الزام‌ها را با فرم اصلی تطبیق دهید.</Notice>}
          {row.source === "LAW" && (
            <Notice tone="warning" title={row.sourceLabel ?? "برگرفته از متن قانون"}>
              این نوع تا رسیدن فرم رسمی، از متن مواد قانون آیین دادرسی مدنی ساخته شده است. هر الزام به ماده و عبارت دقیق متن قانون پیوند دارد؛ متن شرح خواسته پیش‌نویس عمومی است و پیش از تقدیم باید بازبینی شود.
            </Notice>
          )}
          <Panel title="مرجع رسیدگی و اشخاص" icon={<Gavel />}>
            <DL items={[
              { label: "مرجع رسیدگی", value: row.court },
              { label: "طرفین برگ", value: `${firstSide} / ${secondSide}` },
              { label: "مبنای صلاحیت", value: row.courtBasis },
              { label: "اشخاص مجاز به تقدیم", value: row.eligible },
              { label: "خوانده", value: row.defendant },
              { label: "بهای خواسته", value: spec.valueOptions.length > 0 && spec.valueOptions.map((o) => o.label).join("، ") },
            ].filter((i) => i.value)} />
          </Panel>
          <Panel title={`دلایل و منضمات (${faNum(row.evidence.length)})`} icon={<ListChecks />}>
            {row.evidence.length === 0 ? <p className="text-sm text-ink-3">برای این نوع دلیل مشخصی در فرم نیامده است.</p> : (
              <ul className="flex flex-col divide-y divide-line">
                {row.evidence.map((e) => {
                  const seal = REQUIRED_SEAL[String(evidenceRequired(spec, e))];
                  return (
                    <li key={e} className="flex items-start justify-between gap-3 py-2 text-sm leading-7">
                      <span>{e}</span>{seal && <Seal tone={seal.tone}>{seal.label}</Seal>}
                    </li>
                  );
                })}
              </ul>
            )}
            {row.evidenceInfo.length > 0 && <div className="mt-3 rounded-ctl bg-surface-2 p-3"><Items items={row.evidenceInfo} empty="" /></div>}
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="تحقیقات و اقدامات"><Items items={row.investigations} empty="موردی در فرم نیامده است." /></Panel>
            <Panel title="خواسته‌های فرعی"><Items items={row.ancillary} empty="موردی در فرم نیامده است." /></Panel>
          </div>
          {row.fees.length > 0 && <Panel title="هزینه‌ها"><Items items={row.fees} empty="" /><p className="mt-2 text-xs text-ink-3">مبلغ هزینه دادرسی را با تعرفه سال جاری محاسبه کنید؛ سامانه تعرفه را محاسبه نمی‌کند.</p></Panel>}
          <Panel title="شرح خواسته (متن قالب)" icon={<ScrollText />}>
            <div className="sheet-paper rounded-card p-5"><TemplateText text={row.bodyTemplate} className="legal-doc text-[15px]" /></div>
            {blanks.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-sm font-medium text-ink-2">جاهایی که در استودیو پر می‌شود ({faNum(blanks.length)})</p>
                <div className="flex flex-wrap gap-1.5">{blanks.map((b) => <Seal key={b}>{b}</Seal>)}</div>
              </div>
            )}
            {spec.optionalClauses.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-sm font-medium text-ink-2">بندهای اختیاری</p>
                {spec.optionalClauses.map((c) => (
                  <div key={c.condition} className="rounded-ctl border border-line p-3 text-sm leading-7"><span className="font-bold">{c.condition}:</span> {c.text}</div>
                ))}
              </div>
            )}
          </Panel>
          {lawRequirements.length > 0 && (
            <Panel title="الزام‌های قانونی" icon={<BookOpenText />} bodyClass="p-0">
              <div className="tbl-scroll">
                <table className="tbl">
                  <caption className="sr-only">الزام‌های قانونی این نوع دادخواست با ماده و عبارت متن قانون</caption>
                  <thead><tr><th scope="col">الزام</th><th scope="col">ماده</th><th scope="col">عبارت متن قانون</th></tr></thead>
                  <tbody>
                    {lawRequirements.map((r) => (
                      <tr key={`${r.article}-${r.label}`}>
                        <td className="font-medium">{r.label}</td>
                        <td><Link href={articleHref(lawCode, r.article)} className="whitespace-nowrap text-lapis hover:underline">ماده {toFaDigits(r.article)}</Link></td>
                        <td className="text-ink-2">«{r.anchor}»</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
          {row.notes && <Notice title="یادداشت">{row.notes}</Notice>}
        </div>
        <aside className="flex flex-col gap-4">
          <Panel title="تنظیم دادخواست" icon={<FilePen />}>
            {canCreate ? (
              <>
                <p className="mb-3 text-sm leading-7 text-ink-2">با انتخاب پرونده، طرفین و وکیل از پرونده و مراجعه‌کننده پر می‌شوند. سپس در استودیو هر بخش را کامل و با مواد ۵۱ و ۵۳ بررسی کنید.</p>
                <SmartForm cols={1} action={createPetitionAction} hidden={{ petitionTypeId: row.id }} initial={{ caseId: caseRow?.id ?? "" }}
                  submitLabel="تنظیم و ورود به استودیو" successMessage="سند دادخواست ساخته شد." successHref="/drafts/{id}/petition"
                  fields={[
                    { name: "caseId", label: "پرونده", type: "lookup", lookup: "case", lookupLabel: caseRow ? `${caseRow.number} — ${caseRow.title}` : undefined, hint: "اختیاری؛ برای پر شدن طرفین" },
                    { name: "clientId", label: "مراجعه‌کننده (بدون پرونده)", type: "lookup", lookup: "client", hint: "اگر پرونده انتخاب شود، مراجعه‌کننده پرونده به کار می‌رود." },
                    { name: "title", label: "عنوان سند", placeholder: row.title },
                  ]} />
              </>
            ) : <p className="text-sm text-ink-3">{row.status === "ARCHIVED" ? "این نوع بایگانی شده است." : "برای تنظیم دادخواست، مجوز تنظیم سند حقوقی لازم است."}</p>}
          </Panel>
          {rule && (
            <Panel title="مهلت تقدیم" icon={<CalendarClock />}>
              <p className="font-bold">{rule.title}</p>
              <p className="mt-1 text-sm leading-7 text-ink-2">{rule.basis}</p>
              {rule.description && <p className="mt-1 text-sm leading-7 text-ink-2">{rule.description}</p>}
              <div className="mt-2"><Seal tone={rule.verified ? "success" : "warning"}>{rule.verified ? "قاعده تأییدشده" : "قاعده تأییدنشده — پیش از اتکا بازبینی شود"}</Seal></div>
              <p className="mt-2 text-xs text-ink-3">روز آخر مهلت در استودیو از روی تاریخ ابلاغ محاسبه می‌شود.</p>
            </Panel>
          )}
          {articles.length > 0 && (
            <Panel title="مواد مرتبط" icon={<BookOpenText />}>
              <div className="flex flex-wrap gap-1.5">
                {articles.map((n) => <Link key={n} href={articleHref(lawCode, n)} className="rounded-full border border-line px-3 py-1 text-sm hover:border-lapis/50 hover:text-lapis">ماده {toFaDigits(n)}</Link>)}
              </div>
              <p className="mt-2 text-xs text-ink-3">قانون آیین دادرسی مدنی؛ متن واردشده تا تأیید مسئول حقوقی «تأییدنشده» است.</p>
            </Panel>
          )}
          <Panel title="منبع">
            <DL cols={1} items={[
              { label: "خاستگاه", value: row.sourceLabel ?? PETITION_SOURCE[row.source] },
              { label: "کد فرم", value: row.formCode && <span className="mono-code">{row.formCode}</span> },
              { label: "انتشار", value: row.publishedAt && formatJalali(row.publishedAt, "datetime") },
              { label: "آخرین ویرایش دستی", value: row.editedAt && formatJalali(row.editedAt, "datetime") },
            ]} />
            {row.sourceFileKey && (
              <a href={`/api/petitions/${row.id}/form`} target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-lapis hover:underline">
                <FileDown className="size-4" aria-hidden />فرم PDF اصلی
              </a>
            )}
          </Panel>
          {recent.length > 0 && (
            <Panel title="اسناد تنظیم‌شده با این نوع" bodyClass="p-0">
              <ul>
                {recent.map((d) => (
                  <li key={d.id} className="border-b border-line last:border-0">
                    <Link href={`/drafts/${d.id}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-ink/[0.03]">
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{d.title}</span><span className="text-xs text-ink-3"><span className="mono-code">{d.code}</span> · {formatJalali(d.updatedAt, "datetime")}</span></span>
                      <StatusSeal map={DRAFT_STATUS} value={d.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}
