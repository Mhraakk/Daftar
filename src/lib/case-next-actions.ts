// اقدام‌های بعدی پرونده بر پایه قاعده‌های روشن (بدون هوش مصنوعی): هر پیشنهاد دلیل و پیوند انجام آن را دارد.
// تابع خالص است تا در آزمون واحد با تاریخ ثابت سنجیده شود.
import { relativeDay } from "./jalali";
import { sideOf } from "./party-roles";
import { toFaDigits } from "./text";

export type ActionTone = "danger" | "warning" | "accent" | "info";
export interface NextAction { id: string; title: string; detail: string; href: string; tone: ActionTone }

export interface CaseFacts {
  caseId: string;
  status: string;
  hasResponsible: boolean;
  courtCaseNumber: string | null;
  deadlines: { id: string; title: string; dueAt: Date; status: string; isLegal: boolean; verifiedAt: Date | null }[];
  tasks: { id: string; title: string; status: string; dueAt: Date | null }[];
  drafts: { id: string; title: string; status: string; petition: boolean }[];
  documents: number;
  parties: { name: string; role: string; address: string | null }[];
  events: { id: string; title: string; type: string; startAt: Date }[];
  lastActivityAt: Date;
  canDraft: boolean;
}

const MS_PER_DAY = 86_400_000;
const SOON_DAYS = 3;
const HEARING_DAYS = 7;
const IDLE_DAYS = 30;
const MAX_SOON = 3;
const MAX_ACTIONS = 8;
const OPEN_TASK = ["TODO", "IN_PROGRESS", "REJECTED"];
const ACTIVE_CASE = ["INTAKE", "OPEN", "IN_PROGRESS", "WAITING"];
/** ترتیب نمایش از فوری به اطلاعی */
const TONE_ORDER: ActionTone[] = ["danger", "warning", "accent", "info"];
const toneRank = (t: ActionTone): number => TONE_ORDER.indexOf(t);

const fa = (n: number) => toFaDigits(String(n));
const daysBetween = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY);

type Rule = (f: CaseFacts, now: Date, base: string) => NextAction[];

const RULES: Rule[] = [
  (f, _now, base) => (f.hasResponsible ? [] : [{ id: "assign", title: "تعیین مسئول پرونده", detail: "پرونده بدون مسئول در کارتابل کسی قرار نمی‌گیرد.", href: base, tone: "warning" }]),
  (f, now, base) => {
    const late = f.deadlines.filter((d) => d.status === "OPEN" && d.dueAt < now);
    return late.length ? [{ id: "deadlines-late", title: `${fa(late.length)} مهلت از موعد گذشته`, detail: `نخستین: «${late[0].title}» — ${relativeDay(late[0].dueAt, now)}`, href: `${base}?tab=deadlines`, tone: "danger" }] : [];
  },
  (f, now, base) => f.deadlines
    .filter((d) => d.status === "OPEN" && d.dueAt >= now && daysBetween(now, d.dueAt) < SOON_DAYS)
    .slice(0, MAX_SOON)
    .map((d) => ({ id: `deadline-soon-${d.id}`, title: `مهلت «${d.title}»`, detail: `سررسید ${relativeDay(d.dueAt, now)}`, href: `${base}?tab=deadlines`, tone: "warning" as const })),
  (f, _now, base) => f.deadlines
    .filter((d) => d.status === "OPEN" && d.isLegal && !d.verifiedAt)
    .map((d) => ({ id: `deadline-verify-${d.id}`, title: `تأیید مهلت قانونی «${d.title}»`, detail: "مهلت پیشنهادی سامانه تا تأیید مسئول حقوقی قطعی نیست.", href: `${base}?tab=deadlines`, tone: "warning" as const })),
  (f, now, base) => {
    const late = f.tasks.filter((t) => OPEN_TASK.includes(t.status) && t.dueAt && t.dueAt < now);
    return late.length ? [{ id: "tasks-late", title: `${fa(late.length)} وظیفه معوق`, detail: `نخستین: «${late[0].title}»`, href: `${base}?tab=tasks`, tone: "danger" }] : [];
  },
  (f, _now, base) => {
    const waiting = f.tasks.filter((t) => t.status === "WAITING_REVIEW");
    return waiting.length ? [{ id: "tasks-review", title: `بررسی ${fa(waiting.length)} وظیفه انجام‌شده`, detail: "نتیجه کار ثبت شده و منتظر تأیید است.", href: `${base}?tab=tasks`, tone: "info" }] : [];
  },
  (f) => f.drafts.filter((d) => d.status === "CHANGES_REQUESTED").map((d) => ({ id: `draft-fix-${d.id}`, title: `اصلاح سند «${d.title}»`, detail: "بررسی‌کننده درخواست اصلاح داده است.", href: `/drafts/${d.id}`, tone: "warning" as const })),
  (f) => f.drafts.filter((d) => d.status === "APPROVED").map((d) => ({ id: `draft-final-${d.id}`, title: `نهایی‌سازی سند «${d.title}»`, detail: "سند تأیید شده است؛ نسخه نهایی را بسازید و بایگانی کنید.", href: `/drafts/${d.id}`, tone: "accent" as const })),
  (f, _now, base) => (!f.courtCaseNumber && f.drafts.some((d) => d.petition && d.status === "FINAL")
    ? [{ id: "court-number", title: "ثبت شماره پرونده قضایی", detail: "دادخواست نهایی شده است؛ پس از ثبت در سامانه، شماره پرونده را در مشخصات وارد کنید.", href: base, tone: "info" }] : []),
  (f) => (f.canDraft && f.drafts.length === 0 && ACTIVE_CASE.includes(f.status)
    ? [{ id: "petition", title: "تنظیم دادخواست یا لایحه", detail: "هنوز سند حقوقی برای این پرونده تنظیم نشده است.", href: `/petitions?caseId=${f.caseId}`, tone: "accent" }] : []),
  (f, _now, base) => (f.documents === 0 ? [{ id: "documents", title: "بارگذاری مدارک پرونده", detail: "هیچ سندی در پرونده بایگانی نشده است.", href: `${base}?tab=documents`, tone: "info" }] : []),
  (f, _now, base) => {
    const missing = f.parties.filter((p) => sideOf(p.role) !== null && !p.address?.trim()).map((p) => p.name);
    if (!missing.length) return [];
    const title = missing.length === 1 ? `تکمیل نشانی «${missing[0]}»` : `تکمیل نشانی ${fa(missing.length)} طرف دعوا`;
    return [{ id: "address", title, detail: `اقامتگاه طرفین برای ابلاغ لازم است (تبصره ۱ ماده ۵۱ ق.آ.د.م): ${missing.join("، ")}`, href: base, tone: "warning" }];
  },
  (f, now) => f.events
    .filter((e) => e.type === "HEARING" && e.startAt >= now && daysBetween(now, e.startAt) < HEARING_DAYS)
    .map((e) => ({ id: `hearing-${e.id}`, title: `آماده‌سازی جلسه «${e.title}»`, detail: `جلسه ${relativeDay(e.startAt, now)}؛ لایحه و مدارک را آماده کنید.`, href: "/calendar", tone: "warning" as const })),
  (f, now, base) => {
    const idle = daysBetween(f.lastActivityAt, now);
    return idle >= IDLE_DAYS ? [{ id: "idle", title: `پرونده ${fa(idle)} روز بی‌فعالیت است`, detail: "وضعیت پرونده را بررسی و نتیجه را ثبت کنید.", href: `${base}?tab=timeline`, tone: "info" }] : [];
  },
];

/** پیشنهادهای مرتب‌شده از فوری به اطلاعی؛ پرونده مختومه یا بایگانی پیشنهادی ندارد */
export function nextActions(f: CaseFacts, now = new Date()): NextAction[] {
  if (f.status === "CLOSED" || f.status === "ARCHIVED") return [];
  const base = `/cases/${f.caseId}`;
  return RULES.flatMap((rule) => rule(f, now, base))
    .map((a, i) => ({ a, i }))
    .sort((x, y) => toneRank(x.a.tone) - toneRank(y.a.tone) || x.i - y.i)
    .map((x) => x.a)
    .slice(0, MAX_ACTIONS);
}
