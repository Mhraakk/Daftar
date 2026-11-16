import { CornerUpLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { requirePagePerm } from "@/lib/auth/guard";
import { NotFoundError } from "@/lib/errors";
import { formatJalali } from "@/lib/jalali";
import { faNum } from "@/lib/text";
import { userNames } from "@/server/access";
import { readMessage } from "@/server/messages";

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePerm("message.send");
  const { id } = await params;
  const m = await readMessage(id, user).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  const names = await userNames([m.senderId, ...m.replies.map((r) => r.senderId)]);
  const isSender = m.senderId === user.id;
  return (
    <>
      <PageHeader title={m.subject} crumbs={[{ label: "پیام‌ها", href: "/messages" }, { label: "پیام" }]}
        meta={<>{m.isAnnouncement && <Seal tone="warning">اطلاعیه</Seal>}{m.important && <Seal tone="danger">مهم</Seal>}<span className="text-sm text-ink-2">از <b>{names[m.senderId]}</b> · {formatJalali(m.createdAt, "datetime")}</span></>}
        actions={!isSender && <LinkButton href={`/messages/new?to=${m.senderId}&re=${encodeURIComponent(m.subject)}&parent=${m.id}`} variant="primary"><CornerUpLeft />پاسخ</LinkButton>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2"><p className="whitespace-pre-wrap leading-8">{m.body}</p>
          {m.attachments.length > 0 && <div className="mt-4 border-t border-line pt-3"><p className="mb-1 text-sm font-bold">پیوست‌ها</p><ul>{m.attachments.map((a) => <li key={a.id}><Link href={`/documents/${a.id}`} className="text-lapis hover:underline">{a.title}</Link></li>)}</ul></div>}
          {m.replies.length > 0 && <div className="mt-4 border-t border-line pt-3"><p className="mb-2 text-sm font-bold">پاسخ‌ها</p><ul className="flex flex-col gap-2">{m.replies.filter((r) => r.senderId === user.id || isSender).map((r) => <li key={r.id}><Link href={`/messages/${r.id}`} className="text-lapis hover:underline">{r.subject}</Link><span className="text-xs text-ink-3"> · {names[r.senderId]} · {formatJalali(r.createdAt, "datetime")}</span></li>)}</ul></div>}
        </Panel>
        <Panel title={`گیرندگان (${faNum(m.recipients.length)})`}>
          <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">{m.recipients.map((r) => (
            <li key={r.userId} className="flex items-center justify-between gap-2 text-sm"><span>{r.user.fullName}</span>{(isSender || r.userId === user.id) && <span className={r.readAt ? "text-xs text-sabz" : "text-xs text-ink-3"}>{r.readAt ? `خوانده‌شده · ${formatJalali(r.readAt, "date")}` : "خوانده‌نشده"}</span>}</li>
          ))}</ul>
        </Panel>
      </div>
    </>
  );
}
