import { db, type Tx } from "./db";

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  important?: boolean;
}

export async function notify(input: NotifyInput | NotifyInput[], tx?: Tx): Promise<void> {
  const list = (Array.isArray(input) ? input : [input]).filter((n) => n.userId);
  if (!list.length) return;
  await (tx ?? db).notification.createMany({ data: list });
}
