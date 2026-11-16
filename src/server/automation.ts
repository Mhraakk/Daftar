// قواعد اتوماسیون قابل تنظیم (ارجاع خودکار و ایجاد وظیفه). اجرا همیشه غیرمسدودکننده است:
// خطای یک قاعده نباید عملیات اصلی (مثلاً ثبت پرونده) را متوقف کند.
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { nextNumber } from "@/lib/numbering";

export type AutomationTrigger = "CASE_CREATED" | "CORRESPONDENCE_REGISTERED";
export interface AutomationContext { caseId?: string; correspondenceId?: string; category?: string; priority?: string; direction?: string; actorId: string }
interface Conditions { category?: string; priority?: string; direction?: string }
interface RuleAction { type: "ASSIGN_CASE" | "CREATE_TASK"; userId?: string; leastLoaded?: boolean; departmentId?: string; taskTitle?: string; dueInDays?: number }

async function leastLoadedUser(departmentId?: string): Promise<string | null> {
  const users = await db.user.findMany({
    where: { isActive: true, ...(departmentId ? { departmentId } : {}), role: { permissions: { some: { permissionKey: "case.edit" } } }, NOT: { role: { key: { in: ["admin", "auditor"] } } } },
    select: { id: true },
  });
  if (!users.length) return null;
  const loads = await db.task.groupBy({ by: ["assigneeId"], where: { assigneeId: { in: users.map((u) => u.id) }, status: { in: ["TODO", "IN_PROGRESS", "WAITING_REVIEW"] } }, _count: true });
  const map = new Map(loads.map((l) => [l.assigneeId, l._count]));
  return users.sort((a, b) => (map.get(a.id) ?? 0) - (map.get(b.id) ?? 0))[0].id;
}

export async function runAutomation(trigger: AutomationTrigger, ctx: AutomationContext): Promise<void> {
  try {
    const rules = await db.automationRule.findMany({ where: { trigger, enabled: true }, orderBy: { createdAt: "asc" } });
    for (const rule of rules) {
      const cond = (rule.conditions ?? {}) as Conditions;
      if (cond.category && cond.category !== ctx.category) continue;
      if (cond.priority && cond.priority !== ctx.priority) continue;
      if (cond.direction && cond.direction !== ctx.direction) continue;
      const act = rule.action as unknown as RuleAction;
      const userId = act.userId || (act.leastLoaded ? await leastLoadedUser(act.departmentId) : null);
      if (!userId) continue;
      const target = await db.user.findFirst({ where: { id: userId, isActive: true } });
      if (!target) continue;

      if (act.type === "ASSIGN_CASE" && ctx.caseId) {
        const c = await db.case.findUnique({ where: { id: ctx.caseId } });
        if (!c || c.responsibleId) continue;
        await db.$transaction(async (tx) => {
          await tx.case.update({ where: { id: c.id }, data: { responsibleId: userId, status: c.status === "INTAKE" ? "OPEN" : c.status, version: { increment: 1 } } });
          await tx.assignment.create({ data: { entityType: "Case", entityId: c.id, toUserId: userId, byUserId: ctx.actorId, note: `قاعده اتوماسیون: ${rule.name}` } });
          await audit({ actorId: null, action: "case.assigned", entityType: "Case", entityId: c.id, entityLabel: `${c.title} (${c.number})`, caseId: c.id, clientId: c.clientId, meta: { automationRule: rule.name, to: userId, toName: target.fullName } }, tx);
          await notify({ userId, type: "case.assigned", title: "پرونده به‌صورت خودکار به شما ارجاع شد", body: `${c.title} (${c.number}) — قاعده «${rule.name}»`, link: `/cases/${c.id}`, entityType: "Case", entityId: c.id }, tx);
        });
      } else if (act.type === "CREATE_TASK") {
        await db.$transaction(async (tx) => {
          const code = await nextNumber("TASK", tx);
          const t = await tx.task.create({
            data: {
              code, title: act.taskTitle || "بررسی اولیه", assigneeId: userId, createdById: ctx.actorId, caseId: ctx.caseId ?? null,
              correspondenceId: ctx.correspondenceId ?? null, dueAt: act.dueInDays ? new Date(Date.now() + act.dueInDays * 86_400_000) : null,
              description: `ایجادشده توسط قاعده اتوماسیون «${rule.name}»`,
            },
          });
          await audit({ actorId: null, action: "task.created", entityType: "Task", entityId: t.id, entityLabel: `${t.title} (${t.code})`, caseId: ctx.caseId ?? null, meta: { automationRule: rule.name } }, tx);
          await notify({ userId, type: "task.assigned", title: "وظیفه جدید (خودکار)", body: t.title, link: `/tasks/${t.id}`, entityType: "Task", entityId: t.id }, tx);
        });
      }
      await db.automationRule.update({ where: { id: rule.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } });
    }
  } catch (e) {
    console.error("[automation] rule execution failed", e);
  }
}
