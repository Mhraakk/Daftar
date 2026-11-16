import { CASE_CATEGORIES, DEADLINE_TYPE, DOCUMENT_CATEGORIES, EVENT_TYPE, PARTY_ROLES, PRIORITY } from "./labels";

const fromMap = (m: Record<string, string | { label: string }>) => Object.entries(m).map(([value, v]) => ({ value, label: typeof v === "string" ? v : v.label }));
const fromList = (l: string[]) => l.map((x) => ({ value: x, label: x }));

export const OPT = {
  priority: fromMap(PRIORITY), caseCategory: fromList(CASE_CATEGORIES), partyRole: fromList(PARTY_ROLES), docCategory: fromList(DOCUMENT_CATEGORIES),
  deadlineType: fromMap(DEADLINE_TYPE), eventType: fromMap(EVENT_TYPE),
  confidentiality: [{ value: "NORMAL", label: "عادی" }, { value: "CONFIDENTIAL", label: "محرمانه" }, { value: "RESTRICTED", label: "خیلی محرمانه (فقط افراد مجاز)" }],
  reminders: [{ value: "10080", label: "یک هفته قبل" }, { value: "4320", label: "سه روز قبل" }, { value: "1440", label: "یک روز قبل" }, { value: "120", label: "دو ساعت قبل" }, { value: "30", label: "نیم ساعت قبل" }],
};
