// ساخت زمینه پرونده و اسناد برای هوش مصنوعی با «کمینه‌سازی داده»: فقط آنچه کاربر انتخاب کرده و برای کار لازم است
// ارسال می‌شود؛ کد ملی و شماره تماس پوشانده می‌شوند و فهرست دقیق داده ارسالی برای ثبت در تاریخچه ساخته می‌شود.
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { formatJalali } from "@/lib/jalali";
import { CASE_STATUS, CONFIDENTIALITY, DEADLINE_STATUS, DEADLINE_TYPE, TASK_STATUS } from "@/lib/labels";
import { can, type SessionUser } from "@/lib/auth/guard";
import { assertCaseAccess, documentScope } from "@/server/access";
import type { AiSettings } from "./config";
import { isExternalProvider } from "./config";

const MASK_KEEP = 3;
const MAX_DEADLINES = 25;
const MAX_TASKS = 20;
const MAX_NOTES = 15;
const NOTE_MAX = 600;
const BYTES_PER_KB = 1_024;

export interface DocForAi {
  id: string;
  code: string;
  title: string;
  confidentiality: string;
  fileName: string;
  text: string;
  textStatus: string;
  caseId: string | null;
}

export interface DataScope {
  external: boolean;
  destination: string;
  items: { label: string; bytes: number }[];
  totalBytes: number;
}

const mask = (v: string | null | undefined): string => (v ? `${"•".repeat(Math.max(0, v.length - MASK_KEEP))}${v.slice(-MASK_KEEP)}` : "—");
export const byteLen = (s: string): number => Buffer.byteLength(s, "utf8");
export const kb = (bytes: number): string => `${Math.max(1, Math.round(bytes / BYTES_PER_KB))}KB`;

const legalTag = (d: { isLegal: boolean; verifiedAt: Date | null }): string => {
  if (!d.isLegal) return "";
  return d.verifiedAt ? "، مهلت قانونی تأییدشده" : "، مهلت قانونی تأییدنشده";
};

/** خلاصه ساخت‌یافته پرونده (پرونده = matter در مهارت‌ها) */
export async function caseContextText(caseId: string, user: SessionUser): Promise<{ text: string; number: string; title: string }> {
  await assertCaseAccess(user, caseId);
  const c = await db.case.findUniqueOrThrow({
    where: { id: caseId },
    include: {
      client: { select: { displayName: true, type: true, nationalId: true } },
      parties: { orderBy: { createdAt: "asc" }, select: { role: true, name: true, nationalId: true } },
      deadlines: { where: { status: { not: "CANCELLED" } }, orderBy: { dueAt: "asc" }, take: MAX_DEADLINES, select: { title: true, type: true, dueAt: true, status: true, isLegal: true, verifiedAt: true } },
      tasks: { orderBy: { createdAt: "desc" }, take: MAX_TASKS, select: { title: true, status: true, dueAt: true } },
      notes: { orderBy: { createdAt: "desc" }, take: MAX_NOTES, select: { body: true, createdAt: true } },
    },
  });
  const lines = [
    `شماره پرونده در دفتر: ${c.number}`,
    `عنوان: ${c.title}`,
    `موضوع/دسته: ${c.category}`,
    `وضعیت: ${CASE_STATUS[c.status]?.label ?? c.status}`,
    `تاریخ تشکیل در دفتر: ${formatJalali(c.openedAt)}`,
    c.courtName ? `مرجع رسیدگی: ${c.courtName}${c.courtBranch ? ` — شعبه ${c.courtBranch}` : ""}` : null,
    c.courtCaseNumber ? `شماره پرونده در مرجع: ${c.courtCaseNumber}` : null,
    `مراجع (موکل): ${c.client.displayName} — شناسه/کد ملی: ${mask(c.client.nationalId)}`,
    c.description ? `شرح پرونده: ${c.description}` : null,
    c.parties.length ? `طرفین و اشخاص:\n${c.parties.map((p) => `- ${p.role}: ${p.name}${p.nationalId ? ` (شناسه ${mask(p.nationalId)})` : ""}`).join("\n")}` : null,
    c.deadlines.length ? `مهلت‌ها:\n${c.deadlines.map((d) => `- ${formatJalali(d.dueAt)} — ${d.title} [${DEADLINE_TYPE[d.type] ?? d.type}، ${DEADLINE_STATUS[d.status]?.label ?? d.status}${legalTag(d)}]`).join("\n")}` : null,
    c.tasks.length ? `وظایف اخیر:\n${c.tasks.map((t) => `- ${t.title} [${TASK_STATUS[t.status]?.label ?? t.status}${t.dueAt ? `، مهلت ${formatJalali(t.dueAt)}` : ""}]`).join("\n")}` : null,
    c.notes.length ? `یادداشت‌های پرونده:\n${c.notes.map((n) => `- (${formatJalali(n.createdAt)}) ${n.body.length > NOTE_MAX ? `${n.body.slice(0, NOTE_MAX)}…` : n.body}`).join("\n")}` : null,
  ].filter((x): x is string => !!x);
  return { text: lines.join("\n"), number: c.number, title: c.title };
}

/** اسناد انتخاب‌شده با بررسی دسترسی و سطح محرمانگی؛ متن آخرین نسخه استخراج‌شده */
export async function documentsForAi(ids: string[], user: SessionUser, settings: AiSettings, includeConfidential: boolean): Promise<DocForAi[]> {
  if (!ids.length) return [];
  const docs = await db.document.findMany({
    where: { id: { in: ids }, AND: [documentScope(user)] },
    include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } },
  });
  if (docs.length !== new Set(ids).size) throw new AppError("یک یا چند سند انتخاب‌شده یافت نشد یا به آن دسترسی ندارید.");
  const sensitive = docs.filter((d) => d.confidentiality !== "NORMAL");
  if (sensitive.length && !includeConfidential) {
    throw new AppError(`سند محرمانه انتخاب شده است (${sensitive.map((d) => d.title).join("، ")}). برای ارسال، گزینه «شامل اسناد محرمانه» را آگاهانه تأیید کنید.`);
  }
  if (sensitive.length && !can(user, "document.view_confidential")) throw new AppError("مجوز ارسال اسناد محرمانه را ندارید.");
  if (sensitive.length && isExternalProvider(settings) && !settings.allowConfidential) {
    throw new AppError("ارسال اسناد محرمانه به ارائه‌دهنده بیرون از شبکه دفتر در تنظیمات هوش مصنوعی مجاز نشده است.");
  }
  const empty = docs.filter((d) => !d.versions[0]?.extractedText?.trim());
  if (empty.length) {
    throw new AppError(`متن قابل‌خواندنی از این اسناد استخراج نشده است: ${empty.map((d) => d.title).join("، ")}. برای اسناد اسکن‌شده، پایان OCR را منتظر بمانید.`);
  }
  return ids.map((id) => docs.find((d) => d.id === id)!).map((d) => ({
    id: d.id, code: d.code, title: d.title, confidentiality: CONFIDENTIALITY[d.confidentiality]?.label ?? d.confidentiality,
    fileName: d.versions[0]?.fileName ?? "", text: d.versions[0]?.extractedText ?? "", textStatus: d.versions[0]?.textStatus ?? "NONE", caseId: d.caseId,
  }));
}

/** قالب ارسال سند: متن داخل مرز روشن تا دستورهای احتمالی درون سند، دستور کاربر تلقی نشود */
export function documentBlock(d: DocForAi, index: number): string {
  return `<document index="${index + 1}" code="${d.code}" title="${d.title.split("\"").join("'")}" file="${d.fileName.split("\"").join("'")}" confidentiality="${d.confidentiality}">\n${d.text}\n</document>`;
}

export function describeScope(settings: AiSettings, items: { label: string; text: string }[]): DataScope {
  const external = isExternalProvider(settings);
  let host = settings.baseUrl;
  try { host = new URL(settings.baseUrl).host; } catch { /* نشانی نامعتبر در اعتبارسنجی تنظیمات رد می‌شود */ }
  const list = items.filter((i) => i.text).map((i) => ({ label: i.label, bytes: byteLen(i.text) }));
  return { external, destination: `${external ? "سرور بیرون از شبکه دفتر" : "سرور داخل شبکه دفتر"}: ${host} (${settings.model})`, items: list, totalBytes: list.reduce((s, i) => s + i.bytes, 0) };
}

export const scopeSummary = (s: DataScope): string =>
  `${s.items.map((i) => `${i.label} (${kb(i.bytes)})`).join(" · ")} → ${s.destination}`;
