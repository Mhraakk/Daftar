import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";

export interface AuditInput {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  caseId?: string | null;
  clientId?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** ثبت رویداد در تاریخچه فقط-افزودنی. درون تراکنش، tx را بدهید. */
export async function audit(input: AuditInput, tx?: Tx): Promise<void> {
  await (tx ?? db).activityLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel ?? null,
      caseId: input.caseId ?? null,
      clientId: input.clientId ?? null,
      meta: input.meta,
      ip: input.ip ?? null,
    },
  });
}

/** تفاوت فیلدها برای ثبت در meta */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>, keys: (keyof T)[]): Prisma.InputJsonObject {
  const changes: Record<string, Prisma.InputJsonObject> = {};
  for (const k of keys) {
    if (!(k in after)) continue;
    const a = before[k] instanceof Date ? (before[k] as Date).toISOString() : before[k];
    const b = after[k] instanceof Date ? (after[k] as Date).toISOString() : after[k];
    if ((a ?? null) !== (b ?? null)) changes[String(k)] = { from: (a ?? null) as Prisma.InputJsonValue, to: (b ?? null) as Prisma.InputJsonValue };
  }
  return changes;
}
