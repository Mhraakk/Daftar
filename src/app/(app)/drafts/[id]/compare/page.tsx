import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page";
import { requirePagePerm } from "@/lib/auth/guard";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { diffHtml } from "@/lib/diff";
import { formatJalali } from "@/lib/jalali";
import { faNum } from "@/lib/text";
import { draftScope } from "@/server/access";

export const metadata = { title: "مقایسه نسخه‌ها" };

export default async function ComparePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const user = await requirePagePerm("draft.view");
  const { id } = await params;
  const sp = await searchParams;
  const d = await db.legalDraft.findFirst({ where: { id, AND: [draftScope(user)] }, include: { versions: { orderBy: { versionNo: "asc" } } } });
  if (!d || d.versions.length === 0) notFound();
  const nums = d.versions.map((v) => v.versionNo);
  const b = nums.includes(Number(sp.b)) ? Number(sp.b) : nums.at(-1)!;
  const a = nums.includes(Number(sp.a)) ? Number(sp.a) : nums[Math.max(0, nums.indexOf(b) - 1)];
  const va = d.versions.find((v) => v.versionNo === a)!, vb = d.versions.find((v) => v.versionNo === b)!;
  const lines = diffHtml(va.contentHtml, vb.contentHtml);
  const added = lines.filter((l) => l.type === "add").length, removed = lines.filter((l) => l.type === "del").length;
  return (
    <>
      <PageHeader title="مقایسه نسخه‌ها" crumbs={[{ label: "اسناد حقوقی", href: "/drafts" }, { label: d.code, href: `/drafts/${id}` }, { label: "مقایسه" }]}
        subtitle={`${d.title} — ${faNum(added)} بند افزوده، ${faNum(removed)} بند حذف‌شده`} />
      <form className="panel mb-4 flex flex-wrap items-end gap-3 p-3" action={`/drafts/${id}/compare`}>
        {[["a", a, "نسخه مبنا"], ["b", b, "نسخه مقایسه"]].map(([n, val, l]) => (
          <label key={String(n)} className="block w-full sm:w-auto"><span className="mb-1 block text-sm text-ink-2">{l}</span>
            <select name={String(n)} defaultValue={String(val)} className="input w-full sm:w-auto sm:min-w-[220px] sm:max-w-md">{d.versions.map((v) => <option key={v.versionNo} value={v.versionNo}>نسخه {faNum(v.versionNo)} — {formatJalali(v.createdAt, "datetime")}{v.note ? ` — ${v.note}` : ""}</option>)}</select></label>
        ))}
        <button className="h-10 rounded-md bg-lapis px-4 font-medium text-on-lapis hover:bg-lapis-600">مقایسه</button>
      </form>
      <div className="panel p-2" dir="rtl">
        {lines.length === 0 ? <p className="p-6 text-center text-ink-3">هر دو نسخه خالی‌اند.</p> : lines.map((l, i) => (
          <p key={i} className={cn("rounded px-3 py-1.5 leading-8", l.type === "add" && "bg-sabz-50 text-sabz", l.type === "del" && "bg-mohr-50 text-mohr line-through decoration-mohr/40")}>
            <span className="me-2 inline-block w-4 font-bold" aria-label={l.type === "add" ? "افزوده" : l.type === "del" ? "حذف‌شده" : undefined}>{l.type === "add" ? "+" : l.type === "del" ? "−" : ""}</span>{l.text}
          </p>
        ))}
      </div>
    </>
  );
}
