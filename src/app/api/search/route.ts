import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { searchInternal } from "@/server/search";

export const GET = apiHandler(null, async (req, user) => {
  const u = new URL(req.url);
  const q = u.searchParams.get("q") ?? "";
  const results = await searchInternal(user, q, { limit: Number(u.searchParams.get("limit") ?? 8) });
  return NextResponse.json({ results });
});
