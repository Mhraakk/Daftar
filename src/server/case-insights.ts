// بینش پرونده: پرونده‌های مرتبط (در محدوده دسترسی کاربر)، بررسی تعارض منافع در کل دفتر، و ردیف‌های خط زمانی.
// تطبیق اشخاص با شناسه/کد ملی «قطعی» و با نام نرمال‌شده «احتمالی» است؛ پرونده‌ای که کاربر به آن دسترسی ندارد بی‌جزئیات گزارش می‌شود.
import type { Prisma } from "@prisma/client";
import { can, type SessionUser } from "@/lib/auth/guard";
import type { SeriesToken } from "@/components/charts";
import { db } from "@/lib/db";
import { opposite, sideOf, type Side } from "@/lib/party-roles";
import { normalizeFa, toEnDigits } from "@/lib/text";
import { caseScope } from "./access";

const RELATED_LIMIT = 12;
const CANDIDATE_LIMIT = 200;
const TIMELINE_ROWS = 14;
const MS_PER_DAY = 86_400_000;
const PAD_DAYS = 7;
const MIN_ID_DIGITS = 8;

export type MatchStrength = "ID" | "NAME";
interface Person { name: string; nationalId: string | null }
interface PartyRow extends Person { caseId: string; role: string; clientId: string | null }

/** شناسه/کد ملی فقط رقم؛ کوتاه‌تر از ۸ رقم برای تطبیق قطعی به کار نمی‌رود */
const idKey = (v: string | null | undefined): string | null => {
  const digits = [...toEnDigits(v ?? "")].filter((ch) => ch >= "0" && ch <= "9").join("");
  return digits.length >= MIN_ID_DIGITS ? digits : null;
};
const nameKey = (v: string | null | undefined): string => normalizeFa(v ?? "").split(" ").filter(Boolean).join(" ");

function matchOf(a: Person, b: Person): MatchStrength | null {
  const ia = idKey(a.nationalId);
  const ib = idKey(b.nationalId);
  if (ia && ib) return ia === ib ? "ID" : null;
  const na = nameKey(a.name);
  return na && na === nameKey(b.name) ? "NAME" : null;
}

/** شرط جست‌وجوی ردیف‌های طرف دعوا که ممکن است با یکی از این اشخاص یکی باشند */
function personWhere(people: Person[]): Prisma.CasePartyWhereInput[] {
  const ids = people.flatMap((p) => (idKey(p.nationalId) ? [idKey(p.nationalId) as string, p.nationalId as string] : []));
  const names = [...new Set(people.flatMap((p) => [p.name.trim(), nameKey(p.name)]).filter(Boolean))];
  return [...(ids.length ? [{ nationalId: { in: ids } }] : []), ...names.map((n) => ({ name: { equals: n, mode: "insensitive" as const } }))];
}

export interface CaseForInsights {
  id: string;
  clientId: string;
  courtCaseNumber: string | null;
  client: { displayName: string; nationalId: string | null };
  parties: { name: string; nationalId: string | null; role: string; clientId: string | null }[];
}

export interface RelatedCase { id: string; number: string; title: string; status: string; reasons: string[] }

/** پرونده‌های مرتبط در محدوده دسترسی کاربر: همان مراجعه‌کننده، همان شماره پرونده قضایی، یا طرف مشترک */
export async function relatedCases(user: SessionUser, c: CaseForInsights): Promise<RelatedCase[]> {
  const people = c.parties.filter((p) => sideOf(p.role) !== null && p.clientId !== c.clientId);
  const or: Prisma.CaseWhereInput[] = [
    { clientId: c.clientId },
    ...(c.courtCaseNumber ? [{ courtCaseNumber: c.courtCaseNumber }] : []),
    ...(people.length ? [{ parties: { some: { OR: personWhere(people) } } }] : []),
  ];
  const rows = await db.case.findMany({
    where: { id: { not: c.id }, OR: or, AND: [caseScope(user)] }, take: CANDIDATE_LIMIT, orderBy: { updatedAt: "desc" },
    select: { id: true, number: true, title: true, status: true, clientId: true, courtCaseNumber: true, parties: { select: { name: true, nationalId: true, role: true } } },
  });
  return rows.map((r) => {
    const shared = people.flatMap((p) => r.parties.flatMap((q) => {
      const m = matchOf(p, q);
      return m ? [`طرف مشترک: ${p.name} (${q.role} در آن پرونده${m === "NAME" ? "، تطبیق نام" : ""})`] : [];
    }));
    const reasons = [
      ...(r.clientId === c.clientId ? ["همان مراجعه‌کننده"] : []),
      ...(c.courtCaseNumber && r.courtCaseNumber === c.courtCaseNumber ? ["همان شماره پرونده قضایی"] : []),
      ...new Set(shared),
    ];
    return { id: r.id, number: r.number, title: r.title, status: r.status, reasons };
  }).filter((r) => r.reasons.length > 0).slice(0, RELATED_LIMIT);
}

export interface ConflictHit {
  kind: "OPPONENT_IS_CLIENT" | "CLIENT_WAS_OPPONENT";
  person: string;
  strength: MatchStrength;
  clientId?: string;
  caseId?: string;
  caseLabel?: string;
  accessible: boolean;
}

/** سمت مراجعه‌کننده هر پرونده از ردیف طرف دعوای پیوندخورده به او (پیش‌فرض: خواهان) */
const clientSideIn = (parties: { role: string; clientId: string | null }[], clientId: string): Side =>
  sideOf(parties.find((p) => p.clientId === clientId)?.role ?? "") ?? "A";

/**
 * تعارض منافع در کل دفتر:
 * ۱) طرف مقابل این پرونده خودش مراجعه‌کننده دفتر است؛
 * ۲) مراجعه‌کننده این پرونده در پرونده دیگری از دفتر طرف مقابلِ مراجعه‌کننده آن پرونده بوده است.
 * جزئیات پرونده دیگر فقط برای کاربری که به آن دسترسی دارد نشان داده می‌شود.
 */
export async function conflictCheck(user: SessionUser, c: CaseForInsights): Promise<ConflictHit[]> {
  const ourSide = clientSideIn(c.parties, c.clientId);
  const opponents = c.parties.filter((p) => sideOf(p.role) === opposite(ourSide) && p.clientId !== c.clientId);
  const clientOr = opponents.flatMap((p) => [
    ...(idKey(p.nationalId) ? [{ nationalId: { in: [idKey(p.nationalId) as string, p.nationalId as string] } }] : []),
    { displayName: { equals: p.name.trim(), mode: "insensitive" as const } },
  ]);
  const officeClients = clientOr.length ? await db.client.findMany({ where: { id: { not: c.clientId }, OR: clientOr }, select: { id: true, displayName: true, nationalId: true } }) : [];
  const opponentHits: ConflictHit[] = opponents.flatMap((p) => officeClients.flatMap((oc) => {
    const m = matchOf(p, { name: oc.displayName, nationalId: oc.nationalId });
    return m ? [{ kind: "OPPONENT_IS_CLIENT" as const, person: p.name, strength: m, clientId: can(user, "client.view") ? oc.id : undefined, accessible: can(user, "client.view") }] : [];
  }));

  const me: Person = { name: c.client.displayName, nationalId: c.client.nationalId };
  const elsewhere = await db.caseParty.findMany({
    where: { caseId: { not: c.id }, OR: personWhere([me]) }, take: CANDIDATE_LIMIT,
    select: { caseId: true, role: true, name: true, nationalId: true, clientId: true, case: { select: { clientId: true, number: true, title: true, parties: { select: { role: true, clientId: true } } } } },
  });
  const adverse = elsewhere.filter((row) => row.case.clientId !== c.clientId && matchOf(me, row) !== null && sideOf(row.role) === opposite(clientSideIn(row.case.parties, row.case.clientId)));
  const visible = new Set((await db.case.findMany({ where: { id: { in: adverse.map((a) => a.caseId) }, AND: [caseScope(user)] }, select: { id: true } })).map((r) => r.id));
  const clientHits: ConflictHit[] = adverse.map((row) => ({
    kind: "CLIENT_WAS_OPPONENT", person: c.client.displayName, strength: matchOf(me, row) ?? "NAME", accessible: visible.has(row.caseId),
    ...(visible.has(row.caseId) ? { caseId: row.caseId, caseLabel: `${row.case.title} (${row.case.number})` } : {}),
  }));
  return [...opponentHits, ...clientHits];
}

export interface TimelineInput {
  createdAt: Date;
  closedAt: Date | null;
  deadlines: { title: string; dueAt: Date; status: string }[];
  tasks: { title: string; createdAt: Date; dueAt: Date | null; completedAt: Date | null; status: string }[];
  events: { title: string; startAt: Date }[];
}
export interface CaseTimeline { from: Date; to: Date; rows: { label: string; start: Date; end?: Date | null; token: SeriesToken; note?: string }[] }

/** ردیف‌های نمودار خط زمانی پرونده: عمر پرونده، وظایف (بازه)، مهلت‌ها و جلسه‌ها (نقطه) */
export function caseTimeline(t: TimelineInput, now = new Date()): CaseTimeline {
  const end = t.closedAt ?? now;
  const rows: CaseTimeline["rows"] = [
    { label: "عمر پرونده", start: t.createdAt, end, token: "chart-prev" as SeriesToken },
    ...t.tasks.filter((x) => x.dueAt).map((x) => ({ label: `وظیفه: ${x.title}`, start: x.createdAt, end: x.completedAt ?? x.dueAt, token: "chart-2" as SeriesToken })),
    ...t.deadlines.map((d) => ({ label: `مهلت: ${d.title}`, start: d.dueAt, token: (d.status === "OPEN" && d.dueAt < now ? "chart-neg" : "chart-1") as SeriesToken, note: d.status })),
    ...t.events.map((e) => ({ label: `جلسه: ${e.title}`, start: e.startAt, token: "chart-3" as SeriesToken })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, TIMELINE_ROWS);
  const times = rows.flatMap((r) => [r.start.getTime(), ...(r.end ? [r.end.getTime()] : [])]);
  return { from: new Date(Math.min(...times)), to: new Date(Math.max(...times, now.getTime()) + PAD_DAYS * MS_PER_DAY), rows };
}
