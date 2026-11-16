import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, BookOpenText, FileText, ListTree, Search } from "lucide-react";
import { SourceCard } from "@/components/research/source-card";
import { ActionButton } from "@/components/ui/action-button";
import { buttonClass } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { faNum, toFaDigits } from "@/lib/text";
import { articleNumberQuery, searchLibrary, sectionRange, type LawHeading } from "@/server/legal-library";
import { verifyLawAction } from "../../actions";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const law = await db.law.findUnique({ where: { code: (await params).code }, select: { shortTitle: true, title: true } });
  return { title: law?.shortTitle ?? law?.title ?? "قانون" };
}

const RESULT_LIMIT = 60;
const INDENT: Record<string, string> = { BOOK: "", GENERAL: "ps-2", PART: "ps-2", CHAPTER: "ps-5", SECTION: "ps-8", OTHER: "ps-2" };

/** عمیق‌ترین عنوانی که ماده در محدوده آن است */
function headingOfArticle(headings: LawHeading[], no: number, last: number): number {
  return headings.reduce((best, h, i) => {
    if (h.level === "BOOK" || h.firstArticle === null) return best;
    const r = sectionRange(headings, i, last);
    return no >= r.from && no <= r.to ? i : best;
  }, -1);
}

export default async function LawPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePerm("research.use");
  const { code } = await params;
  const sp = await searchParams;
  const law = await db.law.findUnique({ where: { code } });
  if (!law) notFound();
  const headings = (law.headings ?? []) as unknown as LawHeading[];
  const last = law.articleCount;
  const q = (sp.q ?? "").trim();
  const jump = sp.a ? Number(articleNumberQuery(sp.a)) : null;
  const fallback = headings.findIndex((h) => h.level !== "BOOK" && h.firstArticle !== null);
  const requested = sp.h !== undefined ? Number(sp.h) : fallback;
  const selected = jump ? headingOfArticle(headings, jump, last) : requested;
  const index = headings[selected] ? selected : fallback;
  const range = index >= 0 ? sectionRange(headings, index, last) : { from: 1, to: last };
  const [articles, verifier] = await Promise.all([
    q ? searchLibrary(q, { lawCode: code, take: RESULT_LIMIT })
      : db.legalSource.findMany({ where: { lawCode: code, orderNo: { gte: range.from, lte: range.to } }, orderBy: { orderNo: "asc" } }),
    law.verifiedById ? db.user.findUnique({ where: { id: law.verifiedById }, select: { fullName: true } }) : null,
  ]);
  const manage = can(user, "legal_source.manage");
  const current = headings[index];
  return (
    <>
      <PageHeader title={law.title} crumbs={[{ label: "پژوهش و منابع", href: "/research" }, { label: law.shortTitle ?? law.code }]}
        subtitle={`مصوب ${toFaDigits(law.approvedAt ?? "—")} · ${faNum(law.articleCount)} ماده`}
        meta={<>
          {law.verifiedAt ? <Seal tone="success"><BadgeCheck className="size-3" aria-hidden />نسخه تأییدشده توسط {verifier?.fullName ?? "—"} — {formatJalali(law.verifiedAt)}</Seal>
            : <Seal tone="warning">نسخه تأییدنشده</Seal>}
          <Seal tone="neutral">{law.sourceName}</Seal>
        </>}
        actions={<>
          {law.sourceFileKey && <a className={buttonClass("secondary")} href={`/api/library/laws/${law.code}/source`} target="_blank" rel="noopener"><FileText />PDF منبع</a>}
          {manage && !law.verifiedAt && (
            <ActionButton action={verifyLawAction} payload={{ code: law.code, verified: true }} variant="primary" successMessage="نسخه قانون تأیید شد."
              confirm={{ title: "تأیید نسخه قانون", body: "تأیید می‌کنید متن همه مواد با متن رسمی تطبیق داده شده است؟ این اقدام به نام شما در تاریخچه ثبت می‌شود." }}><BadgeCheck />تأیید نسخه قانون</ActionButton>
          )}
        </>} />
      {!law.verifiedAt && <div className="mb-4"><Notice tone="warning" title="متن تأییدنشده">پیش از استناد در لایحه یا دادخواست، ماده را با متن رسمی تطبیق دهید. برای تطبیق کنار هم، روی «صفحه … منبع» هر ماده بزنید.</Notice></div>}
      <div className="mb-4"><FilterBar searchPlaceholder="جست‌وجو در متن این قانون یا شماره ماده…" /></div>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Panel title="فهرست" icon={<ListTree />} className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto" bodyClass="p-2">
          <nav aria-label="فهرست قانون" className="flex flex-col text-sm">
            {headings.map((h, i) => h.level === "BOOK"
              ? <span key={i} className="px-2 pb-1 pt-3 text-xs font-bold text-ink-3">{h.title}</span>
              : (
                <Link key={i} href={`/research/laws/${law.code}?h=${i}`} aria-current={i === index && !q ? "true" : undefined}
                  className={cn("rounded-md px-2 py-1.5 leading-6 hover:bg-surface-2", INDENT[h.level], i === index && !q && "bg-lapis/10 font-bold text-lapis")}>
                  {h.title}{h.firstArticle && <span className="ms-1 text-2xs text-ink-3">(از ماده {faNum(h.firstArticle)})</span>}
                </Link>
              ))}
          </nav>
        </Panel>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              {q ? <><Search className="size-4 text-firuze" />نتایج «{q}» ({faNum(articles.length)})</> : <><BookOpenText className="size-4 text-firuze" />{current?.title ?? law.title}</>}
            </h2>
            {!q && <span className="text-xs text-ink-3">مواد {faNum(range.from)} تا {faNum(range.to)}</span>}
          </div>
          {articles.length === 0 && <EmptyState icon={<Search />} title="ماده‌ای پیدا نشد" hint="واژه دیگری امتحان کنید." />}
          <div className="flex flex-col gap-3" data-testid="law-articles">
            {articles.map((a) => <SourceCard key={a.id} s={a} anchor showHeading={!!q} snippet={q && "snippet" in a ? String(a.snippet) : undefined} />)}
          </div>
        </div>
      </div>
    </>
  );
}
