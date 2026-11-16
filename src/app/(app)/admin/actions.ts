"use server";
import { z } from "zod";
import { runAction } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parseJalaliDateOnly } from "@/lib/jalali";
import { createRole, createUser, resetUserPassword, saveDepartment, setRolePermissions, setSetting, setUserActive, updateUser, userSchema } from "@/server/admin";

export async function createUserAction(raw: unknown) { return runAction(userSchema, "user.manage", raw, (i, u) => createUser(i, u)); }
export async function updateUserAction(raw: unknown) { return runAction(userSchema.and(z.object({ id: z.string() })), "user.manage", raw, (i, u) => updateUser(i.id, i, u)); }
export async function userActiveAction(raw: unknown) { return runAction(z.object({ id: z.string(), active: z.boolean() }), "user.manage", raw, (i, u) => setUserActive(i.id, i.active, u)); }
export async function resetPasswordAction(raw: unknown) { return runAction(z.object({ id: z.string(), password: z.string().min(8, "دست‌کم ۸ نویسه.") }), "user.manage", raw, (i, u) => resetUserPassword(i.id, i.password, u)); }
export async function rolePermissionsAction(raw: unknown) { return runAction(z.object({ roleId: z.string(), keys: z.array(z.string()) }), "role.manage", raw, (i, u) => setRolePermissions(i.roleId, i.keys, u)); }
export async function createRoleAction(raw: unknown) {
  return runAction(z.object({ name: z.string().trim().min(2, "نام نقش الزامی است.").max(60), description: z.string().trim().max(200).optional(), copyFromId: z.string().optional() }), "role.manage", raw, (i, u) => createRole({ name: i.name, description: i.description || null, copyFromId: i.copyFromId || null }, u));
}
export async function saveDepartmentAction(raw: unknown) {
  return runAction(z.object({ id: z.string().optional(), name: z.string().trim().min(2, "نام واحد الزامی است.").max(80), managerId: z.string().optional() }), "department.manage", raw, (i, u) => saveDepartment({ id: i.id || null, name: i.name, managerId: i.managerId || null }, u));
}
export async function saveOfficeAction(raw: unknown) {
  return runAction(z.object({ officeName: z.string().trim().min(2, "نام دفتر الزامی است.").max(120), officeCode: z.string().trim().max(40).default(""), city: z.string().trim().max(60).default(""), phone: z.string().trim().max(40).default(""), address: z.string().trim().max(300).default(""), letterheadNote: z.string().trim().max(200).default("") }), "settings.manage", raw, (i, u) => setSetting("office", i, u));
}
export async function addHolidayAction(raw: unknown) {
  return runAction(z.object({ date: z.string().min(1, "تاریخ الزامی است."), title: z.string().trim().min(2, "عنوان الزامی است.").max(100) }), "settings.manage", raw, async (i, u) => {
    const date = parseJalaliDateOnly(i.date);
    if (!date) throw new AppError("تاریخ معتبر نیست.", "VALIDATION", 400, { date: "نامعتبر است." });
    await db.holiday.upsert({ where: { date }, create: { date, title: i.title }, update: { title: i.title } });
    await audit({ actorId: u.id, action: "settings.updated", entityType: "Holiday", entityLabel: `تعطیلی ${i.title}` });
  });
}
export async function removeHolidayAction(raw: unknown) {
  return runAction(z.object({ date: z.string() }), "settings.manage", raw, async (i, u) => {
    await db.holiday.delete({ where: { date: new Date(i.date) } });
    await audit({ actorId: u.id, action: "settings.updated", entityType: "Holiday", entityLabel: "حذف تعطیلی" });
  });
}
export async function verifyRuleAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), verified: z.boolean() }), "deadline.verify_legal", raw, async (i, u) => {
    const r = await db.deadlineRule.update({ where: { id: i.id }, data: { verified: i.verified, verifiedById: i.verified ? u.id : null, verifiedAt: i.verified ? new Date() : null } });
    await audit({ actorId: u.id, action: "settings.updated", entityType: "DeadlineRule", entityId: r.id, entityLabel: `${i.verified ? "تأیید" : "لغو تأیید"} قاعده: ${r.title}` });
  });
}
export async function saveRuleAction(raw: unknown) {
  return runAction(z.object({ id: z.string().optional(), title: z.string().trim().min(3, "عنوان الزامی است."), days: z.coerce.number().int().min(1, "مدت نامعتبر است.").max(3650), monthsAbroad: z.string().optional(), basis: z.string().trim().min(3, "مستند قانونی الزامی است."), description: z.string().trim().optional() }), "settings.manage", raw, async (i, u) => {
    const months = i.monthsAbroad ? Number(i.monthsAbroad) : null;
    // هر تغییر در قاعده، تأیید قبلی را باطل می‌کند
    const data = { title: i.title, days: i.days, monthsAbroad: months, basis: i.basis, description: i.description || null, verified: false, verifiedById: null, verifiedAt: null };
    const r = i.id ? await db.deadlineRule.update({ where: { id: i.id }, data }) : await db.deadlineRule.create({ data: { ...data, key: `CUSTOM_${Date.now().toString(36).toUpperCase()}` } });
    await audit({ actorId: u.id, action: "settings.updated", entityType: "DeadlineRule", entityId: r.id, entityLabel: `قاعده مهلت: ${r.title}` });
  });
}
export async function saveAutomationAction(raw: unknown) {
  return runAction(z.object({
    id: z.string().optional(), name: z.string().trim().min(2, "نام قاعده الزامی است.").max(100), trigger: z.enum(["CASE_CREATED", "CORRESPONDENCE_REGISTERED"]),
    category: z.string().optional(), priority: z.string().optional(), direction: z.string().optional(), actionType: z.enum(["ASSIGN_CASE", "CREATE_TASK"]),
    userId: z.string().optional(), leastLoaded: z.boolean().default(false), taskTitle: z.string().trim().optional(), dueInDays: z.string().optional(),
  }), "automation.manage", raw, async (i, u) => {
    if (!i.userId && !i.leastLoaded) throw new AppError("کارمند مقصد را انتخاب کنید یا «کم‌بارترین کارمند» را فعال کنید.", "VALIDATION", 400, { userId: "الزامی است." });
    if (i.actionType === "ASSIGN_CASE" && i.trigger !== "CASE_CREATED") throw new AppError("ارجاع خودکار پرونده فقط با رویداد «ایجاد پرونده» ممکن است.", "VALIDATION", 400, { actionType: "ناسازگار است." });
    const data = {
      name: i.name, trigger: i.trigger, conditions: { category: i.category || undefined, priority: i.priority || undefined, direction: i.direction || undefined },
      action: { type: i.actionType, userId: i.userId || undefined, leastLoaded: i.leastLoaded, taskTitle: i.taskTitle || undefined, dueInDays: i.dueInDays ? Number(i.dueInDays) : undefined },
    };
    const r = i.id ? await db.automationRule.update({ where: { id: i.id }, data }) : await db.automationRule.create({ data: { ...data, createdById: u.id } });
    await audit({ actorId: u.id, action: "automation.updated", entityType: "AutomationRule", entityId: r.id, entityLabel: r.name });
  });
}
export async function toggleAutomationAction(raw: unknown) {
  return runAction(z.object({ id: z.string(), enabled: z.boolean().optional(), remove: z.boolean().optional() }), "automation.manage", raw, async (i, u) => {
    const r = i.remove ? await db.automationRule.delete({ where: { id: i.id } }) : await db.automationRule.update({ where: { id: i.id }, data: { enabled: i.enabled } });
    await audit({ actorId: u.id, action: "automation.updated", entityType: "AutomationRule", entityId: r.id, entityLabel: `${i.remove ? "حذف" : i.enabled ? "فعال‌سازی" : "توقف"}: ${r.name}` });
  });
}
