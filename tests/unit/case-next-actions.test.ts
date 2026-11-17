/* eslint-disable ts-patterns/no-magic-numbers -- fixtures use literal dates and counts */
// قاعده‌های اقدام بعدی پرونده با تاریخ ثابت: هر قاعده جداگانه، ترتیب فوری → اطلاعی، سقف تعداد و پرونده مختومه
import { describe, expect, it } from "vitest";
import { nextActions, type CaseFacts } from "@/lib/case-next-actions";

const NOW = new Date("2026-11-17T08:00:00Z");
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const clean: CaseFacts = {
  caseId: "c1", status: "IN_PROGRESS", hasResponsible: true, courtCaseNumber: "140509980000123",
  deadlines: [], tasks: [], drafts: [{ id: "d1", title: "لایحه", status: "DRAFT", petition: false }], documents: 2,
  parties: [{ name: "مریم احمدی", role: "خواهان", address: "تهران، خیابان آزادی، پلاک ۱۲" }], events: [], lastActivityAt: at(-1), canDraft: true,
};
const ids = (f: Partial<CaseFacts>) => nextActions({ ...clean, ...f }, NOW).map((a) => a.id);

describe("case next actions", () => {
  it("suggests nothing for a tidy active case or a closed one", () => {
    expect(nextActions(clean, NOW)).toEqual([]);
    expect(nextActions({ ...clean, status: "CLOSED", hasResponsible: false, documents: 0 }, NOW)).toEqual([]);
  });

  it("flags overdue, imminent and unverified legal deadlines with the right tone", () => {
    const actions = nextActions({ ...clean, deadlines: [
      { id: "a", title: "تجدیدنظر", dueAt: at(-2), status: "OPEN", isLegal: true, verifiedAt: NOW },
      { id: "b", title: "لایحه دفاعیه", dueAt: at(1), status: "OPEN", isLegal: false, verifiedAt: null },
      { id: "c", title: "واخواهی", dueAt: at(10), status: "OPEN", isLegal: true, verifiedAt: null },
      { id: "d", title: "انجام‌شده", dueAt: at(-5), status: "DONE", isLegal: false, verifiedAt: null },
    ] }, NOW);
    expect(actions.map((a) => [a.id, a.tone])).toEqual([["deadlines-late", "danger"], ["deadline-soon-b", "warning"], ["deadline-verify-c", "warning"]]);
    expect(actions[0].title).toBe("۱ مهلت از موعد گذشته");
  });

  it("covers tasks, drafts, documents, parties, hearings and idleness", () => {
    expect(ids({ hasResponsible: false })).toEqual(["assign"]);
    expect(ids({ tasks: [{ id: "t", title: "پیگیری", status: "TODO", dueAt: at(-1) }, { id: "u", title: "گزارش", status: "WAITING_REVIEW", dueAt: null }] })).toEqual(["tasks-late", "tasks-review"]);
    expect(ids({ drafts: [{ id: "x", title: "دادخواست", status: "CHANGES_REQUESTED", petition: true }, { id: "y", title: "اظهارنامه", status: "APPROVED", petition: false }] })).toEqual(["draft-fix-x", "draft-final-y"]);
    expect(ids({ courtCaseNumber: null, drafts: [{ id: "p", title: "دادخواست", status: "FINAL", petition: true }] })).toEqual(["court-number"]);
    expect(ids({ drafts: [] })).toEqual(["petition"]);
    expect(ids({ drafts: [], canDraft: false })).toEqual([]);
    expect(ids({ documents: 0 })).toEqual(["documents"]);
    expect(ids({ parties: [{ name: "حسین محمدی", role: "خوانده", address: null }, { name: "شاهد", role: "شاهد", address: null }] })).toEqual(["address"]);
    expect(ids({ events: [{ id: "e", title: "جلسه اول", type: "HEARING", startAt: at(2) }, { id: "f", title: "دیدار", type: "MEETING", startAt: at(1) }] })).toEqual(["hearing-e"]);
    expect(ids({ lastActivityAt: at(-45) })).toEqual(["idle"]);
  });

  it("orders urgent first, merges missing addresses and keeps at most eight suggestions", () => {
    const actions = nextActions({
      ...clean, hasResponsible: false, documents: 0, drafts: [], lastActivityAt: at(-40),
      deadlines: [{ id: "a", title: "الف", dueAt: at(-1), status: "OPEN", isLegal: true, verifiedAt: null }],
      parties: ["الف", "ب", "ج"].map((name) => ({ name, role: "خوانده", address: "" })),
    }, NOW);
    expect(actions.map((a) => a.id)).toEqual(["deadlines-late", "assign", "deadline-verify-a", "address", "petition", "documents", "idle"]);
    expect(actions.find((a) => a.id === "address")?.title).toBe("تکمیل نشانی ۳ طرف دعوا");
    expect(actions.find((a) => a.id === "petition")?.href).toBe("/petitions?caseId=c1");
    const many = nextActions({ ...clean, deadlines: Array.from({ length: 10 }, (_, i) => ({ id: `v${i}`, title: `مهلت ${i}`, dueAt: at(10 + i), status: "OPEN", isLegal: true, verifiedAt: null })) }, NOW);
    expect(many).toHaveLength(8);
  });
});
