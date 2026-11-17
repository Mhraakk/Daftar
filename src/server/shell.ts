// داده پوسته برنامه: شمار نشان‌های ناوبری، اعلان‌های خوانده‌نشده و رکوردهای اخیر/سنجاق‌شده هر کاربر.
// بازدید از صفحه پرونده، مراجعه‌کننده، سند یا ماده قانون از روی مسیر شناخته و با سنجش دسترسی ثبت می‌شود.
import type { SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { caseScope, clientScope, draftScope } from "./access";

export interface ShellBadges { cartable: number; tasks: number; messages: number; deadlines: number; reviews: number }
export interface RecentItem { id: string; entityType: string; title: string; subtitle: string | null; link: string; pinned: boolean }

const KEEP_RECENTS = 40;
const SHOW_RECENTS = 12;

export async function shellBadges(user: SessionUser, now = new Date()): Promise<ShellBadges & { unread: number }> {
  const [cartable, tasks, messages, deadlines, reviews, unread] = await Promise.all([
    db.referral.count({ where: { toUserId: user.id, status: "PENDING" } }),
    db.task.count({ where: { assigneeId: user.id, status: { in: ["TODO", "REJECTED"] } } }),
    db.messageRecipient.count({ where: { userId: user.id, readAt: null, archivedAt: null } }),
    db.deadline.count({ where: { assigneeId: user.id, status: "OPEN", dueAt: { lt: now } } }),
    db.legalDraft.count({ where: { reviewerId: user.id, status: "IN_REVIEW" } }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return { cartable, tasks, messages, deadlines, reviews, unread };
}

export async function listRecents(user: SessionUser, take = SHOW_RECENTS): Promise<RecentItem[]> {
  return db.userRecent.findMany({
    where: { userId: user.id },
    orderBy: [{ pinned: "desc" }, { visitedAt: "desc" }],
    take,
    select: { id: true, entityType: true, title: true, subtitle: true, link: true, pinned: true },
  });
}

interface Visit { entityType: string; entityId: string; title: string; subtitle: string | null; link: string }

// /cases/<id>, /clients/<id>, /drafts/<id> and /research/library/<id> (an entity page, not a sub-page):
// matches "/cases/clx9a2b" (captures "cases", "clx9a2b"), rejects "/cases/new/x" and "/cases".
// https://regex101.com/?regex=%5E%5C%2F%28cases%7Cclients%7Cdrafts%7Cresearch%5C%2Flibrary%29%5C%2F%28%5Ba-z0-9%5D%7B8%2C40%7D%29%24&testString=%2Fcases%2Fclx9a2b3c4d5e6f7&flavor=javascript
const ENTITY_PATH = /^\/(cases|clients|drafts|research\/library)\/([a-z0-9]{8,40})$/;

const RESOLVERS: Record<string, (user: SessionUser, id: string) => Promise<Visit | null>> = {
  cases: async (user, id) => {
    const c = await db.case.findFirst({ where: { id, AND: [caseScope(user)] }, select: { title: true, number: true } });
    return c && { entityType: "case", entityId: id, title: c.title, subtitle: c.number, link: `/cases/${id}` };
  },
  clients: async (user, id) => {
    const c = await db.client.findFirst({ where: { id, AND: [clientScope(user)] }, select: { displayName: true, code: true } });
    return c && { entityType: "client", entityId: id, title: c.displayName, subtitle: c.code, link: `/clients/${id}` };
  },
  drafts: async (user, id) => {
    const d = await db.legalDraft.findFirst({ where: { id, AND: [draftScope(user)] }, select: { title: true, code: true } });
    return d && { entityType: "draft", entityId: id, title: d.title, subtitle: d.code, link: `/drafts/${id}` };
  },
  "research/library": async (user, id) => {
    if (!user.permissions.has("research.use")) return null;
    const s = await db.legalSource.findUnique({ where: { id }, select: { title: true, reference: true, articleNo: true } });
    return s && { entityType: "source", entityId: id, title: s.title, subtitle: s.articleNo ? `ماده ${s.articleNo}` : s.reference, link: `/research/library/${id}` };
  },
};

/** ثبت بازدید از صفحه یک رکورد (مسیرهای ناشناخته یا بی‌دسترسی نادیده گرفته می‌شوند) */
export async function recordVisit(user: SessionUser, path: string): Promise<boolean> {
  const m = ENTITY_PATH.exec(path);
  const resolve = m ? RESOLVERS[m[1]] : undefined;
  const visit = m && resolve ? await resolve(user, m[2]) : null;
  if (!visit) return false;
  await db.userRecent.upsert({
    where: { userId_entityType_entityId: { userId: user.id, entityType: visit.entityType, entityId: visit.entityId } },
    create: { userId: user.id, ...visit },
    update: { title: visit.title, subtitle: visit.subtitle, link: visit.link, visitedAt: new Date() },
  });
  const stale = await db.userRecent.findMany({ where: { userId: user.id, pinned: false }, orderBy: { visitedAt: "desc" }, skip: KEEP_RECENTS, select: { id: true } });
  if (stale.length) await db.userRecent.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  return true;
}

export async function setRecentPinned(user: SessionUser, id: string, pinned: boolean): Promise<void> {
  await db.userRecent.updateMany({ where: { id, userId: user.id }, data: { pinned } });
}
