import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { LinkButton } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { EmptyState, PageHeader, Panel } from "@/components/ui/page";
import { Seal } from "@/components/ui/seal";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { J_MONTHS, J_WEEKDAYS, formatJalali, fromJalali, jMonthLength, jParts, monthMatrix, shiftMonth } from "@/lib/jalali";
import type { Tone } from "@/lib/labels";
import { OPT } from "@/lib/options";
import { toFaDigits } from "@/lib/text";
import { monthFeed } from "@/server/calendar";
import { cancelEventAction, createEventAction } from "./actions";

export const metadata = { title: "تقویم" };
type SP = { y?: string; m?: string; d?: string; scope?: string };
const dot: Record<string, string> = { neutral: "bg-ink-3", info: "bg-lapis", accent: "bg-firuze", success: "bg-sabz", warning: "bg-zafaran", danger: "bg-mohr" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePagePerm("calendar.view");
  const sp = await searchParams;
  const today = jParts(new Date());
  const jy = Number(sp.y) || today.jy, jm = Math.min(12, Math.max(1, Number(sp.m) || today.jm));
  const scope = sp.scope === "all" ? "all" : "mine";
  const sel = Math.min(jMonthLength(jy, jm), Number(sp.d) || (jy === today.jy && jm === today.jm ? today.jd : 1));
  const [items, holidays, staff] = await Promise.all([
    monthFeed(user, jy, jm, scope),
    db.holiday.findMany({ where: { date: { gte: new Date(fromJalali(jy, jm, 1).getTime() - 86_400_000), lte: new Date(fromJalali(jy, jm, jMonthLength(jy, jm)).getTime() + 86_400_000) } } }),
    db.user.findMany({ where: { isActive: true, NOT: { id: user.id } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
  ]);
  const byDay = new Map<number, typeof items>();
  for (const it of items) { const d = jParts(it.at).jd; byDay.set(d, [...(byDay.get(d) ?? []), it]); }
  const holidayDays = new Map(holidays.map((h) => { const p = jParts(new Date(h.date.getTime() + 12 * 3600_000 - 210 * 60_000)); return [p.jm === jm ? p.jd : -1, h.title] as const; }));
  const prev = shiftMonth(jy, jm, -1), next = shiftMonth(jy, jm, 1);
  const q = (o: Record<string, string | number>) => `/calendar?${new URLSearchParams({ y: String(jy), m: String(jm), scope, ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])) })}`;
  const dayItems = byDay.get(sel) ?? [];
  const p2 = (n: number) => String(n).padStart(2, "0");

  return (
    <>
      <PageHeader title="تقویم" subtitle="رویدادها، مهلت‌ها و سررسید وظایف در یک نما"
        actions={<>
          <div className="flex overflow-hidden rounded-md border border-line-strong text-sm">
            <Link href={q({ scope: "mine" })} className={cn("px-3 py-2", scope === "mine" ? "bg-night text-white" : "bg-surface hover:bg-surface-2")}>تقویم من</Link>
            <Link href={q({ scope: "all" })} className={cn("px-3 py-2", scope === "all" ? "bg-night text-white" : "bg-surface hover:bg-surface-2")}>{can(user, "calendar.view_all") ? "کل دفتر" : "واحد و پرونده‌های من"}</Link>
          </div>
          {can(user, "calendar.manage") && (
            <FormDialog trigger="رویداد جدید" icon={<CalendarPlus />} title="ثبت رویداد" size="lg" action={createEventAction} successMessage="رویداد ثبت شد."
              initial={{ type: "MEETING", date: `${jy}/${p2(jm)}/${p2(sel)}`, remindMinutes: "60" }}
              fields={[
                { name: "title", label: "عنوان", required: true, span: 2, autoFocus: true }, { name: "type", label: "نوع", type: "select", required: true, options: OPT.eventType },
                { name: "date", label: "تاریخ", type: "jdate", required: true }, { name: "startTime", label: "ساعت شروع", type: "time", hint: "خالی = تمام روز" }, { name: "endTime", label: "ساعت پایان", type: "time" },
                { name: "location", label: "محل" }, { name: "caseId", label: "پرونده مرتبط", type: "lookup", lookup: "case" },
                { name: "remindMinutes", label: "یادآوری", type: "select", options: [{ value: "15", label: "۱۵ دقیقه قبل" }, { value: "60", label: "یک ساعت قبل" }, { value: "1440", label: "یک روز قبل" }, { value: "4320", label: "سه روز قبل" }] },
                { name: "forDepartment", label: "نمایش برای همه اعضای واحد من", type: "checkbox" },
                { name: "attendeeIds", label: "شرکت‌کنندگان", type: "multicheck", options: staff.map((s) => ({ value: s.id, label: s.fullName })) },
                { name: "description", label: "توضیحات", type: "textarea", rows: 2 },
              ]} />
          )}
        </>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <LinkButton href={`/calendar?y=${prev.jy}&m=${prev.jm}&scope=${scope}`} size="icon" variant="ghost" aria-label="ماه قبل"><ChevronRight /></LinkButton>
            <div className="flex items-center gap-3"><h2 className="text-lg font-extrabold">{J_MONTHS[jm - 1]} {toFaDigits(jy)}</h2>
              {(jy !== today.jy || jm !== today.jm) && <Link href={`/calendar?scope=${scope}`} className="text-sm text-lapis hover:underline">امروز</Link>}</div>
            <LinkButton href={`/calendar?y=${next.jy}&m=${next.jm}&scope=${scope}`} size="icon" variant="ghost" aria-label="ماه بعد"><ChevronLeft /></LinkButton>
          </div>
          <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-xs font-bold text-ink-2">
            {J_WEEKDAYS.map((w, i) => <div key={w} className={cn("px-1 py-2", i === 6 && "text-mohr")}><span className="hidden sm:inline">{w}</span><span className="sm:hidden">{w[0]}</span></div>)}
          </div>
          <div className="grid grid-cols-7">
            {monthMatrix(jy, jm).flat().map((d, i) => {
              if (!d) return <div key={i} className="min-h-[92px] border-b border-s border-line bg-surface-2/40" />;
              const list = byDay.get(d) ?? [];
              const isToday = jy === today.jy && jm === today.jm && d === today.jd;
              const holiday = holidayDays.get(d);
              const off = i % 7 === 6 || !!holiday;
              return (
                <Link key={i} href={q({ d })} scroll={false} aria-label={`${d} ${J_MONTHS[jm - 1]}، ${list.length} مورد`}
                  className={cn("flex min-h-[92px] flex-col gap-1 border-b border-s border-line p-1.5 transition-colors hover:bg-firuze-50/50", d === sel && "bg-firuze-50 ring-1 ring-inset ring-firuze", off && d !== sel && "bg-mohr-50/30")}>
                  <span className={cn("num flex size-6 items-center justify-center self-start rounded-full text-sm", isToday && "bg-night font-bold text-white", off && !isToday && "text-mohr")}>{toFaDigits(d)}</span>
                  {holiday && <span className="truncate text-2xs text-mohr">{holiday}</span>}
                  {list.slice(0, 3).map((it) => (
                    <span key={it.kind + it.id} className={cn("flex items-center gap-1 truncate text-2xs leading-4", it.done && "text-ink-3 line-through")}>
                      <span className={cn("size-1.5 shrink-0 rounded-full", dot[it.tone])} /><span className="truncate">{it.title}</span>
                    </span>
                  ))}
                  {list.length > 3 && <span className="text-2xs text-ink-3">+{toFaDigits(list.length - 3)} مورد دیگر</span>}
                </Link>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 px-4 py-2.5 text-xs text-ink-2">
            {[["bg-mohr", "جلسه دادگاه / معوق"], ["bg-zafaran", "مهلت"], ["bg-firuze", "قرار ملاقات"], ["bg-lapis", "جلسه / وظیفه"], ["bg-sabz", "انجام‌شده"]].map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", c)} />{l}</span>)}
          </div>
        </div>
        <Panel title={formatJalali(fromJalali(jy, jm, sel), "long")} bodyClass="p-0">
          {holidayDays.get(sel) && <p className="border-b border-line bg-mohr-50 px-4 py-2 text-sm text-mohr">تعطیل رسمی: {holidayDays.get(sel)}</p>}
          {dayItems.length === 0 ? <EmptyState title="موردی برای این روز ثبت نشده است" /> : (
            <ul>
              {dayItems.map((it) => (
                <li key={it.kind + it.id} className="border-b border-line px-4 py-3 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={it.link} className={cn("font-medium hover:text-lapis", it.done && "text-ink-3 line-through")}>{it.title}</Link>
                    <Seal tone={it.tone as Tone}>{it.label}</Seal>
                  </div>
                  <p className="text-xs text-ink-3">{it.allDay ? "تمام روز" : `ساعت ${formatJalali(it.at, "time")}`}{it.detail && ` · ${it.detail}`}</p>
                  {it.kind === "event" && it.canCancel && <div className="mt-1"><ActionButton action={cancelEventAction} payload={{ id: it.id }} size="sm" variant="ghost" confirm={{ title: "لغو رویداد", body: "رویداد لغو و به شرکت‌کنندگان اطلاع داده می‌شود." }} successMessage="رویداد لغو شد.">لغو رویداد</ActionButton></div>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
