import type { FieldDef } from "@/components/ui/smart-form";
import { OPT } from "./options";

export const caseFields = (o: { clientLabel?: string; responsibleLabel?: string; lockClient?: boolean; canAssign?: boolean } = {}): FieldDef[] => [
  { name: "title", label: "عنوان پرونده", required: true, span: 2, placeholder: "مثلاً مطالبه وجه چک", autoFocus: true },
  ...(o.lockClient ? [] : [{ name: "clientId", label: "مراجعه‌کننده", type: "lookup" as const, lookup: "client" as const, lookupLabel: o.clientLabel, required: true }]),
  { name: "category", label: "دسته‌بندی", type: "select", required: true, options: OPT.caseCategory },
  { name: "priority", label: "اولویت", type: "select", required: true, options: OPT.priority },
  ...(o.canAssign ? [{ name: "responsibleId", label: "کارمند مسئول", type: "lookup" as const, lookup: "user" as const, lookupLabel: o.responsibleLabel, hint: "می‌توانید بعداً ارجاع دهید." }] : []),
  { name: "courtName", label: "مرجع قضایی", placeholder: "مثلاً دادگاه عمومی حقوقی تهران" },
  { name: "courtBranch", label: "شعبه" },
  { name: "courtCaseNumber", label: "شماره / کلاسه پرونده قضایی", ltr: true },
  { name: "archiveNumber", label: "شماره بایگانی شعبه", ltr: true },
  { name: "description", label: "شرح موضوع", type: "textarea", rows: 3 },
];

export const taskFields = (o: { canAssign?: boolean; withCase?: boolean } = {}): FieldDef[] => [
  { name: "title", label: "عنوان وظیفه", required: true, span: 2, autoFocus: true },
  ...(o.canAssign ? [{ name: "assigneeId", label: "مجری", type: "lookup" as const, lookup: "user" as const, hint: "خالی = خودم" }] : []),
  { name: "priority", label: "اولویت", type: "select", required: true, options: OPT.priority },
  { name: "dueDate", label: "مهلت انجام", type: "jdate" },
  { name: "dueTime", label: "ساعت", type: "time" },
  ...(o.withCase ? [{ name: "caseId", label: "پرونده مرتبط", type: "lookup" as const, lookup: "case" as const, span: 2 as const }] : []),
  { name: "description", label: "شرح", type: "textarea", rows: 3 },
  { name: "requiresApproval", label: "نتیجه این وظیفه نیازمند تأیید است", type: "checkbox", hint: "پس از اعلام انجام، وظیفه برای تأییدکننده ارسال می‌شود." },
  { name: "approverId", label: "تأییدکننده", type: "lookup", lookup: "user", showIf: { field: "requiresApproval", equals: true } },
  { name: "secondApproverId", label: "تأییدکننده نهایی (اختیاری)", type: "lookup", lookup: "user", showIf: { field: "requiresApproval", equals: true }, hint: "برای گردش کار دومرحله‌ای" },
];

export const deadlineFields = (o: { withCase?: boolean; assigneeLabel?: string } = {}): FieldDef[] => [
  { name: "title", label: "عنوان مهلت", required: true, span: 2, autoFocus: true },
  { name: "type", label: "نوع", type: "select", required: true, options: OPT.deadlineType },
  { name: "priority", label: "اولویت", type: "select", required: true, options: OPT.priority },
  { name: "dueDate", label: "تاریخ سررسید", type: "jdate", required: true },
  { name: "dueTime", label: "ساعت", type: "time", hint: "خالی = پایان روز" },
  { name: "assigneeId", label: "مسئول پیگیری", type: "lookup", lookup: "user", lookupLabel: o.assigneeLabel, hint: "خالی = خودم" },
  ...(o.withCase ? [{ name: "caseId", label: "پرونده مرتبط", type: "lookup" as const, lookup: "case" as const }] : []),
  { name: "reminderOffsets", label: "نوبت‌های یادآوری", type: "multicheck", options: OPT.reminders },
  { name: "isLegal", label: "این یک مهلت قانونی است", type: "checkbox", hint: "مهلت قانونی تا تأیید کارمند مجاز با برچسب «نیازمند تأیید» نمایش داده می‌شود." },
  { name: "legalBasis", label: "مستند قانونی", span: 2, showIf: { field: "isLegal", equals: true }, placeholder: "مثلاً ماده ۳۳۶ ق.آ.د.م" },
  { name: "description", label: "توضیحات", type: "textarea", rows: 2 },
];
