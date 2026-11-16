// فیلدهای فرم ثبت/ویرایش منبع کتابخانه
import type { FieldDef } from "@/components/ui/smart-form";
import { SOURCE_STATUS } from "@/lib/labels";
import { SOURCE_KINDS } from "@/server/legal-library";

const TEXT_ROWS = 10;
// eslint-disable-next-line ts-patterns/no-magic-numbers -- FieldDef.span needs the literal type 2
const FULL = 2 as const;

const KIND_OPTIONS = Object.entries(SOURCE_KINDS).map(([value, label]) => ({ value, label }));
const STATUS_OPTIONS = Object.entries(SOURCE_STATUS).map(([value, m]) => ({ value, label: m.label }));

export const SOURCE_FIELDS: FieldDef[] = [
  { name: "kind", label: "نوع منبع", type: "select", required: true, options: KIND_OPTIONS },
  { name: "status", label: "وضعیت اعتبار", type: "select", options: STATUS_OPTIONS },
  { name: "title", label: "عنوان", required: true, span: FULL, placeholder: "مثلاً: رأی وحدت رویه شماره ۸۱۱" },
  { name: "reference", label: "مرجع / نام قانون", placeholder: "مثلاً: هیأت عمومی دیوان عالی کشور" },
  { name: "articleNo", label: "شماره ماده / رأی" },
  { name: "text", label: "متن کامل", type: "textarea", required: true, rows: TEXT_ROWS, span: FULL },
  { name: "statusNote", label: "توضیح وضعیت", placeholder: "مثلاً: اصلاحی ۱۴۰۲/۰۳/۰۱", span: FULL },
  { name: "sourceName", label: "نام منبع رسمی", placeholder: "مثلاً: روزنامه رسمی شماره …" },
  { name: "sourceUrl", label: "نشانی منبع", ltr: true, placeholder: "https://…" },
  { name: "retrievedAt", label: "تاریخ بازیابی از منبع", type: "jdate" },
  { name: "tags", label: "برچسب‌ها", type: "tags" },
];

/** ماده قانون واردشده: فقط متن، وضعیت و برچسب‌ها قابل اصلاح است */
export const LAW_ARTICLE_FIELDS: FieldDef[] = SOURCE_FIELDS.filter((f) => ["status", "statusNote", "text", "tags"].includes(f.name));
