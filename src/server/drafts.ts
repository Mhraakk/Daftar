import type { DraftStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError, ConflictError, ForbiddenError } from "@/lib/errors";
import { formatJalali } from "@/lib/jalali";
import { DRAFT_STATUS, LEGAL_DOC_TYPES } from "@/lib/labels";
import { notify } from "@/lib/notify";
import { nextNumber } from "@/lib/numbering";
import { extractFields, fillFields, KNOWN_FIELDS, unfilledFields } from "@/lib/template-fields";
import { toEnDigits, toFaDigits } from "@/lib/text";
import { assertCaseAccess, assertClientAccess, assertDraftAccess, draftScope } from "./access";
import { getOffice } from "./admin";
import { sanitizeLegalHtml } from "./sanitize";
import { indexEntity } from "./search-index";

const label = (d: { title: string; code: string }) => `${d.title} (${d.code})`;
const EDITABLE: DraftStatus[] = ["DRAFT", "CHANGES_REQUESTED"];

async function reindex(id: string) {
  const d = await db.legalDraft.findUnique({ where: { id } });
  if (!d) return;
  await indexEntity({ entityType: "draft", entityId: id, title: d.title, subtitle: `${d.code} · ${LEGAL_DOC_TYPES[d.docType] ?? ""}`, body: d.contentHtml.replace(/<[^>]+>/g, " "), caseId: d.caseId, clientId: d.clientId, ownerId: d.authorId, link: `/drafts/${id}` });
}

/** مقادیر خودکار فیلدهای قالب از پرونده، مراجعه‌کننده، دفتر و کاربر */
export async function autoFieldValues(user: SessionUser, caseId: string | null, clientId: string | null): Promise<Record<string, string>> {
  const office = await getOffice();
  const v: Record<string, string> = { "office.name": office.officeName, "office.address": office.address, "office.phone": toFaDigits(office.phone), "user.fullName": user.fullName, today: formatJalali(new Date(), "date") };
  let cid = clientId;
  if (caseId) {
    const c = await db.case.findUnique({ where: { id: caseId }, include: { parties: true } });
    if (c) {
      cid = c.clientId;
      Object.assign(v, { "case.number": c.number, "case.title": c.title, "case.courtName": c.courtName ?? "", "case.courtBranch": c.courtBranch ?? "", "case.courtCaseNumber": c.courtCaseNumber ? toFaDigits(c.courtCaseNumber) : "", "case.archiveNumber": c.archiveNumber ? toFaDigits(c.archiveNumber) : "" });
      const opp = c.parties.find((p) => !p.clientId && /خوانده|مشتکی|متهم/.test(p.role)) ?? c.parties.find((p) => !p.clientId && !/وکیل|شاهد|کارشناس/.test(p.role));
      if (opp) Object.assign(v, { "opponent.name": opp.name, "opponent.nationalId": opp.nationalId ? toFaDigits(opp.nationalId) : "", "opponent.address": opp.address ?? "", "opponent.phone": opp.phone ? toFaDigits(opp.phone) : "" });
    }
  }
  if (cid) {
    const cl = await db.client.findUnique({ where: { id: cid } });
    if (cl) Object.assign(v, { "client.displayName": cl.displayName, "client.nationalId": cl.nationalId ? toFaDigits(cl.nationalId) : "", "client.fatherName": cl.fatherName ?? "", "client.address": cl.address ?? "", "client.mobile": cl.mobile ? toFaDigits(cl.mobile) : "", "client.postalCode": cl.postalCode ? toFaDigits(cl.postalCode) : "" });
  }
  return v;
}

/** پیش‌نمایش فیلدهای یک قالب برای پرونده انتخابی: کدام خودکار پر می‌شود و کدام را کاربر باید وارد کند */
export async function prepareTemplate(templateId: string, caseId: string | null, user: SessionUser) {
  if (caseId) await assertCaseAccess(user, caseId);
  const t = await db.legalTemplate.findFirst({ where: { id: templateId, isActive: true }, include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } } });
  if (!t || !t.versions[0]) throw new AppError("قالب یافت نشد یا غیرفعال است.");
  const auto = await autoFieldValues(user, caseId, null);
  return {
    template: { id: t.id, name: t.name, docType: t.docType, versionNo: t.versions[0].versionNo },
    fields: extractFields(t.versions[0].contentHtml).map((name) => ({ name, label: KNOWN_FIELDS[name] ?? name, known: name in KNOWN_FIELDS, value: auto[name] ?? "" })),
  };
}

export const createDraftSchema = z.object({
  title: z.string().trim().min(3, "عنوان سند باید دست‌کم ۳ نویسه باشد.").max(200),
  docType: z.string().refine((v) => v in LEGAL_DOC_TYPES, "نوع سند نامعتبر است."),
  caseId: z.string().optional().transform((v) => v || null),
  clientId: z.string().optional().transform((v) => v || null),
  templateId: z.string().optional().transform((v) => v || null),
  values: z.record(z.string().max(20000)).default({}),
  contentHtml: z.string().max(2_000_000).optional(),
  aiAssisted: z.boolean().default(false),
});

export async function createDraft(input: z.infer<typeof createDraftSchema>, user: SessionUser) {
  let { caseId, clientId } = input;
  if (caseId) clientId = (await assertCaseAccess(user, caseId)).clientId;
  else if (clientId) await assertClientAccess(user, clientId);
  let html = input.contentHtml ? sanitizeLegalHtml(input.contentHtml) : "";
  let source = input.aiAssisted ? "AI" : "MANUAL";
  if (input.templateId) {
    const t = await db.legalTemplate.findFirst({ where: { id: input.templateId, isActive: true }, include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } } });
    if (!t?.versions[0]) throw new AppError("قالب یافت نشد یا غیرفعال است.");
    const auto = await autoFieldValues(user, caseId, clientId);
    html = sanitizeLegalHtml(fillFields(t.versions[0].contentHtml, { ...auto, ...Object.fromEntries(Object.entries(input.values).filter(([, v]) => v.trim())) }));
    source = "TEMPLATE";
  }
  const d = await db.$transaction(async (tx) => {
    const code = await nextNumber("DRAFT", tx);
    const row = await tx.legalDraft.create({
      data: { code, title: input.title, docType: input.docType, caseId, clientId, templateId: input.templateId, authorId: user.id, contentHtml: html, aiAssisted: input.aiAssisted, currentVersion: 1, versions: { create: { versionNo: 1, contentHtml: html, source, authorId: user.id, note: source === "TEMPLATE" ? "ایجاد از قالب" : source === "AI" ? "پیش‌نویس تولیدشده با هوش مصنوعی" : "ایجاد" } } },
    });
    await audit({ actorId: user.id, action: "draft.created", entityType: "LegalDraft", entityId: row.id, entityLabel: label(row), caseId, clientId, meta: { docType: row.docType, templateId: input.templateId, aiAssisted: row.aiAssisted } }, tx);
    return row;
  });
  await reindex(d.id);
  return { id: d.id, code: d.code };
}

function assertEditor(d: { authorId: string; status: DraftStatus }, user: SessionUser) {
  if (!can(user, "draft.create")) throw new ForbiddenError();
  if (!EDITABLE.includes(d.status)) throw new AppError(`سند در وضعیت «${DRAFT_STATUS[d.status].label}» قابل ویرایش نیست.`, "LOCKED");
}

/** ذخیره متن. autosave فقط متن جاری را به‌روز می‌کند؛ ذخیره دستی یک نسخه شماره‌دار ثبت می‌کند. */
export async function saveDraft(id: string, version: number, contentHtml: string, mode: "AUTOSAVE" | "MANUAL", note: string | null, user: SessionUser, title?: string) {
  const d = await assertDraftAccess(user, id);
  assertEditor(d, user);
  const html = sanitizeLegalHtml(contentHtml);
  const res = await db.$transaction(async (tx) => {
    const data: Prisma.LegalDraftUpdateManyMutationInput = { contentHtml: html, version: { increment: 1 }, ...(title?.trim() ? { title: title.trim().slice(0, 200) } : {}) };
    let versionNo = d.currentVersion;
    if (mode === "MANUAL") {
      const last = await tx.legalDraftVersion.findFirst({ where: { draftId: id }, orderBy: { versionNo: "desc" } });
      if (last?.contentHtml !== html) {
        versionNo = (last?.versionNo ?? 0) + 1;
        await tx.legalDraftVersion.create({ data: { draftId: id, versionNo, contentHtml: html, note, source: "MANUAL", authorId: user.id } });
        data.currentVersion = versionNo;
      }
    }
    const r = await tx.legalDraft.updateMany({ where: { id, version }, data });
    if (r.count === 0) throw new ConflictError("این سند هم‌زمان در جای دیگری ویرایش شده است. برای جلوگیری از بازنویسی، صفحه را تازه‌سازی کنید.");
    if (mode === "MANUAL") await audit({ actorId: user.id, action: "draft.saved", entityType: "LegalDraft", entityId: id, entityLabel: label(d), caseId: d.caseId, clientId: d.clientId, meta: { versionNo, note } }, tx);
    return { version: version + 1, versionNo };
  });
  if (mode === "MANUAL") await reindex(id);
  return res;
}

export async function restoreDraftVersion(id: string, versionNo: number, user: SessionUser) {
  const d = await assertDraftAccess(user, id);
  assertEditor(d, user);
  const v = await db.legalDraftVersion.findUnique({ where: { draftId_versionNo: { draftId: id, versionNo } } });
  if (!v) throw new AppError("نسخه یافت نشد.");
  await db.$transaction(async (tx) => {
    const last = await tx.legalDraftVersion.findFirst({ where: { draftId: id }, orderBy: { versionNo: "desc" } });
    const n = (last?.versionNo ?? 0) + 1;
    await tx.legalDraftVersion.create({ data: { draftId: id, versionNo: n, contentHtml: v.contentHtml, note: `بازگردانی نسخه ${versionNo}`, source: "RESTORE", authorId: user.id } });
    await tx.legalDraft.update({ where: { id }, data: { contentHtml: v.contentHtml, currentVersion: n, version: { increment: 1 } } });
    await audit({ actorId: user.id, action: "draft.restored", entityType: "LegalDraft", entityId: id, entityLabel: label(d), caseId: d.caseId, clientId: d.clientId, meta: { from: versionNo, to: n } }, tx);
  });
  await reindex(id);
}

export async function submitDraft(id: string, reviewerId: string, user: SessionUser) {
  const d = await assertDraftAccess(user, id);
  assertEditor(d, user);
  if (reviewerId === d.authorId || reviewerId === user.id) throw new AppError("تنظیم‌کننده سند نمی‌تواند بررسی‌کننده آن باشد.", "VALIDATION", 400, { reviewerId: "شخص دیگری انتخاب کنید." });
  const reviewer = await db.user.findFirst({ where: { id: reviewerId, isActive: true, role: { permissions: { some: { permissionKey: "draft.review" } } } } });
  if (!reviewer) throw new AppError("کاربر انتخاب‌شده مجوز بررسی و تأیید اسناد را ندارد.", "VALIDATION", 400, { reviewerId: "نامعتبر است." });
  if (!d.contentHtml.replace(/<[^>]+>/g, "").trim()) throw new AppError("سند خالی است.");
  await db.$transaction(async (tx) => {
    const last = await tx.legalDraftVersion.findFirst({ where: { draftId: id }, orderBy: { versionNo: "desc" } });
    let n = last?.versionNo ?? 0;
    if (last?.contentHtml !== d.contentHtml) { n++; await tx.legalDraftVersion.create({ data: { draftId: id, versionNo: n, contentHtml: d.contentHtml, note: "نسخه ارسال‌شده برای بررسی", source: "MANUAL", authorId: user.id } }); }
    await tx.legalDraft.update({ where: { id }, data: { status: "IN_REVIEW", reviewerId, currentVersion: n, version: { increment: 1 }, approvedById: null, approvedAt: null } });
    await audit({ actorId: user.id, action: "draft.submitted", entityType: "LegalDraft", entityId: id, entityLabel: label(d), caseId: d.caseId, clientId: d.clientId, meta: { reviewerId, toName: reviewer.fullName, versionNo: n } }, tx);
    await notify({ userId: reviewerId, type: "draft.review", title: "سندی برای بررسی به شما ارجاع شد", body: `${d.title}${d.aiAssisted ? " — پیش‌نویس با کمک هوش مصنوعی" : ""}`, link: `/drafts/${id}`, entityType: "LegalDraft", entityId: id }, tx);
  });
}

export async function reviewDraft(id: string, decision: "APPROVE" | "CHANGES", comment: string | null, user: SessionUser) {
  if (!can(user, "draft.review")) throw new ForbiddenError("بررسی و تأیید سند نیازمند مجوز است.");
  const d = await assertDraftAccess(user, id);
  if (d.status !== "IN_REVIEW") throw new AppError("این سند در وضعیت «در حال بررسی» نیست.");
  if (d.authorId === user.id) throw new ForbiddenError("تنظیم‌کننده سند نمی‌تواند سند خود را تأیید کند.");
  if (d.reviewerId !== user.id && !can(user, "draft.view_all")) throw new ForbiddenError("این سند به شما ارجاع نشده است.");
  if (decision === "CHANGES" && !comment?.trim()) throw new AppError("ثبت موارد اصلاحی الزامی است.");
  const approve = decision === "APPROVE";
  await db.$transaction(async (tx) => {
    await tx.draftReview.create({ data: { draftId: id, reviewerId: user.id, decision, comment, versionNo: d.currentVersion } });
    await tx.legalDraft.update({ where: { id }, data: { status: approve ? "APPROVED" : "CHANGES_REQUESTED", approvedById: approve ? user.id : null, approvedAt: approve ? new Date() : null, version: { increment: 1 } } });
    await audit({ actorId: user.id, action: approve ? "draft.approved" : "draft.changes_requested", entityType: "LegalDraft", entityId: id, entityLabel: label(d), caseId: d.caseId, clientId: d.clientId, meta: { comment, versionNo: d.currentVersion } }, tx);
    await notify({ userId: d.authorId, type: "draft.reviewed", title: approve ? "سند شما تأیید شد" : "سند شما نیازمند اصلاح است", body: `${d.title}${comment ? ` — ${comment}` : ""}`, link: `/drafts/${id}`, entityType: "LegalDraft", entityId: id, important: !approve }, tx);
  });
}

/** بازگرداندن سند تأییدشده به حالت پیش‌نویس (تأیید باطل می‌شود) */
export async function reopenDraft(id: string, user: SessionUser) {
  const d = await assertDraftAccess(user, id);
  if (!can(user, "draft.create")) throw new ForbiddenError();
  if (!["APPROVED", "IN_REVIEW"].includes(d.status)) throw new AppError("فقط سند «در حال بررسی» یا «تأییدشده» قابل بازگشت به پیش‌نویس است.");
  if (d.authorId !== user.id && !can(user, "draft.view_all")) throw new ForbiddenError();
  await db.$transaction(async (tx) => {
    await tx.legalDraft.update({ where: { id }, data: { status: "DRAFT", approvedById: null, approvedAt: null, version: { increment: 1 } } });
    await audit({ actorId: user.id, action: "draft.saved", entityType: "LegalDraft", entityId: id, entityLabel: label(d), caseId: d.caseId, clientId: d.clientId, meta: { reopenedFrom: d.status } }, tx);
  });
}

export function finalizeBlockers(d: { status: DraftStatus; contentHtml: string; approvedById: string | null; authorId: string }): string[] {
  const b: string[] = [];
  if (d.status !== "APPROVED") b.push("سند باید ابتدا توسط بررسی‌کننده مجاز تأیید شود.");
  if (d.approvedById && d.approvedById === d.authorId) b.push("تأییدکننده و تنظیم‌کننده نباید یک نفر باشند.");
  const left = unfilledFields(d.contentHtml);
  if (left.length) b.push(`${toFaDigits(left.length)} فیلد تکمیل‌نشده در متن باقی است: ${left.slice(0, 4).map((f) => `«${KNOWN_FIELDS[f] ?? f}»`).join("، ")}${left.length > 4 ? " و…" : ""}`);
  return b;
}

export async function addDraftSource(input: { draftId: string; citation: string; url: string | null; note: string | null; legalSourceId?: string | null; origin?: string }, user: SessionUser) {
  const d = await assertDraftAccess(user, input.draftId);
  if (d.status === "FINAL") throw new AppError("سند نهایی قابل تغییر نیست.");
  if (input.url && !/^https?:\/\//i.test(input.url)) throw new AppError("نشانی منبع باید با http یا https آغاز شود.", "VALIDATION", 400, { url: "نامعتبر است." });
  await db.draftSource.create({ data: { draftId: d.id, citation: input.citation, url: input.url, note: input.note, legalSourceId: input.legalSourceId ?? null, origin: input.origin ?? "USER" } });
}
export async function setDraftSourceVerified(sourceId: string, verified: boolean, user: SessionUser) {
  if (!can(user, "draft.review")) throw new ForbiddenError("تأیید منبع نیازمند مجوز بررسی اسناد است.");
  const s = await db.draftSource.findUnique({ where: { id: sourceId } });
  if (!s) throw new AppError("منبع یافت نشد.");
  await assertDraftAccess(user, s.draftId);
  await db.draftSource.update({ where: { id: sourceId }, data: { verified, verifiedById: verified ? user.id : null } });
}
export async function removeDraftSource(sourceId: string, user: SessionUser) {
  const s = await db.draftSource.findUnique({ where: { id: sourceId } });
  if (!s) throw new AppError("منبع یافت نشد.");
  const d = await assertDraftAccess(user, s.draftId);
  if (d.status === "FINAL") throw new AppError("سند نهایی قابل تغییر نیست.");
  await db.draftSource.delete({ where: { id: sourceId } });
}

export async function listDrafts(user: SessionUser, p: { q?: string; status?: string; docType?: string; view?: string; page: number; pageSize: number }) {
  const and: Prisma.LegalDraftWhereInput[] = [draftScope(user), { archivedAt: null }];
  if (p.view === "review") and.push({ status: "IN_REVIEW", reviewerId: user.id });
  else if (p.view === "mine") and.push({ authorId: user.id });
  if (p.status && p.status in DRAFT_STATUS) and.push({ status: p.status as DraftStatus });
  if (p.docType && p.docType in LEGAL_DOC_TYPES) and.push({ docType: p.docType });
  if (p.q) { const q = p.q.trim(); and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { code: { contains: toEnDigits(q), mode: "insensitive" } }] }); }
  const where = { AND: and };
  const [total, rows] = await Promise.all([
    db.legalDraft.count({ where }),
    db.legalDraft.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize, include: { case: { select: { id: true, number: true } }, client: { select: { id: true, displayName: true } } } }),
  ]);
  return { total, rows };
}
