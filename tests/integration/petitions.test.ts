/* eslint-disable ts-patterns/no-magic-numbers -- assertions compare against literal expected values */
// موتور دادخواست روی پایگاه داده واقعی: seed تکرارپذیر با حفظ ویرایش دستی، کاتالوگ و دسترسی، پیشنهاد از پرونده،
// ساخت سند با پیش‌پرکردن چند خواهان/خوانده، ذخیره با قفل خوش‌بینانه، مهلت اعتراض و ورود فرم تازه.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { formatJalali } from "@/lib/jalali";
import { toEnDigits } from "@/lib/text";
import { createCase } from "@/server/cases";
import { createClient } from "@/server/clients";
import { getPetitionType, listPetitionTypes, setPetitionTypeStatus, suggestPetitionTypes, updatePetitionType } from "@/server/petitions/catalog";
import { petitionDataSchema, type PetitionData } from "@/server/petitions/data";
import { createPetitionDraft, petitionReport, savePetition } from "@/server/petitions/drafting";
import { importPetitionForm } from "@/server/petitions/import-form";
import { seedPetitionTypes } from "@/server/petitions/seed";
import { asUser, nationalId, prisma, tag } from "./helpers";

const T = tag();
const mk = (o: Record<string, unknown>) => o as never;
const DAY_MS = 86_400_000;
let manager: SessionUser, legal: SessionUser, employee: SessionUser;
let clientId = "", caseId = "", appealCaseId = "";
const typeId = async (code: string) => (await prisma.petitionType.findUniqueOrThrow({ where: { code } })).id;
const formCodeOf = async (title: string) => (await prisma.petitionType.findFirstOrThrow({ where: { title, source: "FORM" } })).code;
const dataOf = async (draftId: string): Promise<PetitionData> => petitionDataSchema.parse((await prisma.legalDraft.findUniqueOrThrow({ where: { id: draftId } })).petitionData);
const created: string[] = [];

beforeAll(async () => {
  [manager, legal, employee] = await Promise.all(["t.manager", "t.legal", "t.employee"].map(asUser));
  await seedPetitionTypes(db);
  const c = await createClient(mk({ type: "PERSON", firstName: "مریم", lastName: `دادخواست-${T}`, fatherName: "حسن", nationalId: nationalId(), mobile: "09120000000", address: "تهران، خیابان آزادی، کوچه پنجم، پلاک ۱۲", birthDate: "1365/01/01" }), manager);
  clientId = c.id;
  caseId = (await createCase(mk({ title: `مطالبه وجه چک ${T}`, category: "حقوقی", clientId, priority: "NORMAL", responsibleId: legal.id, courtName: "دادگاه عمومی حقوقی تهران", courtBranch: "۱۲", courtCaseNumber: "140509980000123" }), manager)).id;
  await prisma.caseParty.createMany({
    data: [
      { caseId, role: "خواهان", name: "رضا کریمی", fatherName: "علی", occupation: "آزاد", address: "کرج، بلوار جمهوری، پلاک ۴" },
      { caseId, role: "خوانده", name: "شرکت آریا ترابر", address: "تهران، خیابان ولیعصر، پلاک ۸۰" },
      { caseId, role: "خوانده", name: "حسین محمدی", fatherName: "محمود", occupation: "راننده", address: "تهران، میدان انقلاب، کوچه سوم" },
      { caseId, role: "شاهد", name: "مهدی صادقی", nationalId: "0012345679", address: "تهران، نارمک، خیابان گلبرگ" },
    ],
  });
  appealCaseId = (await createCase(mk({ title: `دعوای الزام به تنظیم سند ${T}`, category: "حقوقی", clientId, priority: "NORMAL", responsibleId: legal.id, courtName: "دادگاه عمومی حقوقی شمیرانات", courtBranch: "۵" }), manager)).id;
  await prisma.caseParty.updateMany({ where: { caseId: appealCaseId, clientId }, data: { role: "خوانده" } });
  await prisma.caseParty.create({ data: { caseId: appealCaseId, role: "خواهان", name: "نادر یوسفی", address: "تهران، تجریش" } });
});

afterAll(async () => {
  await prisma.legalDraft.deleteMany({ where: { caseId: { in: [caseId, appealCaseId] } } });
  await prisma.petitionType.deleteMany({ where: { id: { in: created } } });
  await prisma.petitionType.updateMany({ where: { code: "LAW-COUNTERCLAIM" }, data: { editedAt: null } });
  await seedPetitionTypes(db);
  await prisma.$disconnect();
});

describe("seed", () => {
  it("loads 29 forms and 10 law-derived types, and running it again changes nothing new", async () => {
    const again = await seedPetitionTypes(db);
    expect(again).toMatchObject({ forms: 29, law: 10, created: 0 });
    expect(await prisma.petitionType.count({ where: { source: "FORM", status: "PUBLISHED" } })).toBeGreaterThanOrEqual(29);
    expect(await prisma.petitionType.count({ where: { source: "LAW", status: "PUBLISHED" } })).toBe(10);
  });

  it("keeps a type that was edited by hand", async () => {
    const id = await typeId("LAW-COUNTERCLAIM");
    const row = await prisma.petitionType.findUniqueOrThrow({ where: { id } });
    await expect(updatePetitionType(id, mk({ ...row, title: `دعوای متقابل (ویرایش ${T})`, version: row.version }), legal)).rejects.toThrow("مجوز");
    await updatePetitionType(id, mk({ ...row, title: `دعوای متقابل (ویرایش ${T})`, bodyTemplate: `${row.bodyTemplate}\n{{توضیح افزوده}}`, version: row.version }), manager);
    await expect(updatePetitionType(id, mk({ ...row, version: row.version }), manager)).rejects.toThrow("هم‌زمان");
    const r = await seedPetitionTypes(db);
    expect(r.kept).toBeGreaterThanOrEqual(1);
    const after = await prisma.petitionType.findUniqueOrThrow({ where: { id } });
    expect(after.title).toBe(`دعوای متقابل (ویرایش ${T})`);
    expect((after.blanks as { key: string }[]).map((b) => b.key)).toContain("توضیح افزوده");
    expect(await prisma.activityLog.count({ where: { action: "petition_type.updated", entityId: id } })).toBeGreaterThan(0);
  });
});

describe("catalog", () => {
  it("searches with Persian normalisation and filters by kind", async () => {
    const byArabicLetters = await listPetitionTypes(legal, { q: "تجديدنظر" });
    expect(byArabicLetters.map((r) => r.code)).toContain("LAW-APPEAL");
    expect((await listPetitionTypes(legal, { kind: "OBJECTION" })).map((r) => r.code).sort()).toEqual(["LAW-APPEAL", "LAW-CASSATION", "LAW-DEFAULT-OBJECTION", "LAW-RETRIAL", "LAW-THIRD-PARTY-OBJECTION"]);
    expect((await listPetitionTypes(legal, { q: "چک" })).length).toBeGreaterThanOrEqual(2);
    expect(await listPetitionTypes(legal, { q: "واژه‌ای‌که‌نیست" })).toEqual([]);
  });

  it("hides unpublished types from everyone but the petition manager", async () => {
    const id = await typeId("LAW-INTERIM-ORDER");
    await expect(setPetitionTypeStatus(id, "DRAFT", legal)).rejects.toThrow("مجوز");
    await setPetitionTypeStatus(id, "DRAFT", manager);
    try {
      expect((await listPetitionTypes(legal, { kind: "INCIDENTAL" })).map((r) => r.code)).not.toContain("LAW-INTERIM-ORDER");
      expect((await listPetitionTypes(manager, { kind: "INCIDENTAL" })).map((r) => r.code)).toContain("LAW-INTERIM-ORDER");
      await expect(getPetitionType(id, legal)).rejects.toThrow("یافت نشد");
      await expect(createPetitionDraft(mk({ petitionTypeId: id, caseId }), legal)).rejects.toThrow("منتشر نشده");
    } finally {
      await setPetitionTypeStatus(id, "PUBLISHED", manager);
    }
  });

  it("suggests types from the case title", async () => {
    const s = await suggestPetitionTypes(legal, caseId);
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].matched).toContain("چک");
    expect(s.every((x) => x.row.title.includes("چک") || x.matched.length > 0)).toBe(true);
    await expect(suggestPetitionTypes(employee, caseId)).rejects.toThrow();
  });
});

describe("drafting a petition from a case", () => {
  let draftId = "";

  it("prefills both plaintiffs, both defendants, the witness and the court", async () => {
    const id = await typeId(await formCodeOf("ابطال چک"));
    const d = await createPetitionDraft(mk({ petitionTypeId: id, caseId }), legal);
    draftId = d.id;
    const row = await prisma.legalDraft.findUniqueOrThrow({ where: { id: d.id }, include: { versions: true } });
    expect(row).toMatchObject({ docType: "PETITION", petitionTypeId: id, clientId, caseId });
    expect(row.versions.map((v) => v.source)).toEqual(["PETITION"]);
    const data = await dataOf(d.id);
    expect(data.plaintiffs.map((p) => `${p.firstName} ${p.lastName}`)).toEqual([`مریم دادخواست-${T}`, "رضا کریمی"]);
    expect(data.plaintiffs[0]).toMatchObject({ fatherName: "حسن", sourceId: clientId });
    expect(Number(toEnDigits(data.plaintiffs[0].age))).toBeGreaterThan(30);
    expect(data.defendants.map((p) => [p.partyType, p.legalName || p.lastName])).toEqual([["LEGAL", "شرکت آریا ترابر"], ["PERSON", "محمدی"]]);
    expect(data.witnesses).toEqual([{ name: "مهدی صادقی", details: "کد ملی ۰۰۱۲۳۴۵۶۷۹", address: "تهران، نارمک، خیابان گلبرگ" }]);
    expect(data.court).toEqual({ name: "دادگاه عمومی حقوقی تهران", branch: "۱۲", city: "" });
    expect(data.claim).toMatchObject({ subject: "ابطال چک", valueType: "MALI" });
    expect(row.contentHtml).toContain("شرکت آریا ترابر");
    expect(row.contentHtml).toContain("خواهان ۲");
    expect(row.contentHtml).toContain("ریاست محترم شعبه ۱۲ دادگاه عمومی حقوقی تهران");
    const log = await prisma.activityLog.findFirstOrThrow({ where: { action: "draft.created", entityId: d.id } });
    expect((log.meta as { petitionTypeId: string }).petitionTypeId).toBe(id);
  });

  it("reports the article 51/53 checks for the prefilled petition", async () => {
    const r = await petitionReport(draftId, legal);
    const byId = Object.fromEntries(r.validation.checks.map((c) => [c.id, c]));
    expect(byId["claim.value"].status).toBe("missing");
    expect(byId["body.grounds"].status).toBe("missing");
    expect(byId["defendants.0"].status).toBe("ok");
    expect(byId["defendants.1"].status).toBe("ok");
    expect(r.deadline.status).toBe("NO_RULE");
  });

  it("saves new data, rebuilds the sheet as a new version and rejects a stale version", async () => {
    const before = await prisma.legalDraft.findUniqueOrThrow({ where: { id: draftId } });
    const data = await dataOf(draftId);
    const filled = { ...data, claim: { ...data.claim, value: "۸۰۰۰۰۰۰۰۰" }, blanks: Object.fromEntries(Object.keys(data.blanks).map((k) => [k, "x"])) };
    const r = await savePetition(draftId, before.version, filled, legal);
    expect(r).toEqual({ version: before.version + 1, versionNo: 2 });
    const after = await prisma.legalDraft.findUniqueOrThrow({ where: { id: draftId } });
    expect(after.contentHtml).toContain("۸۰۰٬۰۰۰٬۰۰۰ ریال");
    await expect(savePetition(draftId, before.version, filled, legal)).rejects.toThrow("هم‌زمان");
    expect((await petitionReport(draftId, legal)).validation.checks.find((c) => c.id === "claim.value")?.status).toBe("ok");
  });

  it("refuses users without access to the case", async () => {
    const id = await typeId(await formCodeOf("ابطال چک"));
    await expect(createPetitionDraft(mk({ petitionTypeId: id, caseId }), employee)).rejects.toThrow();
    await expect(savePetition(draftId, 1, {}, employee)).rejects.toThrow();
  });
});

describe("objections and incidental petitions", () => {
  it("appeal: the client is the losing defendant, so the original plaintiff becomes the appellee", async () => {
    const d = await createPetitionDraft(mk({ petitionTypeId: await typeId("LAW-APPEAL"), caseId: appealCaseId }), legal);
    const row = await prisma.legalDraft.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.docType).toBe("APPEAL");
    const data = await dataOf(d.id);
    expect(data.plaintiffs.map((p) => p.sourceId)).toEqual([clientId]);
    expect(data.defendants.map((p) => `${p.firstName} ${p.lastName}`)).toEqual(["نادر یوسفی"]);
    expect(data.court.name).toBe("دادگاه تجدیدنظر استان");
    expect(data.decision).toMatchObject({ court: "دادگاه عمومی حقوقی شمیرانات", branch: "۵" });
    expect(row.contentHtml).toContain("تجدیدنظرخوانده");
  });

  it("appeal deadline: needs the service date, then counts 20 days (article 336) and flags a passed deadline", async () => {
    const d = await createPetitionDraft(mk({ petitionTypeId: await typeId("LAW-APPEAL"), caseId: appealCaseId }), legal);
    expect((await petitionReport(d.id, legal)).deadline).toMatchObject({ status: "NEED_DATE", ruleKey: "CIVIL_APPEAL", triggerLabel: "تاریخ ابلاغ رأی" });
    const data = await dataOf(d.id);
    const recent = formatJalali(new Date(Date.now() - 2 * DAY_MS), "input");
    const v = (await prisma.legalDraft.findUniqueOrThrow({ where: { id: d.id } })).version;
    await savePetition(d.id, v, { ...data, decision: { ...data.decision, serviceDate: recent } }, legal);
    const open = (await petitionReport(d.id, legal)).deadline;
    expect(open.status).toBe("OPEN");
    expect(open.daysLeft).toBeGreaterThanOrEqual(17);
    expect(open.basis).toContain("۳۳۶");
    await savePetition(d.id, v + 1, { ...data, decision: { ...data.decision, serviceDate: "1400/01/15" } }, legal);
    expect((await petitionReport(d.id, legal)).deadline.status).toBe("PASSED");
  });

  it("third-party joinder targets the third party and carries the main case", async () => {
    await prisma.caseParty.create({ data: { caseId, role: "ثالث", name: "بانک ملت شعبه آزادی", address: "تهران، خیابان آزادی" } });
    const d = await createPetitionDraft(mk({ petitionTypeId: await typeId("LAW-THIRD-PARTY-JOINDER"), caseId }), legal);
    const data = await dataOf(d.id);
    expect(data.defendants.map((p) => [p.partyType, p.legalName])).toEqual([["LEGAL", "بانک ملت شعبه آزادی"]]);
    expect(data.mainCase).toMatchObject({ number: "۱۴۰۵۰۹۹۸۰۰۰۰۱۲۳", court: "دادگاه عمومی حقوقی تهران", branch: "۱۲", subject: `مطالبه وجه چک ${T}` });
    expect(data.mainCase.plaintiff).toContain("رضا کریمی");
    expect(data.mainCase.defendant).toContain("شرکت آریا ترابر");
    expect((await petitionReport(d.id, legal)).deadline).toMatchObject({ status: "NEED_DATE", triggerLabel: "تاریخ جلسه اول دادرسی" });
  });
});

describe("importing a new form", () => {
  const pdf = readFileSync(path.join("prisma/seed-data/petitions/forms", `${"FK-1A018272"}.pdf`));

  it("returns the existing type for a form that is already in the catalog", async () => {
    await expect(importPetitionForm({ data: pdf, fileName: "a.pdf" }, legal)).rejects.toThrow("مجوز");
    const r = await importPetitionForm({ data: pdf, fileName: "ابطال چک.pdf" }, manager);
    expect(r.existed).toBe(true);
  });

  it("creates a DRAFT type with an import report for a new file, once", async () => {
    const changed = Buffer.concat([pdf, Buffer.from(`\n% copy ${T}\n`)]);
    const r = await importPetitionForm({ data: changed, fileName: `نمونه-${T}.pdf` }, manager);
    created.push(r.id);
    expect(r.existed).toBe(false);
    const row = await prisma.petitionType.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({ status: "DRAFT", source: "FORM", title: "ابطال چک", kind: "INITIAL", sourceFileName: `نمونه-${T}.pdf` });
    expect((row.importReport as { cells: unknown[] }).cells.length).toBeGreaterThan(5);
    expect((await importPetitionForm({ data: changed, fileName: "again.pdf" }, manager)).id).toBe(r.id);
    await expect(importPetitionForm({ data: Buffer.from("not a pdf"), fileName: "x.txt" }, manager)).rejects.toThrow();
  });
});
