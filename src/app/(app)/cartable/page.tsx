import { Inbox, MailPlus, Paperclip } from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { Seal, StatusSeal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { cn } from "@/lib/cn";
import { formatJalali, relativeDay } from "@/lib/jalali";
import { CORR_DIRECTION, CORR_STATUS, PRIORITY } from "@/lib/labels";
import { OPT } from "@/lib/options";
import { faNum } from "@/lib/text";
import { userNames } from "@/server/access";
import { cartableCounts, listCartable, type CartableBox } from "@/server/correspondence";

export const metadata = { title: "کارتابل" };
type SP = { box?: string; q?: string; priority?: string; page?: string };

const BOXES: { key: CartableBox; label: string; hint: string; count?: "inbox" | "returned" | "followup" }[] = [
  { key: "inbox", label: "کارتابل من", hint: "مکاتبات در دست اقدام شما", count: "inbox" },
  { key: "returned", label: "بازگشتی‌ها", hint: "برگشت‌خورده به شما", count: "returned" },
  { key: "followup", label: "در انتظار دیگران", hint: "ارجاع‌های شما که هنوز اقدام نشده", count: "followup" },
  { key: "referred", label: "ارجاع‌شده توسط من", hint: "همه ارجاع‌های ارسالی" },
  { key: "incoming", label: "نامه‌های وارده", hint: "" }, { key: "outgoing", label: "نامه‌های صادره", hint: "" }, { key: "internal", label: "مکاتبات داخلی", hint: "" },
  { key: "done", label: "اقدام‌شده", hint: "" }, { key: "archive", label: "بایگانی", hint: "" },
];

export default async function CartablePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePagePerm("correspondence.view");
  const sp = await searchParams;
  const box = (BOXES.find((b) => b.key === sp.box)?.key ?? "inbox") as CartableBox;
  const page = Math.max(1, Number(sp.page ?? 1));
  const [{ total, rows }, counts] = await Promise.all([listCartable(user, { box, q: sp.q, priority: sp.priority, page, pageSize: 20 }), cartableCounts(user)]);
  const names = await userNames(rows.flatMap((r) => [r.currentHolderId, r.createdById, r.referrals[0]?.fromUserId]));
  const now = new Date();
  return (
    <>
      <PageHeader title="کارتابل" subtitle={counts.unseen ? `${faNum(counts.unseen)} ارجاع دیده‌نشده دارید.` : "ارجاع دیده‌نشده‌ای ندارید."}
        actions={can(user, "correspondence.create") && <LinkButton href="/cartable/new" variant="primary"><MailPlus />ثبت مکاتبه</LinkButton>} />
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <nav className="panel h-fit p-2" aria-label="پوشه‌های کارتابل">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {BOXES.map((b) => (
              <li key={b.key}>
                <Link href={`/cartable?box=${b.key}`} aria-current={b.key === box ? "page" : undefined}
                  className={cn("flex items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 text-base", b.key === box ? "bg-firuze-50 font-bold text-firuze" : "text-ink-2 hover:bg-surface-2")}>
                  {b.label}{b.count && counts[b.count] > 0 && <span className="num rounded-full bg-ink/10 px-1.5 text-2xs">{faNum(counts[b.count])}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="panel min-w-0">
          <FilterBar searchPlaceholder="موضوع، شماره ثبت، فرستنده/گیرنده یا شماره نامه…" filters={[{ name: "priority", label: "اولویت", options: OPT.priority }]} />
          {rows.length === 0 ? <EmptyState icon={<Inbox />} title="موردی در این پوشه نیست" hint={BOXES.find((b) => b.key === box)?.hint} /> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>موضوع</th><th>شماره ثبت</th><th>نوع</th><th>{box === "inbox" || box === "returned" ? "ارجاع‌دهنده" : "دارنده فعلی"}</th><th>مهلت</th><th>وضعیت</th><th>ثبت</th></tr></thead>
                <tbody>
                  {rows.map((c) => {
                    const r = c.referrals[0];
                    const unseen = r?.status === "PENDING" && c.currentHolderId === user.id;
                    const late = c.deadline && c.deadline < now && ["REGISTERED", "IN_PROGRESS"].includes(c.status);
                    return (
                      <tr key={c.id}>
                        <td className="max-w-[360px]">
                          <Link href={`/cartable/${c.id}`} className={cn("flex items-center gap-2 hover:text-lapis", unseen ? "font-extrabold" : "font-medium")}>
                            {unseen && <span className="size-2 shrink-0 rounded-full bg-firuze" title="دیده‌نشده" />}<span className="truncate">{c.subject}</span>
                            {c._count.documents > 0 && <Paperclip className="size-3.5 shrink-0 text-ink-3" />}
                          </Link>
                          <span className="block truncate text-xs text-ink-3">{c.externalParty ?? "داخلی"}{r?.instruction && ` · دستور: ${r.instruction}`}</span>
                        </td>
                        <td><span className="mono-code">{c.refNumber}</span></td>
                        <td>{CORR_DIRECTION[c.direction]}{c.priority !== "NORMAL" && <span className="ms-1"><StatusSeal map={PRIORITY} value={c.priority} /></span>}</td>
                        <td>{box === "inbox" || box === "returned" ? names[r?.fromUserId ?? c.createdById] ?? "—" : names[c.currentHolderId ?? ""] ?? "—"}</td>
                        <td className={cn("num", late && "font-bold text-mohr")}>{c.deadline ? relativeDay(c.deadline, now) : "—"}</td>
                        <td>{r?.status === "RETURNED" ? <Seal tone="danger">بازگشتی</Seal> : <StatusSeal map={CORR_STATUS} value={c.status} />}</td>
                        <td className="num text-ink-2">{formatJalali(c.registeredAt, "date")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} pageSize={20} total={total} params={{ ...sp, box }} basePath="/cartable" />
        </div>
      </div>
    </>
  );
}
