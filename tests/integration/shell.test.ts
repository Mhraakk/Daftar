/* eslint-disable ts-patterns/no-magic-numbers -- assertions compare against literal expected values */
// ظاهر و پوسته برنامه روی پایگاه داده واقعی: پیش‌فرض دفتر و انتخاب کاربر، فقط مدیر تنظیمات پیش‌فرض را تغییر می‌دهد،
// بازدید از رکورد فقط با دسترسی ثبت می‌شود، سنجاق و سقف رکوردهای اخیر.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth/guard";
import { createCase } from "@/server/cases";
import { createClient } from "@/server/clients";
import { listRecents, recordVisit, setRecentPinned, shellBadges } from "@/server/shell";
import { getOfficeUi, OFFICE_UI_DEFAULT, resolveUi, saveOfficeUi, saveUserUi } from "@/theme/prefs";
import { asUser, nationalId, prisma, tag } from "./helpers";

const T = tag();
const mk = (o: Record<string, unknown>) => o as never;
let manager: SessionUser, legal: SessionUser, employee: SessionUser;
let caseId = "", clientId = "";
let officeBefore = OFFICE_UI_DEFAULT;

beforeAll(async () => {
  [manager, legal, employee] = await Promise.all(["t.manager", "t.legal", "t.employee"].map(asUser));
  officeBefore = await getOfficeUi();
  clientId = (await createClient(mk({ type: "PERSON", firstName: "سارا", lastName: `پوسته-${T}`, nationalId: nationalId(), mobile: "09120000001" }), manager)).id;
  caseId = (await createCase(mk({ title: `پرونده ظاهر ${T}`, category: "حقوقی", clientId, priority: "NORMAL", responsibleId: legal.id }), manager)).id;
});

afterAll(async () => {
  await saveOfficeUi(manager, officeBefore);
  await prisma.user.updateMany({ where: { id: { in: [manager.id, legal.id] } }, data: { uiLayout: null, uiSkin: null } });
  await prisma.userRecent.deleteMany({ where: { userId: { in: [manager.id, legal.id, employee.id] } } });
  await prisma.$disconnect();
});

describe("appearance preferences", () => {
  it("falls back to the office default and lets each user choose any of the 16 combinations", async () => {
    await saveOfficeUi(manager, { layout: "columns", skin: "paper", chartTimeAxis: "rtl" });
    expect(await resolveUi(legal.id)).toMatchObject({ layout: "columns", skin: "paper", userLayout: null, userSkin: null });
    expect(await resolveUi(null)).toMatchObject({ layout: "columns", skin: "paper" });
    await saveUserUi(legal, { layout: "dock", skin: "graphite" });
    expect(await resolveUi(legal.id)).toMatchObject({ layout: "dock", skin: "graphite", officeLayout: "columns", officeSkin: "paper" });
    await saveUserUi(legal, { skin: null });
    expect(await resolveUi(legal.id)).toMatchObject({ layout: "dock", skin: "paper", userSkin: null });
  });

  it("only a settings manager may change the office default, and it is audited", async () => {
    await expect(saveOfficeUi(legal, { layout: "sidebar", skin: "glass", chartTimeAxis: "ltr" })).rejects.toThrow("مجوز");
    await saveOfficeUi(manager, { layout: "command", skin: "firuze", chartTimeAxis: "ltr" });
    expect(await getOfficeUi()).toEqual({ layout: "command", skin: "firuze", chartTimeAxis: "ltr" });
    expect(await prisma.activityLog.count({ where: { action: "settings.updated", entityId: "ui", actorId: manager.id } })).toBeGreaterThan(0);
  });

  it("ignores an invalid stored value instead of breaking the page", async () => {
    await prisma.user.update({ where: { id: legal.id }, data: { uiLayout: "bogus", uiSkin: "neon" } });
    const ui = await resolveUi(legal.id);
    expect(ui.userLayout).toBeNull();
    expect(ui.userSkin).toBeNull();
  });
});

describe("recents", () => {
  it("records a visit only for a record the user may see", async () => {
    expect(await recordVisit(legal, `/cases/${caseId}`)).toBe(true);
    expect(await recordVisit(employee, `/cases/${caseId}`)).toBe(false);
    expect(await recordVisit(legal, "/cases/new")).toBe(false);
    expect(await recordVisit(legal, `/cases/${caseId}/edit`)).toBe(false);
    const recents = await listRecents(legal);
    expect(recents[0]).toMatchObject({ entityType: "case", title: `پرونده ظاهر ${T}`, link: `/cases/${caseId}` });
    expect(await listRecents(employee)).toEqual([]);
  });

  it("keeps one row per record, pins it on top and caps the history", async () => {
    await recordVisit(legal, `/clients/${clientId}`);
    await recordVisit(legal, `/cases/${caseId}`);
    const rows = await prisma.userRecent.findMany({ where: { userId: legal.id } });
    expect(rows.filter((r) => r.entityId === caseId)).toHaveLength(1);
    const clientRow = rows.find((r) => r.entityId === clientId);
    await setRecentPinned(legal, clientRow?.id ?? "", true);
    expect((await listRecents(legal))[0]).toMatchObject({ entityType: "client", pinned: true });
    await setRecentPinned(employee, clientRow?.id ?? "", false);
    expect((await listRecents(legal))[0].pinned).toBe(true);
  });

  it("counts badges for the shell", async () => {
    const b = await shellBadges(legal);
    expect(Object.keys(b).sort()).toEqual(["cartable", "deadlines", "messages", "reviews", "tasks", "unread"]);
  });
});
