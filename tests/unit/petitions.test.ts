/* eslint-disable ts-patterns/no-magic-numbers -- assertions compare against literal expected values */
// موتور دادخواست بدون پایگاه داده: ۲۹ فرم نمونه و بازتجزیه PDF اصلی، الزام‌های انواع اعتراضی/طاری در برابر متن
// واردشده قانون، عبارت‌های استنادی بررسی ماده ۵۱/۵۳، رفتار بررسی‌ها و ساخت برگ دادخواست.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEADLINE_RULES } from "../../prisma/seed-data/deadline-rules";
import { sha256 } from "@/lib/storage";
import type { ExtractedLaw } from "@/server/law-import";
import { countSteps, stepOf, systemRows } from "@/components/petitions/studio-model";
import { groundBodySuggestion, parseBodySuggestion } from "@/server/petitions/ai-body";
import { emptyParty, emptyPetitionData, petitionDataSchema, plainSpec, toSpec, type PetitionData, type PetitionSpec, type PetitionTypeRow } from "@/server/petitions/data";
import { blankify, cleanCellText, parseValue, splitInvestigations, splitNumbered, type ParsedForm } from "@/server/petitions/form-parser";
import { formCode, parseFormFile } from "@/server/petitions/import-form";
import { LAW_PETITION_TYPES, type LawPetitionType } from "@/server/petitions/law-types";
import { BLANK_BINDINGS, blankKeys, blankSentence, fillBody, formatAmount, renderPetitionHtml, sideLabels, templateParts, userBlanks } from "@/server/petitions/render";
import { ANCHORS, validatePetition, type PetitionCheck } from "@/server/petitions/validate";
import { sanitizeLegalHtml } from "@/server/sanitize";

interface FormEntry { code: string; sha256: string; sourceFile: string; parsed: ParsedForm }
const forms = (JSON.parse(readFileSync("prisma/seed-data/petitions/forms.json", "utf8")) as { forms: FormEntry[] }).forms;
const FORMS_DIR = "prisma/seed-data/petitions/forms";
const law = JSON.parse(readFileSync("prisma/seed-data/acp/articles.json", "utf8")) as ExtractedLaw;
const article = new Map(law.articles.map((a) => [String(a.no), a]));
// Runs of whitespace (spaces, newlines): matches "  \n " in "الف  \n ب", rejects "الف".
// https://regex101.com/?regex=%5Cs%2B&testString=%D8%A7%D9%84%D9%81%20%20%0A%20%D8%A8&flavor=javascript
const SPACES = /\s+/g;
const flat = (s: string): string => s.replace(SPACES, " ");
const articleText = (no: string): string => flat(article.get(no)?.text ?? "");
const hasPoppler = !spawnSync("pdftotext", ["-v"]).error && !spawnSync("pdftoppm", ["-v"]).error;

function formRow(f: FormEntry): PetitionTypeRow {
  const p = f.parsed;
  return {
    id: f.code, code: f.code, title: p.title, kind: "INITIAL", subKind: null, category: p.category, court: p.court, courtBasis: p.courtBasis, eligible: p.eligible, defendant: p.defendant,
    valueType: p.valueType, valueOptions: p.valueOptions, evidence: p.evidence.map((e) => e.label), evidenceInfo: p.evidenceInfo, fees: p.fees, investigations: p.investigations, ancillary: p.ancillary,
    bodyTemplate: p.bodyTemplate, blanks: p.blanks, optionalClauses: p.optionalClauses, requirements: p.evidence, rules: p.rules, notes: p.notes, source: "FORM", sourceLabel: null,
    lawCode: null, articleRefs: [], deadlineRuleKey: null, status: "PUBLISHED",
  };
}

function lawRow(t: LawPetitionType): PetitionTypeRow {
  return {
    id: t.code, code: t.code, title: t.title, kind: t.kind, subKind: t.subKind, category: t.category, court: t.court, courtBasis: t.courtBasis, eligible: null, defendant: null,
    valueType: null, valueOptions: [], evidence: t.evidence, evidenceInfo: [], fees: [], investigations: t.investigations, ancillary: t.ancillary, bodyTemplate: t.bodyTemplate,
    blanks: blankKeys(t.bodyTemplate).map((key) => ({ key, label: key })), optionalClauses: [], requirements: t.requirements, rules: {}, notes: t.notes, source: "LAW", sourceLabel: null,
    lawCode: "ACP", articleRefs: t.articleRefs, deadlineRuleKey: t.deadlineRuleKey, status: "PUBLISHED",
  };
}

const ADDRESS = "تهران، خیابان آزادی، کوچه پنجم، پلاک ۱۲";
const person = (firstName: string, lastName: string, extra: Partial<PetitionData["plaintiffs"][number]> = {}) => ({ ...emptyParty(), firstName, lastName, fatherName: "حسن", age: "۴۰", occupation: "کارمند", nationalId: "۰۰۱۲۳۴۵۶۷۸", address: ADDRESS, ...extra });

/** داده کامل برای هر نوع: همه بندهای ماده ۵۱ و الزام‌های نوع رعایت شده است */
function complete(spec: PetitionSpec): PetitionData {
  const valueType = spec.valueType === "BY_SUBJECT" ? "MALI" : spec.valueType;
  return petitionDataSchema.parse({
    plaintiffs: [person("مریم", "احمدی")],
    defendants: [person("حسین", "محمدی")],
    claim: { subject: spec.title, valueType, value: "۵۰۰٬۰۰۰٬۰۰۰" },
    evidence: spec.evidence.map((label) => ({ label, include: true })),
    court: { name: "دادگاه عمومی حقوقی تهران", branch: "۱۲" },
    decision: { kind: "حکم", number: "۱۴۰۵۰۹۹۸۰۰۰۰۱۲۳", date: "۱۴۰۵/۰۷/۱۰", court: "دادگاه عمومی حقوقی تهران", branch: "۱۲", serviceDate: "۱۴۰۵/۰۸/۰۱" },
    mainCase: { number: "۱۴۰۵۰۹۹۸۰۰۰۰۴۵۶", court: "دادگاه عمومی حقوقی تهران", branch: "۱۲", plaintiff: "مریم احمدی", defendant: "حسین محمدی", subject: "مطالبه وجه" },
    blanks: Object.fromEntries(userBlanks(spec).map((k) => [k, `مقدار ${k}`])),
  });
}

const specs: PetitionSpec[] = [...forms.map((f) => toSpec(formRow(f))), ...LAW_PETITION_TYPES.map((t) => toSpec(lawRow(t)))];
const specOf = (title: string): PetitionSpec => {
  const s = specs.find((x) => x.title === title);
  if (!s) throw new Error(`نوع «${title}» یافت نشد`);
  return s;
};
const checkOf = (checks: PetitionCheck[], id: string): PetitionCheck | undefined => checks.find((c) => c.id === id);
const missingIds = (spec: PetitionSpec, d: PetitionData): string[] => validatePetition(spec, d).checks.filter((c) => c.status === "missing").map((c) => `${c.id}: ${c.message ?? ""}`);

describe("29 sample forms (Fk01/00)", () => {
  it("are all present, with unique codes and the original PDF beside each", () => {
    expect(forms).toHaveLength(29);
    expect(new Set(forms.map((f) => f.code)).size).toBe(29);
    forms.forEach((f) => {
      const pdf = readFileSync(path.join(FORMS_DIR, `${f.code}.pdf`));
      expect(sha256(pdf), f.code).toBe(f.sha256);
      expect(formCode(f.sha256)).toBe(f.code);
    });
  });

  it("each has a title, category, court header and closing, and every blank is declared", () => {
    forms.forEach(({ code, parsed: p }) => {
      expect(p.title.length, code).toBeGreaterThan(3);
      expect(p.category.length, code).toBeGreaterThan(1);
      expect(p.bodyTemplate.startsWith("ریاست محترم {{مرجع رسیدگی}}"), code).toBe(true);
      expect(p.bodyTemplate.trim().endsWith("با تشکر و تجدید احترام"), code).toBe(true);
      expect(new Set(p.blanks.map((b) => b.key)), code).toEqual(new Set(blankKeys(p.bodyTemplate)));
      expect([null, "MALI", "GHEIR_MALI", "BY_SUBJECT"], code).toContain(p.valueType);
      expect(p.evidence.length, code).toBeGreaterThan(0);
    });
  });

  it("carry no extraction damage and no unsplit list markers", () => {
    const all = JSON.stringify(forms.map((f) => f.parsed));
    expect(["دالیل", "استعالم", "اعالم", "ابالغ", "با سالم", "‏", ""].filter((d) => all.includes(d))).toEqual([]);
    // A list-number marker left inside an item: matches "مستندات 8-اتیان" and "-7 سایر", rejects "ماده 12".
    // https://regex101.com/?regex=%28%5E%7C%5Cs%29%5Cd%2B-%7C-%5Cs*%5Cd%2B%28%5Cs%7C%24%29&testString=%D9%85%D8%B3%D8%AA%D9%86%D8%AF%D8%A7%D8%AA%208-%D8%A7%D8%AA%DB%8C%D8%A7%D9%86&flavor=javascript
    const marker = /(^|\s)\d+-|-\s*\d+(\s|$)/;
    const items = forms.flatMap((f) => [...f.parsed.investigations, ...f.parsed.fees, ...f.parsed.ancillary, ...f.parsed.evidence.map((e) => e.label)]);
    expect(items.filter((x) => marker.test(x))).toEqual([]);
  });

  it.skipIf(!hasPoppler)("re-parsing every stored PDF reproduces forms.json exactly", async () => {
    const diffs = await forms.reduce<Promise<string[]>>(async (done, f) => {
      const list = await done;
      const { parsed } = await parseFormFile(path.join(FORMS_DIR, `${f.code}.pdf`));
      return JSON.stringify(parsed) === JSON.stringify(f.parsed) ? list : [...list, f.code];
    }, Promise.resolve([]));
    expect(diffs).toEqual([]);
  });
});

describe("form parser pure functions", () => {
  it("cleans bidi marks, mirrored parentheses, lost tanvin and glued digits", () => {
    expect(cleanCellText("‏احتراما\" تصویر سند )اجباری(\n-1شهادت شهود")).toEqual(["احتراماً تصویر سند (اجباری)", "-1 شهادت شهود"]);
  });

  it("splits numbered lists, including a marker typed after its number", () => {
    expect(splitNumbered(["-1 شهادت شهود و مطلعین -2 تحقیقات محلی", "-3 معاینه محلی 4-اتیان سوگند"])).toEqual(["شهادت شهود و مطلعین", "تحقیقات محلی", "معاینه محلی", "اتیان سوگند"]);
    // فهرست جداشده با «،» (ویرگول پیش از واژه بعد) و دو اقدام شناخته‌شده چسبیده به هم
    expect(splitInvestigations(["درخواست استعلام ،تحقیقات محلی ،شماره پرونده استنادی شهادت شهود و مطلعین ،اتیان سوگند، سایر دلایل و منضمات"]))
      .toEqual(["درخواست استعلام", "تحقیقات محلی", "شماره پرونده استنادی", "شهادت شهود و مطلعین", "اتیان سوگند", "سایر دلایل و منضمات"]);
    expect(splitInvestigations(["-1 جلب نظر کارشناس -2 معاینه محلی"])).toEqual(["جلب نظر کارشناس", "معاینه محلی"]);
  });

  it("reads value checkboxes and the financial / non-financial kind", () => {
    expect(parseValue(["مبلغ معین ■ مال منقول □"])).toEqual({ valueType: "MALI", options: [{ label: "مبلغ معین", checked: true }, { label: "مال منقول", checked: false }] });
    expect(parseValue(["غیر مالی"]).valueType).toBe("GHEIR_MALI");
    expect(parseValue(["مالی / غیر مالی"]).valueType).toBe("BY_SUBJECT");
  });

  it("turns dotted gaps and date clusters into labelled blanks", () => {
    const r = blankify("به موجب قرارداد مورخ ..... / ..... / ..... 13 مبلغ ..... ریال");
    expect(r.text).toBe("به موجب قرارداد مورخ {{تاریخ قرارداد}} مبلغ {{مبلغ}} ریال");
    expect(r.blanks.map((b) => b.key)).toEqual(["تاریخ قرارداد", "مبلغ"]);
  });
});

describe("law-derived objection and incidental types", () => {
  it("are the ten expected types, each with its category", () => {
    expect(LAW_PETITION_TYPES.map((t) => t.subKind)).toEqual(["APPEAL", "DEFAULT_OBJECTION", "CASSATION", "THIRD_PARTY_OBJECTION", "RETRIAL", "THIRD_PARTY_ENTRY", "THIRD_PARTY_JOINDER", "COUNTERCLAIM", "ATTACHMENT", "INTERIM_ORDER"]);
    LAW_PETITION_TYPES.forEach((t) => expect(t.category, t.code).toBe(t.kind === "OBJECTION" ? "اعتراضی" : "طاری"));
  });

  it.each(LAW_PETITION_TYPES.map((t) => [t.code, t] as const))("%s: every requirement quotes its article verbatim", (_code, t) => {
    t.requirements.forEach((r) => expect(articleText(r.article), `${r.label} → ماده ${r.article}`).toContain(flat(r.anchor)));
    expect(articleText(t.courtArticle)).toContain(flat(t.courtAnchor));
  });

  it.each(LAW_PETITION_TYPES.map((t) => [t.code, t] as const))("%s: cited articles exist and are not repealed; deadline rule is linked", (_code, t) => {
    const cited = [...new Set([...t.articleRefs, t.courtArticle, ...t.requirements.map((r) => r.article)])];
    cited.forEach((no) => {
      expect(article.has(no), `ماده ${no}`).toBe(true);
      expect(article.get(no)?.status, `ماده ${no}`).not.toBe("REPEALED");
    });
    const rule = DEADLINE_RULES.find((r) => r.key === t.deadlineRuleKey);
    if (t.deadlineRuleKey) expect(rule, t.deadlineRuleKey).toBeDefined();
    rule?.articleNos.forEach((no) => expect(t.articleRefs, `${t.code} ← ${rule.key}`).toContain(no));
  });
});

describe("article 51/53 checks", () => {
  it("quote the imported law text verbatim", () => {
    Object.entries(ANCHORS).forEach(([key, a]) => expect(articleText(a.article), key).toContain(flat(a.text)));
  });

  it.each(specs.map((s) => [s.code, s] as const))("%s: complete data has nothing missing", (_code, spec) => {
    expect(missingIds(spec, complete(spec))).toEqual([]);
  });

  it("plaintiff (band 1): father name and age are required, occupation only where possible", () => {
    const spec = specOf("ابطال چک");
    const d = complete(spec);
    const v = validatePetition(spec, { ...d, plaintiffs: [person("مریم", "احمدی", { fatherName: "", age: "", occupation: "" })] });
    expect(checkOf(v.checks, "plaintiffs.0")).toMatchObject({ status: "missing", article: "51", band: "بند ۱", defect53: false });
    expect(checkOf(v.checks, "plaintiffs.0")?.message).toContain("نام پدر، سن");
    expect(checkOf(v.checks, "plaintiffs.0.occupation")?.status).toBe("warning");
  });

  it("defendant (band 2): occupation is listed without «حتی‌المکان» and falls under article 53", () => {
    const spec = specOf("ابطال چک");
    const v = validatePetition(spec, { ...complete(spec), defendants: [person("حسین", "محمدی", { occupation: "" })] });
    expect(checkOf(v.checks, "defendants.0")).toMatchObject({ status: "missing", band: "بند ۲", defect53: true });
    expect(validatePetition(spec, { ...complete(spec), defendants: [] }).checks.find((c) => c.id === "defendants")?.status).toBe("missing");
  });

  it("legal persons need only their name and domicile (note 2)", () => {
    const spec = specOf("ابطال چک");
    const company = { ...emptyParty(), partyType: "LEGAL" as const, legalName: "شرکت آریا ترابر", address: ADDRESS };
    const v = validatePetition(spec, { ...complete(spec), defendants: [company] });
    expect(checkOf(v.checks, "defendants.0")).toMatchObject({ status: "ok", band: "تبصره ۲" });
  });

  it("value (band 3): required for a financial claim unless it cannot be determined", () => {
    const spec = specOf("ابطال چک");
    const d = complete(spec);
    expect(checkOf(validatePetition(spec, { ...d, claim: { ...d.claim, value: "" } }).checks, "claim.value")?.status).toBe("missing");
    expect(checkOf(validatePetition(spec, { ...d, claim: { ...d.claim, value: "", valueBasis: "مبلغ نامعین (با جلب نظر کارشناس)" } }).checks, "claim.value")?.status).toBe("warning");
    expect(checkOf(validatePetition(spec, { ...d, claim: { ...d.claim, valueType: "GHEIR_MALI", value: "" } }).checks, "claim.value")?.status).toBe("ok");
    const bySubject = specOf("ابطال صورتجلسه مجمع عمومی");
    expect(checkOf(validatePetition(bySubject, { ...complete(bySubject), claim: { ...complete(bySubject).claim, valueType: null } }).checks, "claim.valueType")?.status).toBe("missing");
  });

  it("grounds (band 4): every blank of the body must be filled", () => {
    const spec = specOf("ابطال رای داور (مالی)");
    const v = validatePetition(spec, { ...complete(spec), blanks: {} });
    expect(checkOf(v.checks, "body.grounds")).toMatchObject({ status: "missing", defect53: true });
    expect(checkOf(v.checks, "body.grounds")?.message).toContain("لحاظ");
  });

  it("evidence (band 6): required items, investigations as substitute, and witnesses' details", () => {
    const strict = specOf("ابطال شناسنامه");
    const required = strict.requirements.flatMap((r) => ("evidence" in r && r.evidence.required ? [r.evidence.label] : []));
    const d = complete(strict);
    const v = validatePetition(strict, { ...d, evidence: d.evidence.map((e) => ({ ...e, include: !required.includes(e.label) })) });
    expect(checkOf(v.checks, "evidence")?.status).toBe("missing");
    expect(checkOf(v.checks, "evidence")?.message).toContain(required[0]);

    const lenient = specOf("ابطال اجرائیه (موضوع اجرائیه مالی است)");
    expect(lenient.rules.evidenceOptionalWithInvestigation).toBe(true);
    const viaInvestigation = { ...complete(lenient), evidence: [], investigations: ["معاینه محلی"] };
    expect(checkOf(validatePetition(lenient, viaInvestigation).checks, "evidence")?.status).toBe("ok");
    const noRule = specOf("ابطال چک");
    expect(checkOf(validatePetition(noRule, { ...complete(noRule), evidence: [], investigations: ["معاینه محلی"] }).checks, "evidence")?.status).toBe("missing");

    const testimony = { ...complete(lenient), investigations: ["شهادت شهود و مطلعین"] };
    expect(checkOf(validatePetition(lenient, testimony).checks, "witnesses")).toMatchObject({ status: "missing", anchor: ANCHORS.witnesses.text });
    expect(checkOf(validatePetition(lenient, { ...testimony, witnesses: [{ name: "مهدی صادقی", details: "", address: ADDRESS }] }).checks, "witnesses")?.status).toBe("ok");
    expect(checkOf(validatePetition(lenient, { ...complete(lenient), evidence: [{ label: "گواهی پزشکی قانونی", detail: "", include: true }] }).checks, "witnesses")).toBeUndefined();
  });

  it("appeal: article 341 items are checked against the challenged decision", () => {
    const spec = specOf("تجدیدنظرخواهی از رأی دادگاه بدوی");
    const d = complete(spec);
    const v = validatePetition(spec, { ...d, decision: { ...d.decision, number: "", serviceDate: "" } });
    const failing = v.checks.filter((c) => c.status === "missing" && c.article === "341").map((c) => c.label);
    expect(failing).toEqual(expect.arrayContaining(["حکم یا قرار مورد تجدیدنظر", "تاریخ ابلاغ رأی"]));
    expect(v.checks.filter((c) => c.article === "343").map((c) => c.status)).toEqual(["info"]);
  });

  it("counts required checks for the progress ring", () => {
    const spec = specOf("ابطال چک");
    const v = validatePetition(spec, { ...complete(spec), defendants: [] });
    expect(v.required).toBe(v.ok + v.missing);
    expect(v.missing).toBeGreaterThan(0);
  });
});

describe("petition sheet", () => {
  const spec = specOf("ابطال رای داور (مالی)");

  it("fills bound blanks from structured data and leaves unfilled ones visible", () => {
    const d = { ...complete(spec), blanks: {} };
    const body = fillBody(spec, d);
    expect(body.lines[0]).toBe("ریاست محترم شعبه ۱۲ دادگاه عمومی حقوقی تهران");
    expect(body.text).toContain("………… (لحاظ)");
    expect(userBlanks(spec)).not.toContain("مرجع رسیدگی");
    expect(Object.keys(BLANK_BINDINGS)).toContain("مرجع رسیدگی");
  });

  it("puts a chosen optional clause before the closing line", () => {
    const clause = spec.optionalClauses[0];
    const text = fillBody(spec, { ...complete(spec), clauses: [clause.condition] }).text;
    expect(text.indexOf(clause.text)).toBeGreaterThan(0);
    expect(text.indexOf(clause.text)).toBeLessThan(text.indexOf("با تشکر و تجدید احترام"));
    expect(fillBody(spec, complete(spec)).text).not.toContain(clause.text);
  });

  it("renders every party per article 51, escapes input and survives sanitising", () => {
    const d = { ...complete(spec), plaintiffs: [person("مریم", "احمدی"), person("<script>alert(1)</script>", "کریمی")], representatives: [{ kind: "LAWYER" as const, firstName: "سارا", lastName: "رحیمی", licenseNo: "۱۲۳۴۵", address: ADDRESS, phone: "" }] };
    const html = renderPetitionHtml(spec, d);
    expect(html).toContain("خواهان ۱");
    expect(html).toContain("خواهان ۲");
    expect(html).toContain("شماره پروانه: ۱۲۳۴۵");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("۵۰۰٬۰۰۰٬۰۰۰ ریال");
    const clean = sanitizeLegalHtml(html);
    expect(clean).toContain("<table>");
    expect(clean).toContain("نام پدر");
  });

  it("names the sides of objection and incidental petitions", () => {
    const appeal = specOf("تجدیدنظرخواهی از رأی دادگاه بدوی");
    expect(renderPetitionHtml(appeal, complete(appeal))).toContain("تجدیدنظرخوانده");
    const joinder = specOf("جلب شخص ثالث");
    const html = renderPetitionHtml(joinder, complete(joinder));
    expect(html).toContain("مجلوب ثالث");
    expect(html).toContain("پرونده اصلی");
  });

  it("formats amounts with Persian digits and the Arabic thousands separator", () => {
    expect(formatAmount("1200000")).toBe("۱٬۲۰۰٬۰۰۰");
    expect(formatAmount("۱۲٬۰۰۰ ریال")).toBe("۱۲٬۰۰۰");
    expect(formatAmount("")).toBe("");
  });
});

describe("petition studio model", () => {
  it("sends every unfinished check of an empty petition to the step that can fix it", () => {
    const stray = specs.flatMap((spec) => validatePetition(spec, emptyPetitionData()).checks
      .filter((c) => (c.status === "missing" || c.status === "warning") && stepOf(c.field) === "review")
      .map((c) => `${spec.title}: ${c.id} (${c.field})`));
    expect(stray).toEqual([]);
  });

  it("counts missing checks per step and none once the petition is complete", () => {
    const spec = specOf("ابطال چک");
    const empty = countSteps(validatePetition(spec, emptyPetitionData()).checks);
    expect(empty.parties).toBe(2);
    expect(empty.claim).toBeGreaterThan(0);
    expect(countSteps(validatePetition(spec, complete(spec)).checks)).toEqual({});
  });

  it("builds the copy-for-system rows in the order of the filing form", () => {
    const spec = specOf("ابطال چک");
    const d = complete(spec);
    const rows = systemRows(spec, d, sideLabels(spec));
    expect(rows.map((r) => r.label)).toEqual(["خواهان", "خوانده", "خواسته", "بهای خواسته", "دلایل و منضمات", "مرجع رسیدگی", "شرح دادخواست"]);
    expect(rows[0].value).toContain("مریم احمدی، فرزند حسن");
    expect(rows[3].value).toBe(`${formatAmount(d.claim.value)} ریال`);
    expect(rows[6].value).toBe(fillBody(spec, d).text);
  });

  it("splits a template line into text and blanks, and sends only spec columns to the browser", () => {
    expect(templateParts("ریاست محترم {{مرجع رسیدگی}} با سلام")).toEqual([
      { text: "ریاست محترم ", blank: false }, { text: "مرجع رسیدگی", blank: true }, { text: " با سلام", blank: false },
    ]);
    const spec = specOf("ابطال چک");
    const withRowColumns = { ...spec, createdAt: new Date(), sourceSha256: "x" } as PetitionSpec;
    const plain = plainSpec(withRowColumns);
    expect(Object.keys(plain)).not.toContain("createdAt");
    expect(Object.keys(plain)).not.toContain("sourceSha256");
    expect(plain).toEqual(spec);
  });
});

describe("AI petition-body suggestions", () => {
  it("keeps only requested, non-empty blanks from the model's JSON, even inside a code fence", () => {
    const reply = "پیشنهاد:\n```json\n{\"تاریخ\": \"۱۴۰۰/۰۵/۱۰\", \"مهریه\": \"\", \"کلید ناخواسته\": \"x\"}\n```";
    expect(parseBodySuggestion(reply, ["تاریخ", "مهریه"])).toEqual({ "تاریخ": "۱۴۰۰/۰۵/۱۰" });
    expect(parseBodySuggestion("بدون JSON", ["تاریخ"])).toEqual({});
    expect(parseBodySuggestion("{خراب}", ["تاریخ"])).toEqual({});
    expect(parseBodySuggestion("[\"آرایه\"]", ["تاریخ"])).toEqual({});
  });
});

describe("راهنمای جای خالی و سنجش پیشنهاد شرح خواسته", () => {
  // قالب «استرداد ثمن معامله» (FK-459FDCAB): برچسب «لحاظ» به‌تنهایی بی‌معناست و مدل محلی تاریخ امروز را در آن گذاشت
  const TEMPLATE = "ریاست محترم {{مرجع رسیدگی}}\nبه موجب مستندات ابرازی اینجانب مبلغ {{اینجانب مبلغ}} به عنوان ثمن معامله به خوانده پرداخت نموده که به لحاظ {{لحاظ}} قرارداد تنظیمی از اعتبار ساقط و علیرغم مراجعه و مطالبه ثمن پرداختی متأسفانه خوانده از استرداد آن خودداری می نماید";
  it("جمله هر جای خالی با «[____]» و جاهای خالی دیگر با «…»", () => {
    const s = blankSentence(TEMPLATE, "لحاظ");
    expect(s).toContain("به لحاظ [____] قرارداد تنظیمی از اعتبار ساقط");
    expect(s).toContain("مبلغ … به عنوان ثمن");
    expect(blankSentence(TEMPLATE, "ناموجود")).toBe("");
  });
  const SENT = "<case>شرح پرونده: موکل مجموعاً ۵٬۵۰۰٬۰۰۰٬۰۰۰ ریال پرداخت کرده؛ اظهارنامه فسخ مورخ ۱۴۰۵/۰۶/۲۵</case>";
  it("مبلغ با جداکننده دیگر پذیرفته و مبلغ یا تاریخ ساختگی کنار گذاشته می‌شود", () => {
    const g = groundBodySuggestion({
      "اینجانب مبلغ": "۵,۵۰۰,۰۰۰,۰۰۰ ریال",
      "لحاظ": "فسخ معامله با اظهارنامه مورخ ۱۴۰۵/۰۶/۲۵",
      "تاریخ": "۱۴۰۵/۰۸/۲۷",
      "خسارت": "۷۰۰٬۰۰۰٬۰۰۰ ریال",
    }, SENT);
    expect(Object.keys(g.kept)).toEqual(["اینجانب مبلغ", "لحاظ"]);
    expect(g.dropped).toEqual(["تاریخ", "خسارت"]);
  });
  it("جای خالی متنی مقدار فقط‌عددی نمی‌پذیرد و پاسخ تودرتو (filled_blanks) هم خوانده می‌شود", () => {
    // دو پاسخ واقعی مدل محلی در آزمون زنده
    const live = '{"title": "استرداد ثمن معامله", "filled_blanks": {"اینجانب مبلغ": "۵,۵۰۰,۰۰۰,۰۰۰ ریال", "لحاظ": "۶۴/۱۲"}, "template": "…"}';
    const parsed = parseBodySuggestion(live, ["اینجانب مبلغ", "لحاظ"]);
    expect(parsed).toEqual({ "اینجانب مبلغ": "۵,۵۰۰,۰۰۰,۰۰۰ ریال", "لحاظ": "۶۴/۱۲" });
    const g = groundBodySuggestion(parsed, SENT);
    expect(g.kept).toEqual({ "اینجانب مبلغ": "۵,۵۰۰,۰۰۰,۰۰۰ ریال" });
    expect(g.dropped).toEqual(["لحاظ"]);
  });
  it("مقداری که جمله خود قالب را بازمی‌گرداند پذیرفته نیست؛ علت واقعی پذیرفته است", () => {
    // پاسخ واقعی سوم مدل محلی: همان جمله قالب به‌جای علت بی‌اعتباری قرارداد
    const echo = "به موجب مستندات ابرازی اینجانب مبلغ ۵,۵۰۰,۰۰۰,۰۰۰ ریال به عنوان ثمن معامله به خوانده پرداخت نموده که به لحاظ اعتبار ساقط";
    const g = groundBodySuggestion({ "لحاظ": echo }, SENT, TEMPLATE);
    expect(g.dropped).toEqual(["لحاظ"]);
    expect(groundBodySuggestion({ "لحاظ": "فسخ معامله توسط خواهان به استناد ماده ۶ مبایعه‌نامه" }, SENT, TEMPLATE).dropped).toEqual([]);
  });
  it("متن بدون عدد سنجیده نمی‌شود و عددهای کوتاه (مانند ۱۰ روز) معیار نیستند", () => {
    expect(groundBodySuggestion({ "لحاظ": "فسخ قرارداد ظرف ۱۰ روز" }, SENT).dropped).toEqual([]);
  });
});
