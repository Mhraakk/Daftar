import { db } from "@/lib/db";
import type { TimelineItem } from "@/components/ui/timeline";

/** تاریخچه فعالیت یک پرونده یا مراجعه‌کننده برای نمایش در خط زمان */
export async function activityFor(where: { caseId?: string; clientId?: string; entityType?: string; entityId?: string }, take = 60): Promise<TimelineItem[]> {
  const rows = await db.activityLog.findMany({ where, orderBy: { createdAt: "desc" }, take, include: { actor: { select: { fullName: true } } } });
  return rows.map((r) => {
    const m = (r.meta ?? {}) as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof m.toName === "string") parts.push(`به ${m.toName}`);
    if (typeof m.name === "string") parts.push(String(m.name));
    if (typeof m.note === "string" && m.note) parts.push(m.note);
    if (typeof m.reason === "string" && m.reason) parts.push(m.reason);
    if (typeof m.comment === "string" && m.comment) parts.push(m.comment);
    if (typeof m.result === "string" && m.result) parts.push(m.result);
    if (typeof m.fileName === "string") parts.push(m.fileName);
    return { id: r.id, action: r.action, actorName: r.actor?.fullName ?? null, entityLabel: r.entityLabel, createdAt: r.createdAt, detail: parts.join(" · ") || null };
  });
}
