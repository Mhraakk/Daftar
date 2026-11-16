import { Megaphone, MessagesSquare, PenSquare, Star } from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, LinkTabs, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { relativeTime } from "@/lib/jalali";
import { faNum } from "@/lib/text";
import { userNames } from "@/server/access";

export const metadata = { title: "پیام‌ها" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ box?: string; page?: string }> }) {
  const user = await requirePagePerm("message.send");
  const sp = await searchParams;
  const box = sp.box === "sent" ? "sent" : sp.box === "important" ? "important" : "inbox";
  const page = Math.max(1, Number(sp.page ?? 1));
  const where = box === "sent" ? { senderId: user.id } : { recipients: { some: { userId: user.id, archivedAt: null } }, ...(box === "important" ? { important: true } : {}) };
  const [total, rows, unread] = await Promise.all([
    db.message.count({ where }),
    db.message.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 20, include: { recipients: { select: { userId: true, readAt: true } }, _count: { select: { attachments: true } } } }),
    db.messageRecipient.count({ where: { userId: user.id, readAt: null, archivedAt: null } }),
  ]);
  const names = await userNames(rows.flatMap((m) => [m.senderId, ...(box === "sent" ? m.recipients.slice(0, 3).map((r) => r.userId) : [])]));
  return (
    <>
      <PageHeader title="پیام‌ها و اطلاعیه‌ها" subtitle={unread ? `${faNum(unread)} پیام خوانده‌نشده` : "همه پیام‌ها خوانده شده است."}
        actions={<LinkButton href="/messages/new" variant="primary"><PenSquare />{can(user, "announcement.send") ? "پیام / اطلاعیه جدید" : "پیام جدید"}</LinkButton>} />
      <LinkTabs active={box} tabs={[{ key: "inbox", label: "دریافتی", href: "/messages", count: unread ? faNum(unread) : undefined }, { key: "important", label: "مهم", href: "/messages?box=important" }, { key: "sent", label: "ارسالی", href: "/messages?box=sent" }]} />
      <div className="panel">
        {rows.length === 0 ? <EmptyState icon={<MessagesSquare />} title="پیامی وجود ندارد" /> : (
          <ul>
            {rows.map((m) => {
              const mine = m.recipients.find((r) => r.userId === user.id);
              const isUnread = box !== "sent" && mine && !mine.readAt;
              const readCount = m.recipients.filter((r) => r.readAt).length;
              return (
                <li key={m.id} className="border-b border-line last:border-0">
                  <Link href={`/messages/${m.id}`} className={cn("flex items-center gap-3 px-4 py-3 hover:bg-surface-2", isUnread && "bg-firuze-50/40")}>
                    <span className={cn("size-2 shrink-0 rounded-full", isUnread ? "bg-firuze" : "bg-transparent")} />
                    {m.isAnnouncement ? <Megaphone className="size-4 shrink-0 text-zafaran" /> : m.important ? <Star className="size-4 shrink-0 text-mohr" /> : <span className="size-4 shrink-0" />}
                    <span className="w-40 shrink-0 truncate text-sm">{box === "sent" ? `به: ${m.recipients.slice(0, 3).map((r) => names[r.userId]).filter(Boolean).join("، ")}${m.recipients.length > 3 ? " و…" : ""}` : names[m.senderId]}</span>
                    <span className="min-w-0 flex-1 truncate"><span className={cn(isUnread && "font-bold")}>{m.subject}</span><span className="text-ink-3"> — {m.body.slice(0, 90)}</span></span>
                    {box === "sent" && <span className="num shrink-0 text-xs text-ink-3">خوانده‌شده {faNum(readCount)}/{faNum(m.recipients.length)}</span>}
                    <span className="shrink-0 text-xs text-ink-3">{relativeTime(m.createdAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={page} pageSize={20} total={total} params={{ box: box === "inbox" ? undefined : box }} basePath="/messages" />
      </div>
    </>
  );
}
