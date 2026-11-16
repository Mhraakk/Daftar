import type { FieldDef } from "@/components/ui/smart-form";

export const clientFields = (assigneeLabel?: string): FieldDef[] => [
  { name: "type", label: "نوع شخص", type: "select", required: true, options: [{ value: "PERSON", label: "حقیقی" }, { value: "LEGAL", label: "حقوقی" }] },
  { name: "nationalId", label: "کد ملی / شناسه ملی", ltr: true, placeholder: "۱۰ رقم (حقیقی) یا ۱۱ رقم (حقوقی)" },
  { name: "firstName", label: "نام", required: true, showIf: { field: "type", equals: "PERSON" }, autoFocus: true },
  { name: "lastName", label: "نام خانوادگی", required: true, showIf: { field: "type", equals: "PERSON" } },
  { name: "fatherName", label: "نام پدر", showIf: { field: "type", equals: "PERSON" } },
  { name: "birthDate", label: "تاریخ تولد", type: "jdate", showIf: { field: "type", equals: "PERSON" } },
  { name: "companyName", label: "نام شخص حقوقی", required: true, span: 2, showIf: { field: "type", equals: "LEGAL" } },
  { name: "mobile", label: "تلفن همراه", ltr: true, placeholder: "09xxxxxxxxx" },
  { name: "phone", label: "تلفن ثابت", ltr: true },
  { name: "email", label: "ایمیل", ltr: true },
  { name: "postalCode", label: "کد پستی", ltr: true },
  { name: "address", label: "نشانی", span: 2 },
  { name: "assignedToId", label: "کارمند مسئول", type: "lookup", lookup: "user", lookupLabel: assigneeLabel, hint: "در صورت خالی‌بودن، ثبت‌کننده مسئول خواهد بود." },
  { name: "notes", label: "توضیحات", type: "textarea", rows: 2 },
];
