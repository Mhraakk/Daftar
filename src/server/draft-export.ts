// خروجی واقعی Word و PDF از متن سند حقوقی، با حفظ راست‌به‌چپ، فونت وزیرمتن، حاشیه A4، شماره‌گذاری و جدول.
import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, LevelFormat, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, type IRunOptions } from "docx";
import { parse, type HTMLElement, type Node } from "node-html-parser";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError, ForbiddenError } from "@/lib/errors";
import { formatJalali } from "@/lib/jalali";
import { LEGAL_DOC_TYPES } from "@/lib/labels";
import { nextNumber } from "@/lib/numbering";
import { newStorageKey, sha256, storage } from "@/lib/storage";
import { assertDraftAccess } from "./access";
import { getOffice } from "./admin";
import { reindexDocument } from "./documents";
import { finalizeBlockers } from "./drafts";
import { htmlToPdf } from "./pdf";

const FONT = "Vazirmatn";
const SIZE = 24; // نیم‌پوینت → ۱۲pt
type Fmt = { bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean };

const alignOf = (el: HTMLElement, fallback: (typeof AlignmentType)[keyof typeof AlignmentType]) => {
  const m = /text-align:\s*(right|left|center|justify)/.exec(el.getAttribute("style") ?? "");
  // در پاراگراف راست‌به‌چپِ Word، «START» یعنی راست
  return m ? { right: AlignmentType.START, left: AlignmentType.END, center: AlignmentType.CENTER, justify: AlignmentType.BOTH }[m[1] as "right"] : fallback;
};

function runs(node: Node, fmt: Fmt = {}, size = SIZE): TextRun[] {
  if (node.nodeType === 3) {
    const text = node.text.replace(/\s+/g, " ");
    if (!text) return [];
    const o: IRunOptions = { text, font: { name: FONT, cs: FONT }, size, sizeComplexScript: size, rightToLeft: true, bold: fmt.bold, boldComplexScript: fmt.bold, italics: fmt.italics, italicsComplexScript: fmt.italics, underline: fmt.underline ? {} : undefined, strike: fmt.strike };
    return [new TextRun(o)];
  }
  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase();
  if (tag === "br") return [new TextRun({ break: 1 })];
  const next: Fmt = { ...fmt, ...(tag === "strong" || tag === "b" ? { bold: true } : {}), ...(tag === "em" || tag === "i" ? { italics: true } : {}), ...(tag === "u" ? { underline: true } : {}), ...(tag === "s" ? { strike: true } : {}) };
  return el.childNodes.flatMap((c) => runs(c, next, size));
}

const para = (el: HTMLElement, o: Partial<ConstructorParameters<typeof Paragraph>[0] & object> = {}, fmt: Fmt = {}, size = SIZE) =>
  new Paragraph({ bidirectional: true, alignment: alignOf(el, AlignmentType.BOTH), spacing: { line: 440, after: 120 }, children: runs(el, fmt, size), ...(o as object) });

function block(el: HTMLElement, out: (Paragraph | Table)[], listLevel = 0) {
  const tag = el.tagName?.toLowerCase();
  switch (tag) {
    case "h1": out.push(para(el, { heading: HeadingLevel.HEADING_1, alignment: alignOf(el, AlignmentType.CENTER), spacing: { before: 120, after: 240 } }, {}, 30)); break;
    case "h2": out.push(para(el, { heading: HeadingLevel.HEADING_2, alignment: alignOf(el, AlignmentType.START), spacing: { before: 280, after: 100 } }, {}, 26)); break;
    case "h3": out.push(para(el, { heading: HeadingLevel.HEADING_3, alignment: alignOf(el, AlignmentType.START), spacing: { before: 200, after: 80 } }, {}, 24)); break;
    case "p": out.push(para(el)); break;
    case "blockquote": for (const c of el.childNodes) if (c.nodeType === 1) out.push(para(c as HTMLElement, { indent: { start: 500 }, border: { right: { style: BorderStyle.SINGLE, size: 12, color: "0D7A78", space: 8 } } })); break;
    case "hr": out.push(new Paragraph({ bidirectional: true, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "8B939A" } }, spacing: { after: 160 } })); break;
    case "ol": case "ul":
      for (const li of el.childNodes) {
        if (li.nodeType !== 1 || (li as HTMLElement).tagName?.toLowerCase() !== "li") continue;
        const item = li as HTMLElement;
        const nested = item.childNodes.filter((c) => c.nodeType === 1 && ["ol", "ul"].includes((c as HTMLElement).tagName.toLowerCase())) as HTMLElement[];
        const inline = item.childNodes.filter((c) => !nested.includes(c as HTMLElement));
        out.push(new Paragraph({ bidirectional: true, alignment: AlignmentType.BOTH, spacing: { line: 440, after: 60 }, numbering: { reference: tag === "ol" ? "fa-ol" : "fa-ul", level: Math.min(listLevel, 2) }, children: inline.flatMap((c) => runs(c)) }));
        for (const n of nested) block(n, out, listLevel + 1);
      }
      break;
    case "table": {
      const rows = el.querySelectorAll("tr").map((tr) => new TableRow({
        children: tr.querySelectorAll("th,td").map((cell) => new TableCell({
          columnSpan: Number(cell.getAttribute("colspan")) || undefined, rowSpan: Number(cell.getAttribute("rowspan")) || undefined,
          shading: cell.tagName.toLowerCase() === "th" ? { fill: "F1EEE6" } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.START, spacing: { line: 380 }, children: runs(cell, { bold: cell.tagName.toLowerCase() === "th" }, 22) })],
        })),
      })).filter((r) => r);
      if (rows.length) { out.push(new Table({ rows, visuallyRightToLeft: true, width: { size: 100, type: WidthType.PERCENTAGE } })); out.push(new Paragraph({ spacing: { after: 120 } })); }
      break;
    }
    default:
      if (el.childNodes.some((c) => c.nodeType === 1 && /^(p|h[1-3]|ol|ul|table|blockquote|div|hr)$/i.test((c as HTMLElement).tagName))) for (const c of el.childNodes) { if (c.nodeType === 1) block(c as HTMLElement, out, listLevel); }
      else if (el.text.trim()) out.push(para(el));
  }
}

export async function htmlToDocx(html: string, meta: { title: string; footer: string }): Promise<Buffer> {
  const root = parse(`<div>${html}</div>`).firstChild as HTMLElement;
  const children: (Paragraph | Table)[] = [];
  for (const c of root.childNodes) {
    if (c.nodeType === 1) block(c as HTMLElement, children);
    else if (c.text.trim()) children.push(new Paragraph({ bidirectional: true, children: runs(c) }));
  }
  if (!children.length) children.push(new Paragraph({ bidirectional: true }));
  const lvl = (level: number, format: (typeof LevelFormat)[keyof typeof LevelFormat], text: string) => ({ level, format, text, alignment: AlignmentType.START, style: { paragraph: { indent: { start: 560 + level * 420, hanging: 360 } }, run: { font: FONT, rightToLeft: true } } });
  const doc = new Document({
    title: meta.title, creator: "سامانه دفتر",
    styles: {
      default: { document: { run: { font: FONT, size: SIZE, rightToLeft: true }, paragraph: { spacing: { line: 440 } } } },
      // سبک عنوان‌ها: مشکی و پررنگ (نه آبی پیش‌فرض Word)
      paragraphStyles: [1, 2, 3].map((n) => ({ id: `Heading${n}`, name: `Heading ${n}`, basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, bold: true, boldComplexScript: true, color: "18222B", size: [30, 26, 24][n - 1], sizeComplexScript: [30, 26, 24][n - 1], rightToLeft: true } })),
    },
    numbering: { config: [
      { reference: "fa-ol", levels: [lvl(0, LevelFormat.DECIMAL, "%1-"), lvl(1, LevelFormat.DECIMAL, "%1-%2-"), lvl(2, LevelFormat.DECIMAL, "%1-%2-%3-")] },
      { reference: "fa-ul", levels: [lvl(0, LevelFormat.BULLET, "•"), lvl(1, LevelFormat.BULLET, "–"), lvl(2, LevelFormat.BULLET, "·")] },
    ] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1417, bottom: 1304, left: 1247, right: 1247 } } }, // A4، حاشیه ≈ ۲٫۵ و ۲٫۲ سانتی‌متر
      footers: { default: new Footer({ children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${meta.footer} — صفحه `, font: FONT, size: 16, rightToLeft: true, color: "5B6670" }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: "5B6670" })] })] }) },
      children,
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

function watermark(status: string, aiAssisted: boolean): string {
  if (status === "FINAL") return "";
  const text = status === "APPROVED" ? "تأییدشده — نهایی‌نشده" : aiAssisted ? "پیش‌نویس (با کمک هوش مصنوعی) — نیازمند بررسی" : "پیش‌نویس";
  return `<div style="position:fixed;top:42%;left:0;right:0;text-align:center;font-size:54pt;font-weight:700;color:rgba(160,50,37,.09);transform:rotate(-24deg);z-index:-1">${text}</div>`;
}

export async function exportDraft(id: string, format: "docx" | "pdf", user: SessionUser) {
  const d = await assertDraftAccess(user, id);
  const office = await getOffice();
  const footer = `${office.officeName} · ${d.code}${d.status === "FINAL" ? "" : " · پیش‌نویس"}`;
  const data = format === "docx"
    ? await htmlToDocx(d.contentHtml, { title: d.title, footer })
    : await htmlToPdf({ title: d.title, bodyHtml: watermark(d.status, d.aiAssisted) + d.contentHtml, footerNote: footer, margins: { top: "25mm", bottom: "23mm", side: "22mm" } });
  await audit({ actorId: user.id, action: "draft.exported", entityType: "LegalDraft", entityId: id, entityLabel: `${d.title} (${d.code})`, caseId: d.caseId, clientId: d.clientId, meta: { format, status: d.status, versionNo: d.currentVersion, sha256: sha256(data) } });
  return { data, fileName: `${d.title.replace(/[\\/:*?"<>|]/g, "-")}-${d.code}.${format}`, draft: d };
}

/** نهایی‌سازی: فقط سند تأییدشده توسط شخص دیگر؛ نسخه نهایی PDF و Word در بایگانی اسناد پرونده ثبت و سند قفل می‌شود. */
export async function finalizeDraft(id: string, user: SessionUser) {
  if (!can(user, "draft.finalize")) throw new ForbiddenError("نهایی‌سازی سند نیازمند مجوز است.");
  const d = await assertDraftAccess(user, id);
  const blockers = finalizeBlockers(d);
  if (blockers.length) throw new AppError(blockers.join(" "), "NOT_READY");
  const office = await getOffice();
  const footer = `${office.officeName} · ${d.code}`;
  const [pdf, docx] = await Promise.all([
    htmlToPdf({ title: d.title, bodyHtml: d.contentHtml, footerNote: footer, margins: { top: "25mm", bottom: "23mm", side: "22mm" } }),
    htmlToDocx(d.contentHtml, { title: d.title, footer }),
  ]);
  const pdfKey = newStorageKey("documents", ".pdf"), docxKey = newStorageKey("documents", ".docx");
  await Promise.all([storage.put(pdfKey, pdf), storage.put(docxKey, docx)]);
  const text = d.contentHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const base = d.title.replace(/[\\/:*?"<>|]/g, "-");
  try {
    const doc = await db.$transaction(async (tx) => {
      const claim = await tx.legalDraft.updateMany({ where: { id, status: "APPROVED", version: d.version }, data: { status: "FINAL", finalizedAt: new Date(), version: { increment: 1 } } });
      if (claim.count === 0) throw new AppError("وضعیت سند هم‌زمان تغییر کرده است. صفحه را تازه‌سازی کنید.", "CONFLICT", 409);
      const code = await nextNumber("DOCUMENT", tx);
      const row = await tx.document.create({
        data: {
          code, title: `${d.title} (نسخه نهایی)`, category: LEGAL_DOC_TYPES[d.docType] && ["دادخواست", "اظهارنامه", "شکواییه"].includes(LEGAL_DOC_TYPES[d.docType]) ? LEGAL_DOC_TYPES[d.docType] : d.docType.includes("BRIEF") ? "لایحه" : "سایر",
          description: `سند حقوقی نهایی ${d.code} — تأییدشده در ${formatJalali(d.approvedAt, "date")}`, tags: ["سند نهایی", LEGAL_DOC_TYPES[d.docType] ?? ""].filter(Boolean),
          caseId: d.caseId, clientId: d.clientId, createdById: user.id,
          versions: { create: [
            { versionNo: 1, fileName: `${base}.docx`, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: docx.length, sha256: sha256(docx), storageKey: docxKey, extractedText: text, textStatus: "EXTRACTED", note: "نسخه Word", uploadedById: user.id },
            { versionNo: 2, fileName: `${base}.pdf`, mimeType: "application/pdf", size: pdf.length, sha256: sha256(pdf), storageKey: pdfKey, extractedText: text, textStatus: "EXTRACTED", note: "نسخه نهایی PDF", uploadedById: user.id },
          ] },
        },
      });
      await audit({ actorId: user.id, action: "draft.finalized", entityType: "LegalDraft", entityId: id, entityLabel: `${d.title} (${d.code})`, caseId: d.caseId, clientId: d.clientId, meta: { documentId: row.id, documentCode: row.code, pdfSha256: sha256(pdf), approvedById: d.approvedById } }, tx);
      return row;
    });
    await reindexDocument(doc.id);
    return { documentId: doc.id };
  } catch (e) {
    await Promise.all([storage.remove(pdfKey), storage.remove(docxKey)]).catch(() => {});
    throw e;
  }
}
