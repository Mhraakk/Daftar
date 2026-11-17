/* eslint-disable ts-patterns/no-magic-numbers -- fixtures use literal dates and counts */
// بینش پرونده با داده واقعی: پرونده‌های مرتبط در محدوده دسترسی، تعارض منافع در کل دفتر (با و بی دسترسی) و خط زمانی
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth/guard";
import { caseTimeline, conflictCheck, relatedCases, type CaseForInsights } from "@/server/case-insights";
import { asUser, nationalId, prisma, tag } from "./helpers";

const T = tag();
let manager: SessionUser, legal: SessionUser;
const ids = { clientA: "", clientB: "", case1: "", case2: "", case3: "" };
let insight: CaseForInsights;

beforeAll(async () => {
  [manager, legal] = await Promise.all(["t.manager", "t.legal"].map(asUser));
  const [nidA, nidB] = [nationalId(), nationalId()];
  const a = await prisma.client.create({ data: { code: `M-CI-A-${T}`, type: "PERSON", firstName: "پروین", lastName: `الف ${T}`, displayName: `پروین الف ${T}`, nationalId: nidA, createdById: manager.id } });
  const b = await prisma.client.create({ data: { code: `M-CI-B-${T}`, type: "PERSON", firstName: "بهرام", lastName: `نیکو ${T}`, displayName: `بهرام نیکو ${T}`, nationalId: nidB, createdById: manager.id } });
  ids.clientA = a.id;
  ids.clientB = b.id;
  const mk = (n: string, clientId: string, responsibleId: string, extra = {}) => prisma.case.create({ data: { number: `P-CI-${n}-${T}`, title: `پرونده ${n} ${T}`, category: "حقوقی", clientId, responsibleId, createdById: manager.id, status: "OPEN", ...extra } });
  const [c1, c2, c3] = await Promise.all([mk("1", a.id, legal.id, { courtCaseNumber: `9${T}` }), mk("2", b.id, manager.id), mk("3", a.id, legal.id)]);
  Object.assign(ids, { case1: c1.id, case2: c2.id, case3: c3.id });
  await prisma.caseParty.createMany({ data: [
    // پرونده ۱: مراجعه‌کننده الف خواهان، طرف مقابل همان بهرام نیکو (مراجعه‌کننده دیگر دفتر) با کد ملی
    { caseId: c1.id, clientId: a.id, role: "خواهان", name: a.displayName, nationalId: nidA, address: "تهران" },
    { caseId: c1.id, role: "خوانده", name: `بهرام نیکو ${T}`, nationalId: nidB, address: "کرج" },
    // پرونده ۲: بهرام خواهان و مراجعه‌کننده الف خوانده آن پرونده
    { caseId: c2.id, clientId: b.id, role: "خواهان", name: b.displayName, nationalId: nidB },
    { caseId: c2.id, role: "خوانده", name: a.displayName, nationalId: nidA },
    { caseId: c3.id, clientId: a.id, role: "خواهان", name: a.displayName, nationalId: nidA },
  ] });
  const parties = await prisma.caseParty.findMany({ where: { caseId: c1.id }, select: { name: true, nationalId: true, role: true, clientId: true } });
  insight = { id: c1.id, clientId: a.id, courtCaseNumber: c1.courtCaseNumber, client: { displayName: a.displayName, nationalId: nidA }, parties };
});

afterAll(async () => {
  await prisma.case.deleteMany({ where: { id: { in: [ids.case1, ids.case2, ids.case3] } } });
  await prisma.client.deleteMany({ where: { id: { in: [ids.clientA, ids.clientB] } } });
  await prisma.$disconnect();
});

describe("related cases", () => {
  it("finds the client's other case and the case that shares the opposing party, within the user's access", async () => {
    const all = await relatedCases(manager, insight);
    const byId = Object.fromEntries(all.map((r) => [r.id, r.reasons]));
    expect(byId[ids.case3]).toEqual(["همان مراجعه‌کننده"]);
    expect(byId[ids.case2]).toEqual([`طرف مشترک: بهرام نیکو ${T} (خواهان در آن پرونده)`]);
    expect(byId[ids.case1]).toBeUndefined();
    const mine = (await relatedCases(legal, insight)).map((r) => r.id);
    expect(mine).toContain(ids.case3);
    expect(mine).not.toContain(ids.case2); // پرونده ۲ در محدوده دسترسی کارمند حقوقی نیست
  });
});

describe("conflict of interest", () => {
  it("flags the opponent who is an office client and the client who was an opponent elsewhere", async () => {
    const hits = await conflictCheck(manager, insight);
    expect(hits).toContainEqual(expect.objectContaining({ kind: "OPPONENT_IS_CLIENT", person: `بهرام نیکو ${T}`, strength: "ID", clientId: ids.clientB }));
    expect(hits).toContainEqual(expect.objectContaining({ kind: "CLIENT_WAS_OPPONENT", strength: "ID", caseId: ids.case2, accessible: true }));
  });

  it("reports a conflict in a case the user cannot open without revealing it", async () => {
    const hit = (await conflictCheck(legal, insight)).find((h) => h.kind === "CLIENT_WAS_OPPONENT");
    expect(hit).toMatchObject({ accessible: false });
    expect(hit?.caseId).toBeUndefined();
    expect(hit?.caseLabel).toBeUndefined();
  });

  it("finds nothing for unrelated parties", async () => {
    const clean = { ...insight, parties: [{ name: `ناشناس ${T}`, nationalId: "0000000001", role: "خوانده", clientId: null }], client: { displayName: `بی‌نام ${T}`, nationalId: "0000000002" } };
    expect(await conflictCheck(manager, clean)).toEqual([]);
  });
});

describe("case timeline", () => {
  it("orders rows by start, marks overdue open deadlines and pads the end", () => {
    const now = new Date("2026-11-17T08:00:00Z");
    const d = (s: string) => new Date(s);
    const t = caseTimeline({
      createdAt: d("2026-10-01T08:00:00Z"), closedAt: null,
      deadlines: [{ title: "تجدیدنظر", dueAt: d("2026-11-10T08:00:00Z"), status: "OPEN" }, { title: "لایحه", dueAt: d("2026-11-25T08:00:00Z"), status: "OPEN" }],
      tasks: [{ title: "تهیه مدارک", createdAt: d("2026-10-05T08:00:00Z"), dueAt: d("2026-10-20T08:00:00Z"), completedAt: d("2026-10-18T08:00:00Z"), status: "DONE" }, { title: "بی‌سررسید", createdAt: now, dueAt: null, completedAt: null, status: "TODO" }],
      events: [{ title: "جلسه اول", startAt: d("2026-12-01T08:00:00Z") }],
    }, now);
    expect(t.rows.map((r) => r.label)).toEqual(["عمر پرونده", "وظیفه: تهیه مدارک", "مهلت: تجدیدنظر", "مهلت: لایحه", "جلسه: جلسه اول"]);
    expect(t.rows[1].end).toEqual(d("2026-10-18T08:00:00Z"));
    expect(t.rows.map((r) => r.token)).toEqual(["chart-prev", "chart-2", "chart-neg", "chart-1", "chart-3"]);
    expect(t.from).toEqual(d("2026-10-01T08:00:00Z"));
    expect(t.to.getTime()).toBe(d("2026-12-08T08:00:00Z").getTime());
  });
});
