// کاتالوگ دادخواست‌ها: بدوی، اعتراضی و طاری؛ جست‌وجو با نرمال‌سازی فارسی، دسته‌ها، پیشنهاد از روی پرونده و ورود فرم
import { FileInput, FilePlus2, GitBranchPlus, Gavel, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { ImportForms } from "@/components/petitions/import-forms";
import { EmptyState, LinkTabs, Notice, PageHeader, Panel } from "@/components/ui/page";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { PETITION_KIND, PETITION_SOURCE, PETITION_TYPE_STATUS, VALUE_TYPE } from "@/lib/labels";
import { faNum } from "@/lib/text";
import { caseScope } from "@/server/access";
import { catalogFacets, listPetitionTypes, suggestPetitionTypes, type CatalogRow } from "@/server/petitions/catalog";

export const metadata = { title: "دادخواست‌ها" };

type SP = { q?: string; kind?: string; category?: string; caseId?: string; status?: string };
const KIND_ICONS: Record<string, typeof FilePlus2> = { INITIAL: FilePlus2, OBJECTION: Gavel, INCIDENTAL: GitBranchPlus };
const TOP_CATEGORIES = 10;

function TypeCard({ row, caseId, manager }: { row: CatalogRow; caseId?: string; manager: boolean }) {
  const Icon = KIND_ICONS[row.kind] ?? FilePlus2;
  return (
    <Link href={`/petitions/${row.id}${caseId ? `?caseId=${caseId}` : ""}`} className="panel press group flex flex-col gap-3 p-4 transition-shadow hover:shadow-pop">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-ctl bg-lapis-50 text-lapis"><Icon className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-6 text-ink group-hover:text-lapis">{row.title}</p>
          <p className="mt-0.5 text-xs text-ink-3">{[PETITION_KIND[row.kind]?.label, row.category, row.court].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <Seal tone={row.source === "LAW" ? "warning" : "info"}>{PETITION_SOURCE[row.source] ?? row.source}</Seal>
        {row.valueType && <Seal>{VALUE_TYPE[row.valueType] ?? row.valueType}</Seal>}
        {row.deadlineRuleKey && <Seal tone="accent">مهلت‌دار</Seal>}
        {manager && row.status !== "PUBLISHED" && <StatusSeal map={PETITION_TYPE_STATUS} value={row.status} />}
      </div>
    </Link>
  );
}

export default async function PetitionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePagePerm("draft.view");
  const sp = await searchParams;
  const manager = can(user, "petition.manage");
  const kind = sp.kind && sp.kind in PETITION_KIND ? sp.kind : undefined;
  const caseRow = sp.caseId ? await db.case.findFirst({ where: { id: sp.caseId, AND: [caseScope(user)] }, select: { id: true, title: true, number: true } }) : null;
  const [rows, facets, suggestions] = await Promise.all([
    listPetitionTypes(user, { q: sp.q, kind, category: sp.category, status: sp.status }),
    catalogFacets(user),
    caseRow ? suggestPetitionTypes(user, caseRow.id) : Promise.resolve([]),
  ]);
  const query = (extra: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ q: sp.q, kind, category: sp.category, caseId: sp.caseId, ...extra }).filter((e): e is [string, string] => !!e[1]));
    return `/petitions${p.size ? `?${p}` : ""}`;
  };
  const total = Object.values(facets.kinds).reduce((a, b) => a + b, 0);
  const categories = facets.categories.filter((c) => !kind || c.kind === kind).slice(0, TOP_CATEGORIES);
  return (
    <>
      <PageHeader title="دادخواست‌ها" subtitle="نوع دادخواست را برگزینید؛ طرفین از پرونده پر می‌شود و هر بخش با ماده ۵۱ و ۵۳ قانون آیین دادرسی مدنی سنجیده می‌شود."
        actions={manager && <ImportForms />} />
      {caseRow && (
        <Panel title={`پیشنهاد برای پرونده ${caseRow.number}`} icon={<Sparkles />} className="mb-4">
          <p className="mb-3 text-sm text-ink-2">بر پایه عنوان و شرح پرونده «{caseRow.title}». پیشنهاد فقط راهنماست؛ انتخاب نهایی با شماست.</p>
          {suggestions.length === 0
            ? <p className="text-sm text-ink-3">واژه مشترکی با انواع دادخواست پیدا نشد؛ از فهرست زیر جست‌وجو کنید.</p>
            : (
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {suggestions.map((s) => (
                  <li key={s.row.id}>
                    <Link href={`/petitions/${s.row.id}?caseId=${caseRow.id}`} className="flex flex-col gap-1 rounded-ctl border border-line p-3 hover:border-lapis/50 hover:bg-lapis-50/40">
                      <span className="font-bold">{s.row.title}</span>
                      <span className="text-xs text-ink-3">هم‌خوانی: {s.matched.join("، ")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </Panel>
      )}
      <LinkTabs active={kind ?? "ALL"} tabs={[
        { key: "ALL", label: "همه", href: query({ kind: undefined, category: undefined }), count: faNum(total) },
        ...Object.entries(PETITION_KIND).map(([k, v]) => ({ key: k, label: v.label, href: query({ kind: k, category: undefined }), count: faNum(facets.kinds[k] ?? 0) })),
      ]} />
      <div className="my-4 flex flex-col gap-3">
        <form action="/petitions" className="flex max-w-xl items-center gap-2" role="search">
          {kind && <input type="hidden" name="kind" value={kind} />}
          {sp.caseId && <input type="hidden" name="caseId" value={sp.caseId} />}
          <label className="relative flex-1">
            <span className="sr-only">جست‌وجو در انواع دادخواست</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input name="q" defaultValue={sp.q ?? ""} placeholder="مثلاً «چک»، «مهریه»، «تجدیدنظر»" className="input ps-9" />
          </label>
          <button type="submit" className="h-10 rounded-ctl bg-lapis px-4 font-medium text-on-lapis">جست‌وجو</button>
        </form>
        {categories.length > 0 && (
          <nav aria-label="دسته‌ها" className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <Link key={`${c.kind}-${c.category}`} href={query({ category: sp.category === c.category ? undefined : c.category })}
                aria-current={sp.category === c.category ? "true" : undefined}
                className={sp.category === c.category ? "rounded-full bg-night px-3 py-1 text-sm text-on-night" : "rounded-full border border-line px-3 py-1 text-sm text-ink-2 hover:border-line-strong"}>
                {c.category} <span className="num text-xs opacity-70">{faNum(c.count)}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>
      {kind && kind !== "INITIAL" && (
        <div className="mb-4"><Notice tone="warning" title="برگرفته از متن قانون">این نوع‌ها تا رسیدن فرم رسمی، از متن مواد قانون آیین دادرسی مدنی ساخته شده‌اند؛ هر الزام به ماده‌اش پیوند دارد.</Notice></div>
      )}
      {rows.length === 0
        ? <EmptyState icon={<FileInput />} title="نوع دادخواستی با این مشخصات یافت نشد" hint="واژه دیگری را امتحان کنید یا پالایه‌ها را بردارید." />
        : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map((r) => <TypeCard key={r.id} row={r} caseId={caseRow?.id} manager={manager} />)}</div>}
    </>
  );
}
