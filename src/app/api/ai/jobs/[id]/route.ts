import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { jobSnapshot } from "@/server/ai/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// وضعیت زنده کار هوش مصنوعی (فقط مالک کار یا مدیر هوش مصنوعی)
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(null, async (_req, user, ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json(await jobSnapshot(id, user), { headers: { "Cache-Control": "private, no-store" } });
});
