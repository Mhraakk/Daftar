// بررسی تعارض منافع پیش از کار روی پرونده (معادل «دروازه تعارض» مهارت‌های دعاوی): آیا طرف مقابل این پرونده
// خود مراجع دفتر است، یا مراجع این پرونده در پرونده دیگری طرف مقابلِ مراجع دیگری است؟ تطبیق با کد ملی و نام یکسان‌شده.
import { db } from "@/lib/db";
import { normalizeFa } from "@/lib/text";

export interface ConflictHit {
  kind: "OPPONENT_IS_CLIENT" | "CLIENT_IS_OPPONENT_ELSEWHERE";
  name: string;
  otherCaseNumber: string | null;
  otherCaseId: string | null;
  matchedBy: "nationalId" | "name";
}

const ADVERSE_ROLES = new Set(["خوانده", "متهم / مشتکی‌عنه", "تجدیدنظرخوانده", "ثالث"]);
const key = (s: string | null | undefined): string => normalizeFa(s ?? "").trim();

export async function conflictCheck(caseId: string): Promise<ConflictHit[]> {
  const c = await db.case.findUniqueOrThrow({
    where: { id: caseId },
    select: { clientId: true, client: { select: { displayName: true, nationalId: true } }, parties: { select: { role: true, name: true, nationalId: true, clientId: true } } },
  });
  const adverse = c.parties.filter((p) => ADVERSE_ROLES.has(p.role) && p.clientId !== c.clientId);
  const ids = adverse.map((p) => p.nationalId).filter((x): x is string => !!x);
  const names = adverse.map((p) => p.name);
  const clientsById = ids.length ? await db.client.findMany({ where: { nationalId: { in: ids }, id: { not: c.clientId } }, select: { displayName: true, nationalId: true, cases: { select: { id: true, number: true }, take: 1 } } }) : [];
  const nameKeys = new Set(names.map(key));
  const clientsByName = names.length ? (await db.client.findMany({ where: { displayName: { in: names }, id: { not: c.clientId } }, select: { displayName: true, cases: { select: { id: true, number: true }, take: 1 } } })).filter((cl) => nameKeys.has(key(cl.displayName))) : [];
  const opponentHits: ConflictHit[] = [
    ...clientsById.map((cl) => ({ kind: "OPPONENT_IS_CLIENT" as const, name: cl.displayName, otherCaseNumber: cl.cases[0]?.number ?? null, otherCaseId: cl.cases[0]?.id ?? null, matchedBy: "nationalId" as const })),
    ...clientsByName.filter((cl) => !clientsById.some((x) => x.displayName === cl.displayName)).map((cl) => ({ kind: "OPPONENT_IS_CLIENT" as const, name: cl.displayName, otherCaseNumber: cl.cases[0]?.number ?? null, otherCaseId: cl.cases[0]?.id ?? null, matchedBy: "name" as const })),
  ];
  const elsewhere = await db.caseParty.findMany({
    where: {
      caseId: { not: caseId },
      role: { in: [...ADVERSE_ROLES] },
      OR: [...(c.client.nationalId ? [{ nationalId: c.client.nationalId }] : []), { name: c.client.displayName }],
      case: { clientId: { not: c.clientId } },
    },
    select: { name: true, nationalId: true, case: { select: { id: true, number: true } } },
  });
  const clientHits: ConflictHit[] = elsewhere.map((p) => ({
    kind: "CLIENT_IS_OPPONENT_ELSEWHERE", name: p.name, otherCaseNumber: p.case.number, otherCaseId: p.case.id,
    matchedBy: c.client.nationalId && p.nationalId === c.client.nationalId ? "nationalId" : "name",
  }));
  return [...opponentHits, ...clientHits];
}

export const conflictText = (hits: ConflictHit[]): string =>
  hits.length
    ? hits.map((h) => `- ${h.kind === "OPPONENT_IS_CLIENT" ? "طرف مقابل این پرونده، مراجع دفتر است" : "مراجع این پرونده در پرونده دیگری طرف مقابل است"}: ${h.name}${h.otherCaseNumber ? ` (پرونده ${h.otherCaseNumber})` : ""} — تطبیق با ${h.matchedBy === "nationalId" ? "کد ملی" : "نام"}`).join("\n")
    : "تعارضی در سوابق دفتر یافت نشد (تطبیق خودکار با کد ملی و نام).";
