// داده زنده پوسته برنامه (نشان‌ها، اعلان‌های خوانده‌نشده، رکوردهای اخیر) و ثبت بازدید/سنجاق رکورد
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { listRecents, recordVisit, setRecentPinned, shellBadges } from "@/server/shell";

const PATH_MAX = 300;
const ID_MAX = 40;
const bodySchema = z.union([
  z.object({ path: z.string().max(PATH_MAX) }),
  z.object({ pin: z.string().max(ID_MAX), pinned: z.boolean() }),
]);

export const GET = apiHandler(null, async (_req, user) => {
  const [badges, recents] = await Promise.all([shellBadges(user), listRecents(user)]);
  return NextResponse.json({ badges, recents });
});

export const POST = apiHandler(null, async (req, user) => {
  const body = bodySchema.parse(await req.json().catch(() => ({})));
  if ("path" in body) return NextResponse.json({ recorded: await recordVisit(user, body.path) });
  await setRecentPinned(user, body.pin, body.pinned);
  return NextResponse.json({ ok: true });
});
