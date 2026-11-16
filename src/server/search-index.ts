// نمایه جست‌وجوی یکپارچه داخلی (PostgreSQL FTS + trigram روی متن نرمال‌شده فارسی)
import { db, type Tx } from "@/lib/db";
import { normalizeFa } from "@/lib/text";

export interface IndexInput {
  entityType: "client" | "case" | "document" | "correspondence" | "task" | "draft" | "template" | "note" | "legal_source" | "deadline";
  entityId: string;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  caseId?: string | null;
  clientId?: string | null;
  ownerId?: string | null;
  restricted?: boolean;
  link: string;
}

export async function indexEntity(i: IndexInput, tx?: Tx): Promise<void> {
  const body = (i.body ?? "").slice(0, 200_000);
  const norm = normalizeFa(`${i.title} ${i.subtitle ?? ""} ${body}`).slice(0, 250_000);
  const data = {
    title: i.title, subtitle: i.subtitle ?? null, body: body.slice(0, 4000), norm,
    caseId: i.caseId ?? null, clientId: i.clientId ?? null, ownerId: i.ownerId ?? null, restricted: i.restricted ?? false, link: i.link,
  };
  await (tx ?? db).searchEntry.upsert({
    where: { entityType_entityId: { entityType: i.entityType, entityId: i.entityId } },
    create: { entityType: i.entityType, entityId: i.entityId, ...data },
    update: data,
  });
}

export async function unindexEntity(entityType: string, entityId: string, tx?: Tx): Promise<void> {
  await (tx ?? db).searchEntry.deleteMany({ where: { entityType, entityId } });
}
