// سرویس پس‌زمینه «دفتر»: موتور یادآور و اعلان (مستقل از مرورگر، اینترنت و سرویس هوش مصنوعی)، هشدار و ارجاع موارد معوق،
// OCR اسناد اسکن‌شده، پشتیبان‌گیری شبانه و اجرای صف هوش مصنوعی. وضعیت همه کارها در پایگاه داده است؛ پس از هر
// راه‌اندازی مجدد، کارهای عقب‌افتاده جبران می‌شود.
import { createServer, type Server } from "node:http";
import { db } from "../lib/db";

const DEFAULT_TICK_MS = 30_000;
const DEFAULT_AI_POLL_MS = 1_500;
const DEFAULT_HEALTH_PORT = 3_001;
const TICK_MS = Number(process.env.WORKER_TICK_MS ?? DEFAULT_TICK_MS);
const AI_POLL_MS = Number(process.env.WORKER_AI_POLL_MS ?? DEFAULT_AI_POLL_MS);
const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? DEFAULT_HEALTH_PORT);
const REMINDER_BATCH = 200;
const ESCALATION_BATCH = 100;
const OCR_BATCH = 3;
const OCR_EVERY_TICKS = 2;
const BACKUP_CHECK_EVERY_TICKS = 10;
const HOUSEKEEPING_EVERY_TICKS = 120;
const DEFAULT_BACKUP_HOUR = 2;
const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const BACKUP_MIN_GAP_HOURS = 20;
const BACKUP_MAX_GAP_HOURS = 26;
const SESSION_RETENTION_DAYS = 7;
const HEALTHY_TICK_FACTOR = 3;
const HTTP_OK = 200;
const HTTP_UNAVAILABLE = 503;
const HTTP_NOT_FOUND = 404;
const MS_PER_SEC = 1_000;

const fmt = (d: Date) => new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short" }).format(d);

/** پردازش ترتیبی فهرست (هر مورد پس از پایان مورد قبلی) و شمارش موارد موفق */
async function countSequential<T>(items: T[], fn: (item: T) => Promise<boolean>): Promise<number> {
  return items.reduce<Promise<number>>(async (prev, item) => {
    const acc = await prev;
    return (await fn(item)) ? acc + 1 : acc;
  }, Promise.resolve(0));
}

async function managers(): Promise<string[]> {
  const rows = await db.user.findMany({ where: { isActive: true, role: { permissions: { some: { permissionKey: "dashboard.manager" } } }, NOT: { role: { key: "auditor" } } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** اجرای یادآورهای سررسیده. هر یادآور در تراکنش «برداشته» می‌شود تا در اجرای هم‌زمان دوبار ارسال نشود. */
export async function fireReminders(now = new Date()): Promise<number> {
  const due = await db.reminder.findMany({ where: { fireAt: { lte: now }, firedAt: null, cancelledAt: null }, orderBy: { fireAt: "asc" }, take: REMINDER_BATCH, include: { deadline: { include: { case: { select: { number: true, title: true } } } }, event: true } });
  return countSequential(due, (r) => db.$transaction(async (tx) => {
    const claim = await tx.reminder.updateMany({ where: { id: r.id, firedAt: null, cancelledAt: null }, data: { firedAt: new Date() } });
    if (claim.count === 0) return false;
    if (r.deadline) {
      if (r.deadline.status !== "OPEN") return false;
      const d = r.deadline;
      await tx.notification.create({ data: {
        userId: r.userId, type: "deadline.reminder", title: `یادآوری مهلت: ${d.title}`, important: d.isLegal || d.priority === "URGENT",
        body: `سررسید: ${fmt(d.dueAt)}${d.case ? ` — پرونده ${d.case.title} (${d.case.number})` : ""}${d.isLegal && !d.verifiedAt ? " — مهلت قانونی هنوز تأیید نشده است" : ""}`,
        link: `/deadlines?focus=${d.id}`, entityType: "Deadline", entityId: d.id } });
      return true;
    }
    if (r.event) {
      if (r.event.cancelledAt) return false;
      await tx.notification.create({ data: { userId: r.userId, type: "event.reminder", title: `یادآوری رویداد: ${r.event.title}`, body: `زمان: ${fmt(r.event.startAt)}${r.event.location ? ` — ${r.event.location}` : ""}`, link: "/calendar", entityType: "CalendarEvent", entityId: r.event.id } });
      return true;
    }
    return false;
  }));
}

/** مهلت‌های گذشته از موعد: هشدار به مسئول و مدیران (یک‌بار برای هر مهلت) */
export async function escalateDeadlines(now = new Date()): Promise<number> {
  const late = await db.deadline.findMany({ where: { status: "OPEN", dueAt: { lt: now }, escalatedAt: null }, take: ESCALATION_BATCH, include: { case: { select: { number: true } } } });
  if (!late.length) return 0;
  const mgrs = await managers();
  await countSequential(late, (d) => db.$transaction(async (tx) => {
    const claim = await tx.deadline.updateMany({ where: { id: d.id, escalatedAt: null }, data: { escalatedAt: new Date() } });
    if (claim.count === 0) return false;
    const ids = new Set([d.assigneeId, ...mgrs]);
    await tx.notification.createMany({ data: [...ids].map((userId) => ({ userId, type: "deadline.overdue", title: `مهلت معوق: ${d.title}`, important: true, body: `سررسید ${fmt(d.dueAt)} گذشته است${d.case ? ` — پرونده ${d.case.number}` : ""}.`, link: `/deadlines?focus=${d.id}`, entityType: "Deadline", entityId: d.id })) });
    await tx.activityLog.create({ data: { action: "deadline.escalated", entityType: "Deadline", entityId: d.id, entityLabel: d.title, caseId: d.caseId, clientId: d.clientId, meta: { dueAt: d.dueAt.toISOString() } } });
    return true;
  }));
  return late.length;
}

/** وظایف معوق و وظایف بدون مسئول: هشدار به مجری، ایجادکننده و مدیران */
export async function escalateTasks(now = new Date()): Promise<number> {
  const late = await db.task.findMany({ where: { status: { in: ["TODO", "IN_PROGRESS", "REJECTED"] }, dueAt: { lt: now }, escalatedAt: null }, take: ESCALATION_BATCH });
  if (!late.length) return 0;
  const mgrs = await managers();
  await countSequential(late, (t) => db.$transaction(async (tx) => {
    const claim = await tx.task.updateMany({ where: { id: t.id, escalatedAt: null }, data: { escalatedAt: new Date() } });
    if (claim.count === 0) return false;
    const ids = new Set([t.assigneeId, t.createdById, ...mgrs].filter((x): x is string => !!x));
    await tx.notification.createMany({ data: [...ids].map((userId) => ({ userId, type: "task.overdue", title: `وظیفه معوق: ${t.title}`, important: true, body: `مهلت ${fmt(t.dueAt!)} گذشته است${t.assigneeId ? "" : " و وظیفه مجری ندارد"}.`, link: `/tasks/${t.id}`, entityType: "Task", entityId: t.id })) });
    await tx.activityLog.create({ data: { action: "task.escalated", entityType: "Task", entityId: t.id, entityLabel: `${t.title} (${t.code})`, caseId: t.caseId, clientId: t.clientId } });
    return true;
  }));
  return late.length;
}

/** OCR اسناد در صف (در صورت نصب بودن tesseract با زبان فارسی) */
async function processOcr() {
  const { ocrAvailable, runOcr } = await import("../server/text-extract");
  if (!(await ocrAvailable())) return;
  const { storage } = await import("../lib/storage");
  const { reindexDocument } = await import("../server/documents");
  const pending = await db.documentVersion.findMany({ where: { textStatus: "OCR_PENDING" }, take: OCR_BATCH, orderBy: { createdAt: "asc" } });
  await countSequential(pending, async (v) => {
    try {
      const text = await runOcr(await storage.get(v.storageKey), v.fileName.slice(v.fileName.lastIndexOf(".")).toLowerCase());
      await db.documentVersion.update({ where: { id: v.id }, data: { extractedText: text || null, textStatus: text ? "OCR_DONE" : "NONE" } });
      await reindexDocument(v.documentId);
      return true;
    } catch (e) {
      console.error("[worker] OCR failed", v.id, e);
      await db.documentVersion.update({ where: { id: v.id }, data: { textStatus: "FAILED" } });
      return false;
    }
  });
}

/** پشتیبان خودکار روزانه؛ اگر سرور در ساعت مقرر خاموش بوده، پس از روشن‌شدن جبران می‌شود. */
async function nightlyBackup(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Tehran" }).format(now)) % HOURS_PER_DAY;
  const last = await db.backupRecord.findFirst({ where: { kind: "SCHEDULED" }, orderBy: { createdAt: "desc" } });
  const age = last ? now.getTime() - last.createdAt.getTime() : Infinity;
  const dueByClock = hour === Number(process.env.BACKUP_CRON_HOUR ?? DEFAULT_BACKUP_HOUR) && age > BACKUP_MIN_GAP_HOURS * MS_PER_HOUR;
  if (!dueByClock && age < BACKUP_MAX_GAP_HOURS * MS_PER_HOUR) return;
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
  const cutoff = new Date(Date.now() - SESSION_RETENTION_DAYS * MS_PER_DAY);
  await db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] } });
}

export async function tick() {
  const r = await fireReminders();
  const d = await escalateDeadlines();
  const t = await escalateTasks();
  if (r || d || t) console.log(`[worker] reminders=${r} overdueDeadlines=${d} overdueTasks=${t}`);
}

interface Health { startedAt: number; lastTickAt: number; ticks: number; aiRunning: () => number }

/** نقطه سلامت برای docker-compose و آزمون‌ها: GET /health */
function startHealthServer(h: Health): Server {
  const server = createServer((req, res) => {
    if (req.url !== "/health") {
      res.writeHead(HTTP_NOT_FOUND).end();
      return;
    }
    const healthy = Date.now() - h.lastTickAt < HEALTHY_TICK_FACTOR * Math.max(TICK_MS, AI_POLL_MS);
    res.writeHead(healthy ? HTTP_OK : HTTP_UNAVAILABLE, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: healthy, uptimeSec: Math.round((Date.now() - h.startedAt) / MS_PER_SEC), lastTickAt: new Date(h.lastTickAt).toISOString(), ticks: h.ticks, aiRunning: h.aiRunning() }));
  });
  server.on("error", (e) => console.error("[worker] health server error:", e.message));
  server.listen(HEALTH_PORT, "0.0.0.0");
  return server;
}

async function main() {
  console.log(`[worker] started; tick=${TICK_MS}ms aiPoll=${AI_POLL_MS}ms health=:${HEALTH_PORT} tz=Asia/Tehran`);
  const { startAiRunner } = await import("./ai-runner");
  const ai = startAiRunner(AI_POLL_MS);
  const health: Health = { startedAt: Date.now(), lastTickAt: Date.now(), ticks: 0, aiRunning: () => ai.runningCount() };
  const server = startHealthServer(health);
  let stopping = false;
  let timer: NodeJS.Timeout | null = null;

  const cycle = async (): Promise<void> => {
    const n = health.ticks;
    try {
      await tick();
      if (n % OCR_EVERY_TICKS === 0) await processOcr();
      if (n % BACKUP_CHECK_EVERY_TICKS === 0) await nightlyBackup().catch((e) => console.error("[worker] backup failed", e));
      if (n % HOUSEKEEPING_EVERY_TICKS === 0) await housekeeping();
    } catch (e) {
      // قطع موقت پایگاه داده نباید سرویس را متوقف کند
      console.error("[worker] tick failed; retrying", e instanceof Error ? e.message : e);
    }
    health.ticks = n + 1;
    health.lastTickAt = Date.now();
    if (!stopping) timer = setTimeout(() => void cycle(), TICK_MS);
  };

  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    if (timer) clearTimeout(timer);
    await ai.stop();
    server.close();
    await db.$disconnect();
    console.log("[worker] stopped");
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
  await cycle();
}

if (process.argv[1]?.includes("worker")) void main();
