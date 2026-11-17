/* eslint-disable ts-patterns/no-magic-numbers -- fixtures use literal counts */
// گزارش عملکرد با داده واقعی: محدوده دسترسی (کارمند حقوقی کمتر از مدیر می‌بیند)، شمارش دوره و هم‌خوانی جمع نمودار با کاشی آمار
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth/guard";
import { formatJalali } from "@/lib/jalali";
import { caseScope } from "@/server/access";
import { officeReport, resolveRange } from "@/server/reports";
import { asUser, prisma, tag } from "./helpers";

const T = tag();
let manager: SessionUser, legal: SessionUser;
const created: { client: string; cases: string[] } = { client: "", cases: [] };

beforeAll(async () => {
  [manager, legal] = await Promise.all(["t.manager", "t.legal"].map(asUser));
  const c = await prisma.client.create({ data: { code: `M-RP-${T}`, type: "PERSON", firstName: "گزارش", lastName: T, displayName: `گزارش ${T}`, createdById: manager.id } });
  created.client = c.id;
  const mk = (n: number, responsibleId: string) => prisma.case.create({ data: { number: `P-RP-${n}-${T}`, title: `پرونده گزارش ${n} ${T}`, category: `دسته‌آزمون-${T}`, clientId: c.id, responsibleId, createdById: manager.id, status: "OPEN" } });
  created.cases = (await Promise.all([mk(1, legal.id), mk(2, manager.id), mk(3, manager.id)])).map((x) => x.id);
});

afterAll(async () => {
  await prisma.case.deleteMany({ where: { id: { in: created.cases } } });
  await prisma.client.deleteMany({ where: { id: created.client } });
  await prisma.$disconnect();
});

const today = () => formatJalali(new Date(), "date");

describe("office report", () => {
  it("counts only the cases each user may see", async () => {
    const range = resolveRange({ from: today(), to: today() });
    const [m, l] = await Promise.all([officeReport(manager, range), officeReport(legal, range)]);
    const total = (r: typeof m) => r.casesByStatus.reduce((a, x) => a + x.count, 0);
    expect(total(m)).toBe(await prisma.case.count());
    expect(total(l)).toBe(await prisma.case.count({ where: caseScope(legal) }));
    expect(total(l)).toBeLessThan(total(m));
    const cat = (r: typeof m) => r.casesByCategory.find((x) => x.key === `دسته‌آزمون-${T}`)?.count ?? 0;
    expect(cat(m)).toBe(3);
    expect(cat(l)).toBe(1);
  });

  it("keeps the chart buckets consistent with the stat tiles and compares with the previous period", async () => {
    const r = await officeReport(manager, resolveRange({ from: today(), to: today() }));
    expect(r.bucket).toBe("week");
    expect(r.series.cases.cur.reduce((a, b) => a + b, 0)).toBe(r.totals.newCases);
    expect(r.series.tasksDone.cur.reduce((a, b) => a + b, 0)).toBe(r.totals.tasksDone);
    expect(r.totals.newCases).toBeGreaterThanOrEqual(3);
    expect(r.prev.to).toEqual(r.range.from);
    expect(r.funnel.map((f) => f.value)).toEqual([...r.funnel.map((f) => f.value)].sort((a, b) => b - a));
    expect(r.cycle.reduce((a, c) => a + c.value, 0)).toBe(r.workflow.sample);
  });
});
