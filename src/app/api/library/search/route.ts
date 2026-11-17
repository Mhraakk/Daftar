import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { citableSources, citationOf } from "@/server/legal-library";

export const runtime = "nodejs";

const MIN_QUERY = 2;
const MAX_QUERY = 200;
const TAKE = 12;

// جست‌وجوی منابع قابل استناد برای افزودن به منابع سند؛ مواد منسوخ هرگز برگردانده نمی‌شوند
export const GET = apiHandler("draft.create", async (req) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);
  if (q.length < MIN_QUERY) return NextResponse.json({ items: [] });
  const rows = await citableSources(q, TAKE);
  return NextResponse.json({
    items: rows.map((r) => ({ id: r.id, citation: citationOf(r), title: r.title, status: r.status, verified: r.verified, snippet: r.snippet, lawCode: r.lawCode, articleNo: r.articleNo })),
  });
});
