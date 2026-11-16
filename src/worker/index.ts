// سرویس پس‌زمینه «دفتر»: موتور یادآور و اعلان (مستقل از مرورگر، اینترنت و سرویس هوش مصنوعی)، هشدار و ارجاع موارد معوق،
// OCR اسناد اسکن‌شده و پشتیبان‌گیری شبانه. وضعیت همه کارها در پایگاه داده است؛ پس از هر راه‌اندازی مجدد، کارهای عقب‌افتاده جبران می‌شود.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 30_000);
const fmt = (d: Date) => new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short" }).format(d);

async function managers(): Promise<string[]> {
  const rows = await db.user.findMany({ where: { isActive: true, role: { permissions: { some: { permissionKey: "dashboard.manager" } } }, NOT: { role: { key: "auditor" } } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** اجرای یادآورهای سررسیده. هر یادآور در تراکنش «برداشته» می‌شود تا در اجرای هم‌زمان دوبار ارسال نشود. */
export async function fireReminders(now = new Date()): Promise<number> {
  const due = await db.reminder.findMany({ where: { fireAt: { lte: now }, firedAt: null, cancelledAt: null }, orderBy: { fireAt: "asc" }, take: 200, include: { deadline: { include: { case: { select: { number: true, title: true } } } }, event: true } });
  let fired = 0;
  for (const r of due) {
    await db.$transaction(async (tx) => {
      const claim = await tx.reminder.updateMany({ where: { id: r.id, firedAt: null, cancelledAt: null }, data: { firedAt: new Date() } });
      if (claim.count === 0) return;
      if (r.deadline) {
        if (r.deadline.status !== "OPEN") return;
        const d = r.deadline;
        await tx.notification.create({ data: {
          userId: r.userId, type: "deadline.reminder", title: `یادآوری مهلت: ${d.title}`, important: d.isLegal || d.priority === "URGENT",
          body: `سررسید: ${fmt(d.dueAt)}${d.case ? ` — پرونده ${d.case.title} (${d.case.number})` : ""}${d.isLegal && !d.verifiedAt ? " — مهلت قانونی هنوز تأیید نشده است" : ""}`,
          link: `/deadlines?focus=${d.id}`, entityType: "Deadline", entityId: d.id } });
      } else if (r.event) {
        if (r.event.cancelledAt) return;
        await tx.notification.create({ data: { userId: r.userId, type: "event.reminder", title: `یادآوری رویداد: ${r.event.title}`, body: `زمان: ${fmt(r.event.startAt)}${r.event.location ? ` — ${r.event.location}` : ""}`, link: "/calendar", entityType: "CalendarEvent", entityId: r.event.id } });
      }
      fired++;
    });
  }
  return fired;
}

/** مهلت‌های گذشته از موعد: هشدار به مسئول و مدیران (یک‌بار برای هر مهلت) */
export async function escalateDeadlines(now = new Date()): Promise<number> {
  const late = await db.deadline.findMany({ where: { status: "OPEN", dueAt: { lt: now }, escalatedAt: null }, take: 100, include: { case: { select: { number: true } } } });
  if (!late.length) return 0;
  const mgrs = await managers();
  for (const d of late) {
    await db.$transaction(async (tx) => {
      const claim = await tx.deadline.updateMany({ where: { id: d.id, escalatedAt: null }, data: { escalatedAt: new Date() } });
      if (claim.count === 0) return;
      const ids = new Set([d.assigneeId, ...mgrs]);
      await tx.notification.createMany({ data: [...ids].map((userId) => ({ userId, type: "deadline.overdue", title: `مهلت معوق: ${d.title}`, important: true, body: `سررسید ${fmt(d.dueAt)} گذشته است${d.case ? ` — پرونده ${d.case.number}` : ""}.`, link: `/deadlines?focus=${d.id}`, entityType: "Deadline", entityId: d.id })) });
      await tx.activityLog.create({ data: { action: "deadline.escalated", entityType: "Deadline", entityId: d.id, entityLabel: d.title, caseId: d.caseId, clientId: d.clientId, meta: { dueAt: d.dueAt.toISOString() } } });
    });
  }
  return late.length;
}

/** وظایف معوق و وظایف بدون مسئول: هشدار به مجری، ایجادکننده و مدیران */
export async function escalateTasks(now = new Date()): Promise<number> {
  const late = await db.task.findMany({ where: { status: { in: ["TODO", "IN_PROGRESS", "REJECTED"] }, dueAt: { lt: now }, escalatedAt: null }, take: 100 });
  if (!late.length) return 0;
  const mgrs = await managers();
  for (const t of late) {
    await db.$transaction(async (tx) => {
      const claim = await tx.task.updateMany({ where: { id: t.id, escalatedAt: null }, data: { escalatedAt: new Date() } });
      if (claim.count === 0) return;
      const ids = new Set([t.assigneeId, t.createdById, ...mgrs].filter((x): x is string => !!x));
      await tx.notification.createMany({ data: [...ids].map((userId) => ({ userId, type: "task.overdue", title: `وظیفه معوق: ${t.title}`, important: true, body: `مهلت ${fmt(t.dueAt!)} گذشته است${t.assigneeId ? "" : " و وظیفه مجری ندارد"}.`, link: `/tasks/${t.id}`, entityType: "Task", entityId: t.id })) });
      await tx.activityLog.create({ data: { action: "task.escalated", entityType: "Task", entityId: t.id, entityLabel: `${t.title} (${t.code})`, caseId: t.caseId, clientId: t.clientId } });
    });
  }
  return late.length;
}

/** OCR اسناد در صف (در صورت نصب بودن tesseract با زبان فارسی) */
async function processOcr() {
  const { ocrAvailable, runOcr } = await import("../server/text-extract");
  if (!(await ocrAvailable())) return;
  const { storage } = await import("../lib/storage");
  const { reindexDocument } = await import("../server/documents");
  const pending = await db.documentVersion.findMany({ where: { textStatus: "OCR_PENDING" }, take: 3, orderBy: { createdAt: "asc" } });
  for (const v of pending) {
    try {
      const text = await runOcr(await storage.get(v.storageKey), v.fileName.slice(v.fileName.lastIndexOf(".")).toLowerCase());
      await db.documentVersion.update({ where: { id: v.id }, data: { extractedText: text || null, textStatus: text ? "OCR_DONE" : "NONE" } });
      await reindexDocument(v.documentId);
    } catch (e) {
      console.error("[worker] OCR failed", v.id, e);
      await db.documentVersion.update({ where: { id: v.id }, data: { textStatus: "FAILED" } });
    }
  }
}

/** پشتیبان خودکار روزانه؛ اگر سرور در ساعت مقرر خاموش بوده، پس از روشن‌شدن جبران می‌شود. */
async function nightlyBackup(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Tehran" }).format(now)) % 24;
  const last = await db.backupRecord.findFirst({ where: { kind: "SCHEDULED" }, orderBy: { createdAt: "desc" } });
  const age = last ? now.getTime() - last.createdAt.getTime() : Infinity;
  const dueByClock = hour === Number(process.env.BACKUP_CRON_HOUR ?? 2) && age > 20 * 3600_000;
  if (!dueByClock && age < 26 * 3600_000) return;
  const { createBackup, verifyBackup } = await import("../server/backup");
  const b = await createBackup("SCHEDULED", null);
  const v = await verifyBackup(b.id, null);
  if (!v.ok) {
    const mgrs = await db.user.findMany({ where: { isActive: true, role: { permissions: { some: { permissionKey: "backup.manage" } } } }, select: { id: true } });
    await db.notification.createMany({ data: mgrs.map((m) => ({ userId: m.id, type: "backup.failed", title: "آزمون بازیابی پشتیبان شبانه ناموفق بود", important: true, link: "/admin/backup" })) });
  }
  console.log(`[worker] nightly backup ${b.fileName} verified=${v.ok}`);
}

async function housekeeping() {
  await db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } }, { revokedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } }] } });
}

export async function tick() {
  const r = await fireReminders();
  const d = await escalateDeadlines();
  const t = await escalateTasks();
  if (r || d || t) console.log(`[worker] reminders=${r} overdueDeadlines=${d} overdueTasks=${t}`);
}

async function main() {
  console.log(`[worker] started; tick=${TICK_MS}ms tz=Asia/Tehran`);
  let n = 0, stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
  while (!stopping) {
    try {
      await tick();
      if (n % 2 === 0) await processOcr();
      if (n % 10 === 0) await nightlyBackup().catch((e) => console.error("[worker] backup failed", e));
      if (n % 120 === 0) await housekeeping();
    } catch (e) {
      // قطع موقت پایگاه داده نباید سرویس را متوقف کند
      console.error("[worker] tick failed; retrying", e instanceof Error ? e.message : e);
    }
    n++;
    await new Promise((res) => setTimeout(res, TICK_MS));
  }
  await db.$disconnect();
  console.log("[worker] stopped");
}

if (process.argv[1]?.includes("worker")) main();
