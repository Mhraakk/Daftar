// جست‌وجوی یکپارچه داخلی با رعایت سطح دسترسی: نامزدها از نمایه واکشی و سپس با قواعد دامنه هر موجودیت پالایش می‌شوند.
import { Prisma } from "@prisma/client";
import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { normalizeFa } from "@/lib/text";
import { caseScope, clientScope, corrScope, deadlineScope, documentScope, draftScope, taskScope } from "./access";

export const ENTITY_LABELS: Record<string, string> = {
  client: "مراجعه‌کننده", case: "پرونده", document: "سند", correspondence: "مکاتبه", task: "وظیفه", draft: "سند حقوقی",
  template: "قالب", note: "یادداشت", legal_source: "منبع حقوقی", deadline: "مهلت",
};

export interface SearchHit {
  id: string; type: string; typeLabel: string; title: string; subtitle: string | null; snippet: string | null; link: string;
  score: number; updatedAt: Date; source: string; caseId: string | null;
}

interface Row { entityType: string; entityId: string; title: string; subtitle: string | null; body: string; norm: string; link: string; caseId: string | null; updatedAt: Date; score: number }

function snippetOf(body: string, terms: string[]): string | null {
  if (!body) return null;
  const nb = normalizeFa(body);
  const pos = terms.map((t) => nb.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (pos === undefined) return body.slice(0, 160);
  // موقعیت در متن نرمال‌شده تقریبی است؛ برای نمایش کافی است
  const start = Math.max(0, Math.min(body.length - 1, pos) - 60);
  return (start > 0 ? "…" : "") + body.slice(start, start + 200).replace(/\s+/g, " ") + (start + 200 < body.length ? "…" : "");
}

async function allowedIds(user: SessionUser, type: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const pick = (rows: { id: string }[]) => new Set(rows.map((r) => r.id));
  switch (type) {
    case "client": return can(user, "client.view") ? pick(await db.client.findMany({ where: { id: { in: ids }, AND: [clientScope(user)] }, select: { id: true } })) : new Set();
    case "case": return can(user, "case.view") ? pick(await db.case.findMany({ where: { id: { in: ids }, AND: [caseScope(user)] }, select: { id: true } })) : new Set();
    case "document": return can(user, "document.view") ? pick(await db.document.findMany({ where: { id: { in: ids }, AND: [documentScope(user)] }, select: { id: true } })) : new Set();
    case "correspondence": return can(user, "correspondence.view") ? pick(await db.correspondence.findMany({ where: { id: { in: ids }, AND: [corrScope(user)] }, select: { id: true } })) : new Set();
    case "task": return can(user, "task.view") ? pick(await db.task.findMany({ where: { id: { in: ids }, AND: [taskScope(user)] }, select: { id: true } })) : new Set();
    case "draft": return can(user, "draft.view") ? pick(await db.legalDraft.findMany({ where: { id: { in: ids }, AND: [draftScope(user)] }, select: { id: true } })) : new Set();
    case "deadline": return can(user, "deadline.view") ? pick(await db.deadline.findMany({ where: { id: { in: ids }, AND: [deadlineScope(user)] }, select: { id: true } })) : new Set();
    case "template": return can(user, "template.view") ? new Set(ids) : new Set();
    case "legal_source": return can(user, "research.use") ? new Set(ids) : new Set();
    case "note": {
      const notes = await db.note.findMany({ where: { id: { in: ids } }, select: { id: true, caseId: true, clientId: true } });
      const [cs, cl] = await Promise.all([
        db.case.findMany({ where: { id: { in: notes.map((n) => n.caseId).filter((x): x is string => !!x) }, AND: [caseScope(user)] }, select: { id: true } }),
        db.client.findMany({ where: { id: { in: notes.map((n) => n.clientId).filter((x): x is string => !!x) }, AND: [clientScope(user)] }, select: { id: true } }),
      ]);
      const okC = pick(cs), okL = pick(cl);
      return new Set(notes.filter((n) => (n.caseId && okC.has(n.caseId)) || (n.clientId && okL.has(n.clientId))).map((n) => n.id));
    }
    default: return new Set();
  }
}

export async function searchInternal(user: SessionUser, query: string, opts: { types?: string[]; caseId?: string; limit?: number; from?: Date; to?: Date } = {}): Promise<SearchHit[]> {
  const norm = normalizeFa(query);
  if (norm.length < 2) return [];
  const terms = norm.split(" ").filter((t) => t.length >= 2).slice(0, 8);
  if (!terms.length) return [];
  const limit = Math.min(opts.limit ?? 30, 100);
  // پرس‌وجوی پیشوندی: هر واژه با «:*» تا «دادخو» به «دادخواست» برسد
  const tsq = terms.map((t) => `${t.replace(/[^\p{L}\p{N}]/gu, "")}:*`).filter((t) => t.length > 2).join(" & ");
  const like = `%${norm.replace(/[%_\\]/g, "\\$&")}%`;
  const typeFilter = opts.types?.length ? Prisma.sql`AND "entityType" IN (${Prisma.join(opts.types)})` : Prisma.empty;
  const caseFilter = opts.caseId ? Prisma.sql`AND "caseId" = ${opts.caseId}` : Prisma.empty;
  const fromFilter = opts.from ? Prisma.sql`AND "updatedAt" >= ${opts.from}` : Prisma.empty;
  const toFilter = opts.to ? Prisma.sql`AND "updatedAt" < ${opts.to}` : Prisma.empty;

  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT "entityType", "entityId", "title", "subtitle", "body", "norm", "link", "caseId", "updatedAt",
      ( ts_rank(to_tsvector('simple', "norm"), to_tsquery('simple', ${tsq})) * 2
        + similarity("norm", ${norm})
        + CASE WHEN "norm" LIKE ${like} THEN 0.6 ELSE 0 END
        + CASE WHEN "title" ILIKE ${`%${query.trim()}%`} THEN 0.8 ELSE 0 END )::float8 AS score
    FROM "SearchEntry"
    WHERE ( to_tsvector('simple', "norm") @@ to_tsquery('simple', ${tsq}) OR "norm" LIKE ${like} OR word_similarity(${norm}, "norm") > 0.45 )
      ${typeFilter} ${caseFilter} ${fromFilter} ${toFilter}
    ORDER BY score DESC, "updatedAt" DESC
    LIMIT ${limit * 4}`);

  const byType = new Map<string, string[]>();
  for (const r of rows) byType.set(r.entityType, [...(byType.get(r.entityType) ?? []), r.entityId]);
  const allowed = new Map<string, Set<string>>();
  await Promise.all([...byType].map(async ([t, ids]) => allowed.set(t, await allowedIds(user, t, ids))));

  // حذف نتایج تکراری (عنوان و پیوند یکسان)
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const r of rows) {
    if (!allowed.get(r.entityType)?.has(r.entityId)) continue;
    const key = `${r.entityType}|${normalizeFa(r.title)}|${r.link}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      id: r.entityId, type: r.entityType, typeLabel: ENTITY_LABELS[r.entityType] ?? r.entityType, title: r.title, subtitle: r.subtitle,
      snippet: snippetOf(r.body, terms), link: r.link, score: Number(r.score), updatedAt: r.updatedAt, source: "پایگاه داخلی دفتر", caseId: r.caseId,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

export async function recordSearch(user: SessionUser, query: string, results: number) {
  const q = query.trim().slice(0, 200);
  if (q.length < 2) return;
  const last = await db.searchHistory.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  if (last?.query === q) { await db.searchHistory.update({ where: { id: last.id }, data: { results, createdAt: new Date() } }); return; }
  await db.searchHistory.create({ data: { userId: user.id, query: q, results } });
}
