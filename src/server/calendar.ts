import type { EventType } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { formatJalali, fromJalali, jMonthLength, parseJalali } from "@/lib/jalali";
import { EVENT_TYPE } from "@/lib/labels";
import { notify } from "@/lib/notify";
import { assertCaseAccess, deadlineScope, eventScope, taskScope } from "./access";

export const eventSchema = z.object({
  title: z.string().trim().min(2, "عنوان رویداد الزامی است.").max(200),
  type: z.string().refine((v) => v in EVENT_TYPE, "نوع رویداد نامعتبر است."),
  date: z.string().trim().min(1, "تاریخ الزامی است."),
  startTime: z.string().trim().optional().transform((v) => v || null),
  endTime: z.string().trim().optional().transform((v) => v || null),
  location: z.string().trim().max(200).optional().transform((v) => v || null),
  description: z.string().trim().max(3000).optional().transform((v) => v || null),
  caseId: z.string().optional().transform((v) => v || null),
  attendeeIds: z.array(z.string()).default([]),
  forDepartment: z.boolean().default(false),
  remindMinutes: z.string().optional().transform((v) => (v ? Number(v) : null)),
});

export async function createEvent(input: z.infer<typeof eventSchema>, user: SessionUser) {
  let clientId: string | null = null;
  if (input.caseId) clientId = (await assertCaseAccess(user, input.caseId)).clientId;
  const allDay = !input.startTime;
  const startAt = parseJalali(input.date, input.startTime || "00:00");
  if (!startAt) throw new AppError("تاریخ یا ساعت شروع معتبر نیست.", "VALIDATION", 400, { date: "نامعتبر است." });
  const endAt = input.endTime ? parseJalali(input.date, input.endTime) : null;
  if (input.endTime && (!endAt || endAt <= startAt)) throw new AppError("ساعت پایان باید پس از ساعت شروع باشد.", "VALIDATION", 400, { endTime: "نامعتبر است." });
  const attendees = [...new Set(input.attendeeIds.filter((x) => x && x !== user.id))];
  const ev = await db.$transaction(async (tx) => {
    const e = await tx.calendarEvent.create({
      data: {
        title: input.title, type: input.type as EventType, startAt, endAt, allDay, location: input.location, description: input.description,
        caseId: input.caseId, clientId, ownerId: user.id, departmentId: input.forDepartment ? user.departmentId : null, remindMinutes: input.remindMinutes,
        attendees: { create: attendees.map((userId) => ({ userId })) },
      },
    });
    if (input.remindMinutes) {
      const fireAt = new Date(startAt.getTime() - input.remindMinutes * 60_000);
      if (fireAt.getTime() > Date.now()) await tx.reminder.createMany({ data: [user.id, ...attendees].map((userId) => ({ userId, eventId: e.id, kind: "EVENT", title: e.title, fireAt })) });
    }
    await audit({ actorId: user.id, action: "event.created", entityType: "CalendarEvent", entityId: e.id, entityLabel: e.title, caseId: e.caseId, clientId, meta: { startAt: startAt.toISOString(), type: e.type } }, tx);
    await notify(attendees.map((userId) => ({ userId, type: "event.invited", title: "به یک رویداد دعوت شدید", body: `${e.title} — ${formatJalali(startAt, allDay ? "date" : "datetime")}`, link: "/calendar", entityType: "CalendarEvent", entityId: e.id })), tx);
    return e;
  });
  return { id: ev.id };
}

export async function cancelEvent(id: string, user: SessionUser) {
  const e = await db.calendarEvent.findFirst({ where: { id, AND: [eventScope(user)] }, include: { attendees: true } });
  if (!e) throw new NotFoundError();
  if (e.ownerId !== user.id && !can(user, "calendar.view_all")) throw new ForbiddenError("فقط ثبت‌کننده رویداد می‌تواند آن را لغو کند.");
  if (e.cancelledAt) throw new AppError("این رویداد قبلاً لغو شده است.");
  await db.$transaction(async (tx) => {
    await tx.calendarEvent.update({ where: { id }, data: { cancelledAt: new Date() } });
    await tx.reminder.updateMany({ where: { eventId: id, firedAt: null }, data: { cancelledAt: new Date() } });
    await audit({ actorId: user.id, action: "event.cancelled", entityType: "CalendarEvent", entityId: id, entityLabel: e.title, caseId: e.caseId, clientId: e.clientId }, tx);
    await notify(e.attendees.filter((a) => a.userId !== user.id).map((a) => ({ userId: a.userId, type: "event.cancelled", title: "رویداد لغو شد", body: e.title, link: "/calendar" })), tx);
  });
}

export interface CalItem { id: string; kind: "event" | "deadline" | "task"; title: string; at: Date; allDay: boolean; tone: string; label: string; link: string; done: boolean; detail?: string | null; canCancel?: boolean }

/** خوراک یکپارچه تقویم یک ماه شمسی: رویدادها + مهلت‌ها + سررسید وظایف (با رعایت دامنه دسترسی) */
export async function monthFeed(user: SessionUser, jy: number, jm: number, scope: "mine" | "all"): Promise<CalItem[]> {
  const from = fromJalali(jy, jm, 1);
  const to = new Date(fromJalali(jy, jm, jMonthLength(jy, jm)).getTime() + 86_400_000);
  const mine = scope === "mine";
  const [events, deadlines, tasks] = await Promise.all([
    db.calendarEvent.findMany({ where: { startAt: { gte: from, lt: to }, cancelledAt: null, AND: [eventScope(user), mine ? { OR: [{ ownerId: user.id }, { attendees: { some: { userId: user.id } } }] } : {}] }, orderBy: { startAt: "asc" } }),
    db.deadline.findMany({ where: { dueAt: { gte: from, lt: to }, status: { not: "CANCELLED" }, AND: [deadlineScope(user), mine ? { assigneeId: user.id } : {}] }, orderBy: { dueAt: "asc" } }),
    db.task.findMany({ where: { dueAt: { gte: from, lt: to }, status: { notIn: ["CANCELLED"] }, AND: [taskScope(user), mine ? { assigneeId: user.id } : {}] }, orderBy: { dueAt: "asc" } }),
  ]);
  const now = Date.now();
  return [
    ...events.map((e): CalItem => ({ id: e.id, kind: "event", title: e.title, at: e.startAt, allDay: e.allDay, tone: EVENT_TYPE[e.type].tone, label: EVENT_TYPE[e.type].label, link: e.caseId ? `/cases/${e.caseId}` : "/calendar", done: false, detail: e.location, canCancel: e.ownerId === user.id || can(user, "calendar.view_all") })),
    ...deadlines.map((d): CalItem => ({ id: d.id, kind: "deadline", title: d.title, at: d.dueAt, allDay: false, tone: d.status === "DONE" ? "success" : d.dueAt.getTime() < now ? "danger" : "warning", label: d.isLegal ? "مهلت قانونی" : "مهلت", link: `/deadlines?focus=${d.id}`, done: d.status === "DONE" })),
    ...tasks.map((t): CalItem => ({ id: t.id, kind: "task", title: t.title, at: t.dueAt!, allDay: false, tone: t.status === "DONE" ? "success" : t.dueAt!.getTime() < now ? "danger" : "info", label: "وظیفه", link: `/tasks/${t.id}`, done: t.status === "DONE" })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
}
