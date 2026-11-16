import Link from "next/link";
import { BadgeCheck, BookOpenText, FileText, Library, Search, Trash2 } from "lucide-react";
import { SourceCard } from "@/components/research/source-card";
import { ActionButton } from "@/components/ui/action-button";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { formatJalali } from "@/lib/jalali";
import { SOURCE_STATUS } from "@/lib/labels";
import { faNum, toFaDigits } from "@/lib/text";
import { SOURCE_KINDS, articleNumberQuery, listLaws, listResearch, searchLibrary } from "@/server/legal-library";
import { deleteResearchAction, verifyLawAction } from "./actions";

export const metadata = { title: "پژوهش و منابع حقوقی" };

const RECENT_RESEARCH = 12;
const RESULT_LIMIT = 40;

export default async function ResearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePerm("research.use");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const filtered = !!(q || sp.kind || sp.status);
  const articleQuery = articleNumberQuery(q);
  const [laws, results, research] = await Promise.all([
    listLaws(),
    filtered ? searchLibrary(q, { kind: sp.kind, status: sp.status, take: RESULT_LIMIT }) : Promise.resolve([]),
    listResearch(user, { take: RECENT_RESEARCH }),
  ]);
  const manage = can(user, "legal_source.manage");
  return (
    <>
      <PageHeader title="پژوهش و منابع حقوقی" subtitle="متن قوانین واردشده، منابع داخلی دفتر و سوابق پژوهش پرونده‌ها — هر منبع با وضعیت اعتبار و تأیید"
        actions={<LinkButton href="/research/library" variant="secondary"><Library />کتابخانه منابع</LinkButton>} />
      <div className="mb-4">
        <FilterBar searchPlaceholder="جست‌وجو در متن مواد و منابع، یا شماره ماده (مثلاً «ماده ۵۱»)…" filters={[
          { name: "kind", label: "نوع منبع", options: Object.entries(SOURCE_KINDS).map(([value, label]) => ({ value, label })) },
          { name: "status", label: "وضعیت", options: Object.entries(SOURCE_STATUS).map(([value, m]) => ({ value, label: m.label })) },
        ]} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          {filtered ? (
            <Panel title={`نتایج جست‌وجو (${faNum(results.length)})`} icon={<Search />}>
              {results.length === 0
                ? <EmptyState icon={<Search />} title="منبعی پیدا نشد" hint="واژه دیگری امتحان کنید یا شماره ماده را بنویسید." />
                : <div className="flex flex-col gap-3" data-testid="library-results">{results.map((r) => <SourceCard key={r.id} s={r} snippet={q && !articleQuery ? r.snippet : undefined} showHeading />)}</div>}
              {results.length === RESULT_LIMIT && <p className="mt-3 text-xs text-ink-3">نتایج بیشتری هست؛ جست‌وجو را دقیق‌تر کنید.</p>}
            </Panel>
          ) : (
            <Panel title="قوانین در کتابخانه" icon={<BookOpenText />}>
              {laws.length === 0 && <EmptyState icon={<BookOpenText />} title="هنوز قانونی وارد نشده است" hint="مدیر سامانه با «npm run acp:import» متن قانون آیین دادرسی مدنی را وارد می‌کند." />}
              <div className="grid gap-3 md:grid-cols-2">
                {laws.map((l) => (
                  <div key={l.code} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4" data-testid="law-card">
                    <Link href={`/research/laws/${l.code}`} className="text-md font-bold leading-7 hover:text-lapis">{l.title}</Link>
                    <p className="text-xs text-ink-3">مصوب {toFaDigits(l.approvedAt ?? "—")} · {faNum(l.total)} ماده · {faNum(l.repealedCount)} ماده منسوخ</p>
                    <div className="flex flex-wrap gap-1">
                      {l.verifiedAt ? <Seal tone="success"><BadgeCheck className="size-3" aria-hidden />نسخه تأییدشده — {formatJalali(l.verifiedAt)}</Seal>
                        : <Seal tone="warning">تأییدنشده ({faNum(l.verifiedCount)} از {faNum(l.total)} ماده)</Seal>}
                      <Seal tone="neutral">{l.sourceName}</Seal>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      <LinkButton href={`/research/laws/${l.code}`} size="sm" variant="primary"><BookOpenText />مرور قانون</LinkButton>
                      {l.sourceFileKey && <a className={buttonClass("ghost", "sm")} href={`/api/library/laws/${l.code}/source`} target="_blank" rel="noopener"><FileText />PDF منبع</a>}
                      {manage && (l.verifiedAt
                        ? <ActionButton action={verifyLawAction} payload={{ code: l.code, verified: false }} size="sm" variant="ghost" successMessage="تأیید نسخه قانون لغو شد."
                            confirm={{ title: "لغو تأیید نسخه قانون", body: "همه مواد این قانون «تأییدنشده» می‌شوند." }}>لغو تأیید</ActionButton>
                        : <ActionButton action={verifyLawAction} payload={{ code: l.code, verified: true }} size="sm" successMessage="نسخه قانون تأیید شد."
                            confirm={{ title: "تأیید نسخه قانون", body: "با این کار تأیید می‌کنید متن همه مواد این قانون با متن رسمی (روزنامه رسمی یا سامانه رسمی قوانین) تطبیق داده شده است. این اقدام به نام شما در تاریخچه ثبت می‌شود." }}>
                            <BadgeCheck />تأیید نسخه قانون</ActionButton>)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4"><Notice tone="info" title="اعتبار متن">متن قانون از PDF ارائه‌شده دفتر استخراج و با OCR صفحه‌ها تطبیق داده شده است؛ هر اصلاح در گزارش استخراج ثبت است. تا وقتی مسئول حقوقی نسخه را با متن رسمی تطبیق و تأیید نکند، مواد «تأییدنشده» نمایش داده می‌شوند. مواد منسوخ هرگز برای استناد پیشنهاد نمی‌شوند.</Notice></div>
            </Panel>
          )}
        </div>
        <Panel title="سوابق پژوهش اخیر" icon={<Search />}>
          {research.length === 0 && <p className="text-sm text-ink-3">هنوز موردی در پرونده‌ها ذخیره نشده است. از صفحه هر منبع می‌توانید آن را به پرونده بیفزایید.</p>}
          <ul className="flex flex-col divide-y divide-line">
            {research.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  {r.sourceUrl?.startsWith("/") ? <Link href={r.sourceUrl} className="font-bold hover:text-lapis">{r.title}</Link> : <span className="font-bold">{r.title}</span>}
                  <p className="text-xs text-ink-3">{r.case && <Link className="text-lapis hover:underline" href={`/cases/${r.case.id}`}>{r.case.title}</Link>} · {formatJalali(r.createdAt)}</p>
                  {r.note && <p className="mt-1 text-xs text-ink-2">{r.note}</p>}
                </div>
                {(r.userId === user.id || can(user, "case.view_all")) && (
                  <ActionButton action={deleteResearchAction} payload={{ id: r.id }} size="icon" variant="ghost" aria-label="حذف" successMessage="حذف شد."
                    confirm={{ title: "حذف سابقه پژوهش", body: "این مورد از سوابق پژوهش پرونده حذف می‌شود." }}><Trash2 /></ActionButton>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
