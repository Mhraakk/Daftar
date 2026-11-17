// خروجی واقعی Word و PDF از متن سند حقوقی، با حفظ راست‌به‌چپ، فونت وزیرمتن، حاشیه A4، شماره‌گذاری، جدول
// و سربرگ دفتر (نام، کد، شهر، نشانی و تلفن) در صفحه نخست.
import { AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, LevelFormat, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, type IRunOptions } from "docx";
import { parse, type HTMLElement, type Node } from "node-html-parser";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError, ConflictError, ForbiddenError } from "@/lib/errors";
import { formatJalali } from "@/lib/jalali";
import { LEGAL_DOC_TYPES } from "@/lib/labels";
import { nextNumber } from "@/lib/numbering";
import { newStorageKey, sha256, storage } from "@/lib/storage";
import { toFaDigits } from "@/lib/text";
import { assertDraftAccess } from "./access";
import { getOffice, type OfficeSettings } from "./admin";
import { reindexDocument } from "./documents";
import { finalizeBlockers } from "./drafts";
import { esc, htmlToPdf } from "./pdf";

const FONT = "Vazirmatn";
/** اندازه‌ها به نیم‌پوینت (قرارداد Word): ۲۴ = ۱۲pt */
const SIZE = 24;
const SIZE_H1 = 30;
const SIZE_H2 = 26;
const SIZE_H3 = 24;
const SIZE_TABLE = 22;
const SIZE_FOOTER = 16;
const SIZE_LETTERHEAD = 28;
const SIZE_LETTERHEAD_SUB = 18;
/** فاصله‌ها و تورفتگی‌ها به twip (یک‌بیستم پوینت) */
const LINE = 440;
const LINE_TABLE = 380;
const AFTER = 120;
const AFTER_LIST = 60;
const BEFORE_H1 = 120;
const AFTER_H1 = 240;
const BEFORE_H2 = 280;
const AFTER_H2 = 100;
const BEFORE_H3 = 200;
const AFTER_H3 = 80;
const QUOTE_INDENT = 500;
const QUOTE_BORDER = 12;
const QUOTE_SPACE = 8;
const RULE_SIZE = 6;
const RULE_AFTER = 160;
const CELL_MARGIN_V = 60;
const CELL_MARGIN_H = 100;
const LIST_INDENT = 560;
const LIST_STEP = 420;
const LIST_HANGING = 360;
const MAX_LIST_LEVEL = 2;
const FULL_WIDTH = 100;
/** A4 با حاشیه ≈ ۲٫۵ و ۲٫۲ سانتی‌متر */
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN_TOP = 1417;
const MARGIN_BOTTOM = 1304;
const MARGIN_SIDE = 1247;
const PDF_MARGINS = { top: "25mm", bottom: "23mm", side: "22mm" };
const INK = "18222B";
const MUTED = "5B6670";
const RULE = "8B939A";
const QUOTE = "0D7A78";
const TH_FILL = "F1EEE6";
const TEXT_NODE = 3;
/** نسخه دوم سند بایگانی‌شده، PDF همان متن است (نسخه نخست Word) */
const PDF_VERSION = 2;
const ELEMENT_NODE = 1;

type Fmt = { bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean };
type Block = Paragraph | Table;
type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

// Inline text alignment in a style attribute: matches "text-align: center" (captures "center"), rejects "text-indent: 2em".
// https://regex101.com/?regex=text-align%3A%5Cs*%28right%7Cleft%7Ccenter%7Cjustify%29&testString=text-align%3A%20center&flavor=javascript
const TEXT_ALIGN = /text-align:\s*(right|left|center|justify)/;
// Runs of whitespace collapsed in text: matches "  \n " in "الف  \n ب", rejects "الف".
// https://regex101.com/?regex=%5Cs%2B&testString=%D8%A7%D9%84%D9%81%20%20%0A%20%D8%A8&flavor=javascript
const WHITESPACE = /\s+/g;
// A child element that forms its own block: matches "p", "h2", "table", rejects "span" and "strong".
// https://regex101.com/?regex=%5E%28p%7Ch%5B1-3%5D%7Col%7Cul%7Ctable%7Cblockquote%7Cdiv%7Chr%29%24&testString=table&flavor=javascript&flags=i
const BLOCK_TAG = /^(p|h[1-3]|ol|ul|table|blockquote|div|hr)$/i;
// One HTML tag: matches "<p>" and "</strong>", rejects "a < b".
// https://regex101.com/?regex=%3C%5B%5E%3E%5D%2B%3E&testString=%3Cp%3E%D9%85%D8%AA%D9%86%3C%2Fp%3E&flavor=javascript
const HTML_TAG = /<[^>]+>/g;
// Characters not allowed in file names: matches ":" and "/" in "a/b:c", rejects "دادخواست-۱".
// https://regex101.com/?regex=%5B%5C%5C%2F%3A*%3F%22%3C%3E%7C%5D&testString=a%2Fb%3Ac&flavor=javascript
const UNSAFE_FILE = /[\\/:*?"<>|]/g;

/** در پاراگراف راست‌به‌چپِ Word، «START» یعنی راست */
const ALIGNS: Record<string, Align> = { right: AlignmentType.START, left: AlignmentType.END, center: AlignmentType.CENTER, justify: AlignmentType.BOTH };
const alignOf = (el: HTMLElement, fallback: Align): Align => ALIGNS[TEXT_ALIGN.exec(el.getAttribute("style") ?? "")?.[1] ?? ""] ?? fallback;

const FORMAT_TAGS: Record<string, Fmt> = { strong: { bold: true }, b: { bold: true }, em: { italics: true }, i: { italics: true }, u: { underline: true }, s: { strike: true } };
const isElement = (n: Node): n is HTMLElement => n.nodeType === ELEMENT_NODE;
const tagOf = (el: HTMLElement): string => el.tagName?.toLowerCase() ?? "";

function runs(node: Node, fmt: Fmt = {}, size = SIZE): TextRun[] {
  if (node.nodeType === TEXT_NODE) {
    const text = node.text.replace(WHITESPACE, " ");
    if (!text) return [];
    const o: IRunOptions = {
      text, font: { name: FONT, cs: FONT }, size, sizeComplexScript: size, rightToLeft: true, bold: fmt.bold, boldComplexScript: fmt.bold,
      italics: fmt.italics, italicsComplexScript: fmt.italics, underline: fmt.underline ? {} : undefined, strike: fmt.strike,
    };
    return [new TextRun(o)];
  }
  if (!isElement(node)) return [];
  const tag = tagOf(node);
  if (tag === "br") return [new TextRun({ break: 1 })];
  return node.childNodes.flatMap((c) => runs(c, { ...fmt, ...(FORMAT_TAGS[tag] ?? {}) }, size));
}

type ParaOptions = Partial<ConstructorParameters<typeof Paragraph>[0] & object>;
const para = (el: HTMLElement, o: ParaOptions = {}, fmt: Fmt = {}, size = SIZE): Paragraph =>
  new Paragraph({ bidirectional: true, alignment: alignOf(el, AlignmentType.BOTH), spacing: { line: LINE, after: AFTER }, children: runs(el, fmt, size), ...(o as object) });

const heading = (level: (typeof HeadingLevel)[keyof typeof HeadingLevel], fallback: Align, before: number, after: number, size: number) =>
  (el: HTMLElement): Block[] => [para(el, { heading: level, alignment: alignOf(el, fallback), spacing: { before, after } }, {}, size)];

function listItems(el: HTMLElement, level: number): Block[] {
  const reference = tagOf(el) === "ol" ? "fa-ol" : "fa-ul";
  return el.childNodes.filter((n): n is HTMLElement => isElement(n) && tagOf(n) === "li").flatMap((item) => {
    const nested = item.childNodes.filter((c): c is HTMLElement => isElement(c) && ["ol", "ul"].includes(tagOf(c)));
    const inline = item.childNodes.filter((c) => !nested.includes(c as HTMLElement));
    const p = new Paragraph({ bidirectional: true, alignment: AlignmentType.BOTH, spacing: { line: LINE, after: AFTER_LIST }, numbering: { reference, level: Math.min(level, MAX_LIST_LEVEL) }, children: inline.flatMap((c) => runs(c)) });
    return [p, ...nested.flatMap((n) => blocks(n, level + 1))];
  });
}

function table(el: HTMLElement): Block[] {
  const rows = el.querySelectorAll("tr").map((tr) => new TableRow({
    children: tr.querySelectorAll("th,td").map((cell) => {
      const header = cell.tagName.toLowerCase() === "th";
      return new TableCell({
        columnSpan: Number(cell.getAttribute("colspan")) || undefined, rowSpan: Number(cell.getAttribute("rowspan")) || undefined,
        shading: header ? { fill: TH_FILL } : undefined, margins: { top: CELL_MARGIN_V, bottom: CELL_MARGIN_V, left: CELL_MARGIN_H, right: CELL_MARGIN_H },
        children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.START, spacing: { line: LINE_TABLE }, children: runs(cell, { bold: header }, SIZE_TABLE) })],
      });
    }),
  }));
  return rows.length ? [new Table({ rows, visuallyRightToLeft: true, width: { size: FULL_WIDTH, type: WidthType.PERCENTAGE } }), new Paragraph({ spacing: { after: AFTER } })] : [];
}

const BLOCKS: Record<string, (el: HTMLElement, level: number) => Block[]> = {
  h1: heading(HeadingLevel.HEADING_1, AlignmentType.CENTER, BEFORE_H1, AFTER_H1, SIZE_H1),
  h2: heading(HeadingLevel.HEADING_2, AlignmentType.START, BEFORE_H2, AFTER_H2, SIZE_H2),
  h3: heading(HeadingLevel.HEADING_3, AlignmentType.START, BEFORE_H3, AFTER_H3, SIZE_H3),
  p: (el) => [para(el)],
  blockquote: (el) => el.childNodes.filter(isElement).map((c) => para(c, { indent: { start: QUOTE_INDENT }, border: { right: { style: BorderStyle.SINGLE, size: QUOTE_BORDER, color: QUOTE, space: QUOTE_SPACE } } })),
  hr: () => [new Paragraph({ bidirectional: true, border: { bottom: { style: BorderStyle.SINGLE, size: RULE_SIZE, color: RULE } }, spacing: { after: RULE_AFTER } })],
  ol: listItems,
  ul: listItems,
  table: (el) => table(el),
};

/** یک عنصر HTML → بلوک‌های Word؛ ظرف‌های ناشناخته (div و …) فرزندانشان را بلوک‌به‌بلوک می‌دهند */
function blocks(el: HTMLElement, level = 0): Block[] {
  const known = BLOCKS[tagOf(el)];
  if (known) return known(el, level);
  if (el.childNodes.some((c) => isElement(c) && BLOCK_TAG.test(c.tagName))) return el.childNodes.filter(isElement).flatMap((c) => blocks(c, level));
  return el.text.trim() ? [para(el)] : [];
}

/** دسته بایگانی سند نهایی؛ دادخواست تجدیدنظر و واخواهی هم در «دادخواست» بایگانی می‌شوند */
const ARCHIVE_CATEGORY: Record<string, string> = {
  PETITION: "دادخواست", APPEAL: "دادخواست", OBJECTION: "دادخواست", JUDICIAL_REQUEST: "دادخواست", DECLARATION: "اظهارنامه", COMPLAINT: "شکواییه",
  DEFENSE_BRIEF: "لایحه", SUPPLEMENTARY_BRIEF: "لایحه",
};
export const archiveCategory = (docType: string): string => ARCHIVE_CATEGORY[docType] ?? "سایر";

export interface Letterhead { name: string; lines: string[] }

/** سربرگ دفتر از تنظیمات: نام، و یک خط کد/شهر و یک خط نشانی/تلفن (خانه‌های خالی حذف) */
export function letterheadOf(office: Pick<OfficeSettings, "officeName" | "officeCode" | "city" | "address" | "phone" | "letterheadNote">): Letterhead {
  const id = [office.officeCode && `کد دفتر ${toFaDigits(office.officeCode)}`, office.city].filter(Boolean).join(" · ");
  const contact = [office.address, office.phone && `تلفن ${toFaDigits(office.phone)}`].filter(Boolean).join(" · ");
  return { name: office.officeName, lines: [id, contact, office.letterheadNote].filter(Boolean) };
}

const letterheadHtml = (h: Letterhead): string =>
  `<div class="letterhead"><p class="lh-name">${esc(h.name)}</p>${h.lines.map((l) => `<p class="lh-line">${esc(l)}</p>`).join("")}</div>`;
const LETTERHEAD_CSS = ".letterhead{text-align:center;border-bottom:1.2pt double #18222b;padding-bottom:5pt;margin-bottom:14pt}.lh-name{font-weight:700;font-size:13pt;margin:0;text-align:center}.lh-line{margin:0;font-size:8.5pt;color:#5b6670;text-align:center}";

function letterheadDocx(h: Letterhead): Header {
  const line = (text: string, size: number, bold: boolean, color: string) =>
    new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, children: [new TextRun({ text, font: FONT, size, sizeComplexScript: size, bold, boldComplexScript: bold, rightToLeft: true, color })] });
  return new Header({
    children: [
      line(h.name, SIZE_LETTERHEAD, true, INK),
      ...h.lines.map((l) => line(l, SIZE_LETTERHEAD_SUB, false, MUTED)),
      new Paragraph({ bidirectional: true, border: { bottom: { style: BorderStyle.DOUBLE, size: RULE_SIZE, color: INK } }, spacing: { after: AFTER } }),
    ],
  });
}

const HEADING_SIZES = [SIZE_H1, SIZE_H2, SIZE_H3];

export async function htmlToDocx(html: string, meta: { title: string; footer: string; letterhead?: Letterhead }): Promise<Buffer> {
  const root = parse(`<div>${html}</div>`).firstChild as HTMLElement;
  const body = root.childNodes.flatMap((c) => (isElement(c) ? blocks(c) : [new Paragraph({ bidirectional: true, children: runs(c) })].filter(() => !!c.text.trim())));
  const children = body.length ? body : [new Paragraph({ bidirectional: true })];
  const lvl = (level: number, format: (typeof LevelFormat)[keyof typeof LevelFormat], text: string) => ({
    level, format, text, alignment: AlignmentType.START,
    style: { paragraph: { indent: { start: LIST_INDENT + level * LIST_STEP, hanging: LIST_HANGING } }, run: { font: FONT, rightToLeft: true } },
  });
  const doc = new Document({
    title: meta.title, creator: "سامانه دفتر",
    styles: {
      default: { document: { run: { font: FONT, size: SIZE, rightToLeft: true }, paragraph: { spacing: { line: LINE } } } },
      // سبک عنوان‌ها: مشکی و پررنگ (نه آبی پیش‌فرض Word)
      paragraphStyles: HEADING_SIZES.map((size, i) => ({ id: `Heading${i + 1}`, name: `Heading ${i + 1}`, basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, bold: true, boldComplexScript: true, color: INK, size, sizeComplexScript: size, rightToLeft: true } })),
    },
    numbering: { config: [
      { reference: "fa-ol", levels: [lvl(0, LevelFormat.DECIMAL, "%1-"), lvl(1, LevelFormat.DECIMAL, "%1-%2-"), lvl(MAX_LIST_LEVEL, LevelFormat.DECIMAL, "%1-%2-%3-")] },
      { reference: "fa-ul", levels: [lvl(0, LevelFormat.BULLET, "•"), lvl(1, LevelFormat.BULLET, "–"), lvl(MAX_LIST_LEVEL, LevelFormat.BULLET, "·")] },
    ] },
    sections: [{
      properties: { titlePage: !!meta.letterhead, page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_SIDE, right: MARGIN_SIDE } } },
      ...(meta.letterhead ? { headers: { first: letterheadDocx(meta.letterhead) } } : {}),
      footers: {
        default: new Footer({ children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: `${meta.footer} — صفحه `, font: FONT, size: SIZE_FOOTER, rightToLeft: true, color: MUTED }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SIZE_FOOTER, color: MUTED }),
        ] })] }),
      },
      children,
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

const WATERMARK: Record<string, string> = { APPROVED: "تأییدشده — نهایی‌نشده" };
function watermark(status: string, aiAssisted: boolean): string {
  if (status === "FINAL") return "";
  const text = WATERMARK[status] ?? (aiAssisted ? "پیش‌نویس (با کمک هوش مصنوعی) — نیازمند بررسی" : "پیش‌نویس");
  return `<div style="position:fixed;top:42%;left:0;right:0;text-align:center;font-size:54pt;font-weight:700;color:rgba(160,50,37,.09);transform:rotate(-24deg);z-index:-1">${text}</div>`;
}

const fileBase = (title: string): string => title.replace(UNSAFE_FILE, "-");

export async function exportDraft(id: string, format: "docx" | "pdf", user: SessionUser) {
  const d = await assertDraftAccess(user, id);
  const office = await getOffice();
  const head = letterheadOf(office);
  const footer = `${office.officeName} · ${d.code}${d.status === "FINAL" ? "" : " · پیش‌نویس"}`;
  const data = format === "docx"
    ? await htmlToDocx(d.contentHtml, { title: d.title, footer, letterhead: head })
    : await htmlToPdf({ title: d.title, bodyHtml: watermark(d.status, d.aiAssisted) + letterheadHtml(head) + d.contentHtml, footerNote: footer, extraCss: LETTERHEAD_CSS, margins: PDF_MARGINS });
  await audit({ actorId: user.id, action: "draft.exported", entityType: "LegalDraft", entityId: id, entityLabel: `${d.title} (${d.code})`, caseId: d.caseId, clientId: d.clientId, meta: { format, status: d.status, versionNo: d.currentVersion, sha256: sha256(data) } });
  return { data, fileName: `${fileBase(d.title)}-${d.code}.${format}`, draft: d };
}

/** نهایی‌سازی: فقط سند تأییدشده توسط شخص دیگر؛ نسخه نهایی PDF و Word در بایگانی اسناد پرونده ثبت و سند قفل می‌شود. */
export async function finalizeDraft(id: string, user: SessionUser) {
  if (!can(user, "draft.finalize")) throw new ForbiddenError("نهایی‌سازی سند نیازمند مجوز است.");
  const d = await assertDraftAccess(user, id);
  const blockers = finalizeBlockers(d);
  if (blockers.length) throw new AppError(blockers.join(" "), "NOT_READY");
  const office = await getOffice();
  const head = letterheadOf(office);
  const footer = `${office.officeName} · ${d.code}`;
  const [pdf, docx] = await Promise.all([
    htmlToPdf({ title: d.title, bodyHtml: letterheadHtml(head) + d.contentHtml, footerNote: footer, extraCss: LETTERHEAD_CSS, margins: PDF_MARGINS }),
    htmlToDocx(d.contentHtml, { title: d.title, footer, letterhead: head }),
  ]);
  const pdfKey = newStorageKey("documents", ".pdf");
  const docxKey = newStorageKey("documents", ".docx");
  await Promise.all([storage.put(pdfKey, pdf), storage.put(docxKey, docx)]);
  const text = d.contentHtml.replace(HTML_TAG, " ").replace(WHITESPACE, " ").trim();
  const base = fileBase(d.title);
  try {
    const doc = await db.$transaction(async (tx) => {
      const claim = await tx.legalDraft.updateMany({ where: { id, status: "APPROVED", version: d.version }, data: { status: "FINAL", finalizedAt: new Date(), version: { increment: 1 } } });
      if (claim.count === 0) throw new ConflictError("وضعیت سند هم‌زمان تغییر کرده است. صفحه را تازه‌سازی کنید.");
      const code = await nextNumber("DOCUMENT", tx);
      const row = await tx.document.create({
        data: {
          code, title: `${d.title} (نسخه نهایی)`, category: archiveCategory(d.docType),
          description: `سند حقوقی نهایی ${d.code} — تأییدشده در ${formatJalali(d.approvedAt, "date")}`, tags: ["سند نهایی", LEGAL_DOC_TYPES[d.docType] ?? ""].filter(Boolean),
          caseId: d.caseId, clientId: d.clientId, createdById: user.id,
          versions: { create: [
            { versionNo: 1, fileName: `${base}.docx`, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: docx.length, sha256: sha256(docx), storageKey: docxKey, extractedText: text, textStatus: "EXTRACTED", note: "نسخه Word", uploadedById: user.id },
            { versionNo: PDF_VERSION, fileName: `${base}.pdf`, mimeType: "application/pdf", size: pdf.length, sha256: sha256(pdf), storageKey: pdfKey, extractedText: text, textStatus: "EXTRACTED", note: "نسخه نهایی PDF", uploadedById: user.id },
          ] },
        },
      });
      await audit({ actorId: user.id, action: "draft.finalized", entityType: "LegalDraft", entityId: id, entityLabel: `${d.title} (${d.code})`, caseId: d.caseId, clientId: d.clientId, meta: { documentId: row.id, documentCode: row.code, pdfSha256: sha256(pdf), approvedById: d.approvedById } });
      return row;
    });
    await reindexDocument(doc.id);
    return { documentId: doc.id };
  } catch (e) {
    await Promise.allSettled([storage.remove(pdfKey), storage.remove(docxKey)]);
    throw e;
  }
}
