"use server";
// ذخیره چیدمان پیشخوان کاربر جاری
import { z } from "zod";
import { runAction } from "@/lib/action";
import { dashboardLayoutSchema, saveDashboardLayout } from "@/server/dashboard-layout";

export async function saveDashboardAction(raw: unknown) {
  return runAction(z.object({ layout: dashboardLayoutSchema.nullable() }), null, raw, (input, user) => saveDashboardLayout(user, input.layout));
}
