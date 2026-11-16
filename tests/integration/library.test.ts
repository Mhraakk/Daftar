/* eslint-disable ts-patterns/no-magic-numbers -- assertions compare against literal expected values */
// کتابخانه حقوقی روی پایگاه داده واقعی: ورود قانون (تکرارپذیر)، حفظ اصلاح دستی، تأیید گروهی نسخه قانون و حذف مواد منسوخ از استناد.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { importLaw, type ExtractedLaw } from "@/server/law-import";
import { articleNumberQuery, citableSources, deleteLegalSource, saveLegalSource, searchLibrary, verifyLaw } from "@/server/legal-library";
import { asUser, prisma, tag } from "./helpers";

const T = tag();
const CODE = `TST${T}`;
const WORD = `واژه${T}`;
let manager: SessionUser, legal: SessionUser;
const dir = mkdtempSync(path.join(tmpdir(), "law-"));
const file = path.join(dir, "law.json");

function lawJson(texts: [string, string, string]): ExtractedLaw {
  return {
    source: { title: `قانون آزمایشی ${T}`, shortTitle: `ق.آ ${T}`, approvedAt: "1400/01/01", file: "x.pdf", sha256: "0".repeat(64), pages: 3, extractedAt: "2026-11-16T00:00:00+00:00", note: "" },
    headings: [{ level: "PART", title: "باب اول - آزمایش", page: 1, firstArticle: 1 }],
    articles: [
      { no: 1, heading: ["باب اول - آزمایش"], status: "VALID", statusNote: null, text: texts[0], notes: 0, pages: [1] },
      { no: 2, heading: ["باب اول - آزمایش"], status: "VALID", statusNote: null, text: texts[1], notes: 0, pages: [2] },
      { no: 3, heading: ["باب اول - آزمایش"], status: "REPEALED", statusNote: "منسوخه 1401/01/01", text: texts[2], notes: 0, pages: [3] },
    ],
    closing: "",
  };
}
const write = (texts: [string, string, string]) => writeFileSync(file, JSON.stringify(lawJson(texts)));
const article = (no: string) => prisma.legalSource.findUniqueOrThrow({ where: { lawCode_articleNo: { lawCode: CODE, articleNo: no } } });

beforeAll(async () => {
  [manager, legal] = await Promise.all(["t.manager", "t.legal"].map(asUser));
  write([`متن اول ${WORD}`, `متن دوم ${WORD}`, `متن سوم منسوخ ${WORD}`]);
});

afterAll(async () => {
  await prisma.legalSource.deleteMany({ where: { lawCode: CODE } });
  await prisma.law.deleteMany({ where: { code: CODE } });
  await prisma.$disconnect();
});

describe("law import", () => {
  it("creates every article once and is idempotent", async () => {
    const first = await importLaw(db, { code: CODE, jsonPath: file });
    expect(first).toMatchObject({ created: 3, updated: 0, unchanged: 0 });
    const again = await importLaw(db, { code: CODE, jsonPath: file });
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 3 });
    expect((await article("3")).status).toBe("REPEALED");
  });

  it("rejects a file with a missing article", async () => {
    const broken = lawJson(["a", "b", "c"]);
    broken.articles = broken.articles.filter((a) => a.no !== 2);
    const bad = path.join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify(broken));
    await expect(importLaw(db, { code: CODE, jsonPath: bad })).rejects.toThrow("مواد ناموجود: 2");
  });
});

describe("verification, manual edits and citation", () => {
  it("only a library manager can verify the law version", async () => {
    await expect(verifyLaw(CODE, true, legal)).rejects.toThrow();
    expect((await verifyLaw(CODE, true, manager)).count).toBe(3);
    expect((await article("1")).verified).toBe(true);
    expect((await prisma.law.findUniqueOrThrow({ where: { code: CODE } })).verifiedAt).not.toBeNull();
  });

  it("a manual correction resets verification and survives re-import", async () => {
    const a2 = await article("2");
    await saveLegalSource({ id: a2.id, kind: "LAW", title: "عنوان دستکاری‌شده", reference: null, articleNo: "999", text: `متن دوم اصلاح‌شده ${WORD}`, sourceName: null, sourceUrl: null, retrievedAt: null, tags: [], status: "VALID", statusNote: null }, manager);
    const edited = await article("2");
    expect(edited).toMatchObject({ verified: false, title: a2.title, articleNo: "2", text: `متن دوم اصلاح‌شده ${WORD}` });
    expect(edited.editedAt).not.toBeNull();
    expect((await prisma.law.findUniqueOrThrow({ where: { code: CODE } })).verifiedAt).toBeNull();

    write([`متن اول تازه ${WORD}`, `متن دوم از استخراج تازه ${WORD}`, `متن سوم منسوخ ${WORD}`]);
    const r = await importLaw(db, { code: CODE, jsonPath: file });
    expect(r).toMatchObject({ updated: 1, verificationReset: 1, keptManualEdits: 1, unchanged: 1 });
    expect((await article("1")).text).toBe(`متن اول تازه ${WORD}`);
    expect((await article("2")).text).toBe(`متن دوم اصلاح‌شده ${WORD}`);
  });

  it("never offers a repealed article for citation", async () => {
    const all = await searchLibrary(WORD, { lawCode: CODE });
    expect(all.map((s) => s.articleNo).sort()).toEqual(["1", "2", "3"]);
    const citable = await citableSources(WORD);
    expect(citable.map((s) => s.articleNo).sort()).toEqual(["1", "2"]);
  });

  it("finds an article by its number", async () => {
    expect(articleNumberQuery("ماده ۵۱")).toBe("51");
    expect(articleNumberQuery("۰۵۱")).toBe("51");
    expect(articleNumberQuery("ماده")).toBeNull();
    const hits = await searchLibrary("ماده ۲", { lawCode: CODE });
    expect(hits.map((h) => h.articleNo)).toEqual(["2"]);
  });

  it("articles of an imported law cannot be deleted", async () => {
    await expect(deleteLegalSource((await article("1")).id, manager)).rejects.toThrow("حذف نمی‌شوند");
  });
});
