import { apiHandler, contentDisposition } from "@/lib/api";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { formatDateOnly, formatJalali } from "@/lib/jalali";
import { ACTION_LABELS, CASE_STATUS, DEADLINE_STATUS, DEADLINE_TYPE, PRIORITY, TASK_STATUS } from "@/lib/labels";
import { faNum, formatBytes } from "@/lib/text";
import { caseScope, documentScope, userNames } from "@/server/access";
import { activityFor } from "@/server/activity";
import { getOffice } from "@/server/admin";
import { listCases } from "@/server/cases";
import { listClients } from "@/server/clients";
import { buildWorkbook, type SheetDef } from "@/server/excel";
import { esc, htmlToPdf } from "@/server/pdf";
import { reportExport } from "@/server/report-export";
import { listTasks } from "@/server/tasks";

export const runtime = "nodejs";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const stamp = () => formatJalali(new Date(), "input").replace(/\//g, "-");

function file(data: Buffer, name: string, type: string) {
  return new Response(new Uint8Array(data), { headers: { "Content-Type": type, "Content-Disposition": contentDisposition(name), "Cache-Control": "private, no-store" } });
}
async function xlsx(user: SessionUser, title: string, sheets: SheetDef[], name: string) {
  const office = await getOffice();
  const buf = await buildWorkbook(sheets, { title: `${office.officeName} — ${title}`, subtitle: `تاریخ تهیه: ${formatJalali(new Date(), "datetime")} · تهیه‌کننده: ${user.fullName}` });
  await audit({ actorId: user.id, action: "report.exported", entityType: "Export", entityLabel: `${title} (Excel)`, meta: { rows: sheets.reduce((a, s) => a + s.rows.length, 0) } });
  return file(buf, `${name}-${stamp()}.xlsx`, XLSX);
}

export const GET = apiHandler<{ params: Promise<{ slug: string[] }> }>("report.export", async (req, user, ctx) => {
  const { slug } = await ctx.params;
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const kind = slug[0];

  if (kind === "clients") {
    if (!can(user, "client.view")) throw new ForbiddenError();
    const { rows } = await listClients(user, { ...sp, page: 1, pageSize: 5000 });
    return xlsx(user, "فهرست مراجعان", [{ name: "مراجعان", columns: [{ header: "کد", key: "code", width: 16 }, { header: "نام", key: "name", width: 28 }, { header: "نوع", key: "type", width: 10 }, { header: "کد/شناسه ملی", key: "nid", width: 16 }, { header: "تلفن همراه", key: "mobile", width: 15 }, { header: "نشانی", key: "address", width: 40 }, { header: "تعداد پرونده", key: "cases", width: 12 }, { header: "تاریخ ثبت", key: "created", width: 14 }],
      rows: rows.map((c) => ({ code: c.code, name: c.displayName, type: c.type === "PERSON" ? "حقیقی" : "حقوقی", nid: c.nationalId, mobile: c.mobile, address: c.address, cases: c._count.cases, created: formatJalali(c.createdAt, "input") })) }], "clients");
  }
  if (kind === "cases") {
    if (!can(user, "case.view")) throw new ForbiddenError();
    const { rows } = await listCases(user, { ...sp, page: 1, pageSize: 5000 });
    const names = await userNames(rows.map((r) => r.responsibleId));
    return xlsx(user, "فهرست پرونده‌ها", [{ name: "پرونده‌ها", columns: [{ header: "شماره", key: "number", width: 16 }, { header: "عنوان", key: "title", width: 36 }, { header: "مراجعه‌کننده", key: "client", width: 26 }, { header: "دسته", key: "category", width: 14 }, { header: "وضعیت", key: "status", width: 14 }, { header: "اولویت", key: "priority", width: 10 }, { header: "مسئول", key: "resp", width: 22 }, { header: "مرجع قضایی", key: "court", width: 28 }, { header: "کلاسه", key: "courtNo", width: 18 }, { header: "تاریخ تشکیل", key: "opened", width: 14 }],
      rows: rows.map((c) => ({ number: c.number, title: c.title, client: c.client.displayName, category: c.category, status: CASE_STATUS[c.status].label, priority: PRIORITY[c.priority].label, resp: c.responsibleId ? names[c.responsibleId] : "", court: [c.courtName, c.courtBranch].filter(Boolean).join(" - "), courtNo: c.courtCaseNumber, opened: formatJalali(c.openedAt, "input") })) }], "cases");
  }
  if (kind === "tasks") {
    if (!can(user, "task.view")) throw new ForbiddenError();
    const { rows } = await listTasks(user, { ...sp, view: sp.view ?? "all", status: sp.status ?? "all", page: 1, pageSize: 5000 });
    const names = await userNames(rows.flatMap((r) => [r.assigneeId, r.createdById]));
    return xlsx(user, "فهرست وظایف", [{ name: "وظایف", columns: [{ header: "کد", key: "code", width: 16 }, { header: "عنوان", key: "title", width: 40 }, { header: "مجری", key: "a", width: 22 }, { header: "ارجاع‌دهنده", key: "c", width: 22 }, { header: "پرونده", key: "case", width: 16 }, { header: "مهلت", key: "due", width: 14 }, { header: "وضعیت", key: "status", width: 14 }, { header: "اولویت", key: "p", width: 10 }],
      rows: rows.map((t) => ({ code: t.code, title: t.title, a: t.assigneeId ? names[t.assigneeId] : "", c: names[t.createdById], case: t.case?.number, due: t.dueAt ? formatJalali(t.dueAt, "input") : "", status: TASK_STATUS[t.status].label, p: PRIORITY[t.priority].label })) }], "tasks");
  }
  if (kind === "audit") {
    if (!can(user, "audit.view")) throw new ForbiddenError();
    const rows = await db.activityLog.findMany({ where: { ...(sp.group ? { action: { startsWith: `${sp.group}.` } } : {}), ...(sp.actor ? { actorId: sp.actor } : {}) }, orderBy: { createdAt: "desc" }, take: 20000, include: { actor: { select: { fullName: true } } } });
    return xlsx(user, "تاریخچه فعالیت‌ها", [{ name: "رویدادها", columns: [{ header: "زمان", key: "t", width: 20 }, { header: "کاربر", key: "u", width: 22 }, { header: "عملیات", key: "a", width: 28 }, { header: "رکورد", key: "e", width: 40 }, { header: "IP", key: "ip", width: 16 }, { header: "جزئیات", key: "m", width: 60 }],
      rows: rows.map((r) => ({ t: formatJalali(r.createdAt, "datetime"), u: r.actor?.fullName ?? "سامانه", a: ACTION_LABELS[r.action] ?? r.action, e: r.entityLabel, ip: r.ip, m: r.meta ? JSON.stringify(r.meta) : "" })) }], "audit");
  }
  if (kind === "report" || kind === "report-pdf") {
    if (!can(user, "report.view")) throw new ForbiddenError();
    const f = await reportExport(kind, user, sp);
    return file(f.data, f.name, f.type);
  }
  if (kind === "case-history" && slug[1]) {
    const c = await db.case.findFirst({ where: { id: slug[1], AND: [caseScope(user)] }, include: { client: true, parties: true } });
    if (!c) throw new NotFoundError();
    const [office, timeline, tasks, deadlines, docs] = await Promise.all([
      getOffice(), activityFor({ caseId: c.id }, 1000), db.task.findMany({ where: { caseId: c.id }, orderBy: { createdAt: "asc" } }), db.deadline.findMany({ where: { caseId: c.id }, orderBy: { dueAt: "asc" } }),
      db.document.findMany({ where: { caseId: c.id, AND: [documentScope(user)] }, orderBy: { createdAt: "asc" } }),
    ]);
    const names = await userNames([c.responsibleId, ...tasks.map((t) => t.assigneeId), ...deadlines.map((d) => d.assigneeId)]);
    const row = (cells: (string | null | undefined)[]) => `<tr>${cells.map((x) => `<td>${esc(x ?? "—")}</td>`).join("")}</tr>`;
    const body = `<div class="head"><div><b>${esc(office.officeName)}</b><div class="small muted">سوابق کامل پرونده</div></div><div class="small">شماره پرونده: <span class="ltr">${esc(c.number)}</span><br>تاریخ تهیه: ${formatJalali(new Date(), "datetime")}</div></div>
      <h1>${esc(c.title)}</h1>
      <table class="report"><tbody>${row(["مراجعه‌کننده", c.client.displayName, "وضعیت", CASE_STATUS[c.status].label])}${row(["دسته", c.category, "مسئول", c.responsibleId ? names[c.responsibleId] : "—"])}${row(["مرجع قضایی", [c.courtName, c.courtBranch].filter(Boolean).join(" - "), "کلاسه", c.courtCaseNumber])}${row(["تاریخ تشکیل", formatJalali(c.openedAt, "date"), "تاریخ اختتام", c.closedAt ? formatJalali(c.closedAt, "date") : "—"])}</tbody></table>
      ${c.description ? `<h2>شرح</h2><p>${esc(c.description)}</p>` : ""}${c.closeReason ? `<h2>نتیجه</h2><p>${esc(c.closeReason)}</p>` : ""}
      <h2>اصحاب پرونده</h2><table class="report"><thead><tr><th>سمت</th><th>نام</th><th>کد ملی</th><th>نشانی</th></tr></thead><tbody>${c.parties.map((p) => row([p.role, p.name, p.nationalId, p.address])).join("")}</tbody></table>
      <h2>اسناد (${faNum(docs.length)})</h2><table class="report"><thead><tr><th>کد</th><th>عنوان</th><th>نوع</th><th>تاریخ ثبت</th></tr></thead><tbody>${docs.map((d) => row([d.code, d.title, d.category, formatJalali(d.createdAt, "date")])).join("") || row(["—", "سندی ثبت نشده", "", ""])}</tbody></table>
      <h2>وظایف (${faNum(tasks.length)})</h2><table class="report"><thead><tr><th>کد</th><th>عنوان</th><th>مجری</th><th>وضعیت</th><th>نتیجه</th></tr></thead><tbody>${tasks.map((t) => row([t.code, t.title, t.assigneeId ? names[t.assigneeId] : "—", TASK_STATUS[t.status].label, t.result])).join("") || row(["—", "وظیفه‌ای ثبت نشده", "", "", ""])}</tbody></table>
      <h2>مهلت‌ها (${faNum(deadlines.length)})</h2><table class="report"><thead><tr><th>عنوان</th><th>نوع</th><th>سررسید</th><th>مسئول</th><th>وضعیت</th></tr></thead><tbody>${deadlines.map((d) => row([d.title, DEADLINE_TYPE[d.type], formatJalali(d.dueAt, "datetime"), names[d.assigneeId], DEADLINE_STATUS[d.status].label])).join("") || row(["مهلتی ثبت نشده", "", "", "", ""])}</tbody></table>
      <h2>تاریخچه فعالیت‌ها (${faNum(timeline.length)})</h2><table class="report"><thead><tr><th>زمان</th><th>کاربر</th><th>عملیات</th><th>شرح</th></tr></thead><tbody>${[...timeline].reverse().map((a) => row([formatJalali(a.createdAt, "datetime"), a.actorName ?? "سامانه", ACTION_LABELS[a.action] ?? a.action, [a.entityLabel, a.detail].filter(Boolean).join(" — ")])).join("")}</tbody></table>`;
    const pdf = await htmlToPdf({ title: `سوابق پرونده ${c.number}`, bodyHtml: body, footerNote: `${office.officeName} — سوابق پرونده ${c.number} — محرمانه` });
    await audit({ actorId: user.id, action: "report.exported", entityType: "Case", entityId: c.id, entityLabel: `سوابق پرونده ${c.title} (${c.number}) — PDF`, caseId: c.id, clientId: c.clientId });
    return file(pdf, `case-${c.number}-${stamp()}.pdf`, "application/pdf");
  }
  void formatDateOnly;
  throw new AppError("نوع خروجی ناشناخته است.", "NOT_FOUND", 404);
});
