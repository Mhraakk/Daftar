// ورود فرم دادخواست (PDF با لایه متن، مانند «فرم دادخواست خدمات قضایی» Fk01/00): تصویر خاکستری صفحه برای یافتن
// خط‌های جدول و برش متن هر خانه با pdftotext. نتیجه یک «نوع دادخواست» پیش‌نویس است که پیش از انتشار بازبینی می‌شود.
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { assertCan, type SessionUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { sha256, storage, validateUpload } from "@/lib/storage";
import { cellText, cleanCellText, fieldOf, horizontalRules, parseForm, parsePgm, verticalRules, type Cell, type FieldKey, type GrayImage, type ParsedForm, type TextLine } from "./form-parser";

const run = promisify(execFile);

const DPI = 100;
const POINTS_PER_INCH = 72;
const PT_PER_PX = POINTS_PER_INCH / DPI;
const MAX_BUFFER_MB = 64;
const BYTES_PER_MB = 1_048_576;
const MAX_BUFFER = MAX_BUFFER_MB * BYTES_PER_MB;
/** بازه افقی ستون برچسب‌ها (pt) که خط‌های افقی جدول در آن جست‌وجو می‌شود */
const LABEL_PROBE_FROM = 445;
const LABEL_PROBE_TO = 515;
/** ستون‌های پیش‌فرض فرم Fk01/00 وقتی خط عمودی پیدا نشود (pt) */
const DEFAULT_VALUE_X0 = 45;
const DEFAULT_DIVIDER = 433;
const DEFAULT_LABEL_X1 = 530;
const DEFAULT_COLUMNS = { valueX0: DEFAULT_VALUE_X0, divider: DEFAULT_DIVIDER, labelX1: DEFAULT_LABEL_X1 };
const DIVIDER_MIN = 380;
const DIVIDER_MAX = 470;
const SECOND_FROM_END = 2;
const MIN_BAND = 6;
const MIN_RULES = 4;
const MIN_VERTICAL = 3;
const EDGE_PX = 3;
const PAD = 1;
const CODE_CHARS = 8;
const KEY_CHARS = 16;

export interface Columns { valueX0: number; divider: number; labelX1: number }
export interface ExtractedForm { cells: Cell[]; rules: number[]; columns: Columns }

async function pageImage(pdf: string): Promise<GrayImage> {
  const { stdout } = await run("pdftoppm", ["-f", "1", "-l", "1", "-r", String(DPI), "-gray", pdf], { encoding: "buffer", maxBuffer: MAX_BUFFER });
  return parsePgm(stdout);
}

// One text line's box in pdftotext -bbox-layout output: matches '<line xMin="53.1" yMin="61.0" xMax="433.0" yMax="72.4">', rejects '<word xMin="1">'.
// https://regex101.com/?regex=%3Cline%20xMin%3D%22%28%5B%5Cd.%5D%2B%29%22%20yMin%3D%22%28%5B%5Cd.%5D%2B%29%22%20xMax%3D%22%28%5B%5Cd.%5D%2B%29%22%20yMax%3D%22%28%5B%5Cd.%5D%2B%29%22%3E&testString=%3Cline%20xMin%3D%2253.1%22%20yMin%3D%2261.0%22%20xMax%3D%22433.0%22%20yMax%3D%2272.4%22%3E
const LINE_BOX = /<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">/g;
const FORM_FEED = "\f";

/** خطوط متن صفحه نخست به ترتیب خواندن، هر یک با کادر هندسی (خروجی متنی و bbox هم‌ترتیب‌اند) */
async function pageLines(pdf: string): Promise<TextLine[]> {
  const page = ["-q", "-f", "1", "-l", "1"];
  const [raw, bbox] = await Promise.all([
    run("pdftotext", [...page, pdf, "-"], { maxBuffer: MAX_BUFFER }),
    run("pdftotext", [...page, "-bbox-layout", pdf, "-"], { maxBuffer: MAX_BUFFER }),
  ]);
  const texts = raw.stdout.split("\n").filter((l) => l.trim() && l.trim() !== FORM_FEED);
  const boxes = [...bbox.stdout.matchAll(LINE_BOX)].map((m) => ({ x0: Number(m[1]), y0: Number(m[2]), x1: Number(m[3]), y1: Number(m[4]) }));
  if (texts.length !== boxes.length) throw new AppError("ساختار متن فرم قابل تشخیص نیست (ناهمخوانی خطوط متن و جایگاه آن‌ها).");
  return texts.map((text, i) => ({ text, ...boxes[i] }));
}

/** خانه‌هایی که جای خالی‌شان ممکن است فاصله سفید (نه نقطه‌چین) باشد: تکه‌های هم‌ردیف با جای خالی کنار هم می‌نشینند */
const GAP_FIELDS = new Set<FieldKey>(["body", "evidenceInfo"]);

const toPx = (pt: number): number => Math.round(pt / PT_PER_PX);
const toPt = (px: number): number => px * PT_PER_PX;

/** ستون‌ها از خط‌های عمودی نخستین ردیفی که سه خط (لبه چپ، جداکننده، لبه راست) دارد */
function detectColumns(img: GrayImage, bands: { y0: number; y1: number }[]): Columns {
  const found = bands
    .map((b) => verticalRules(img, toPx(b.y0) + EDGE_PX, toPx(b.y1) - EDGE_PX).map(toPt))
    .find((v) => v.length >= MIN_VERTICAL && v[v.length - SECOND_FROM_END] >= DIVIDER_MIN && v[v.length - SECOND_FROM_END] <= DIVIDER_MAX);
  return found ? { valueX0: found[0], divider: found[found.length - SECOND_FROM_END], labelX1: found[found.length - 1] } : DEFAULT_COLUMNS;
}

/** خانه‌های برچسب/مقدار جدول فرم */
export async function extractFormCells(pdf: string): Promise<ExtractedForm> {
  const img = await pageImage(pdf);
  const rules = horizontalRules(img, toPx(LABEL_PROBE_FROM), toPx(LABEL_PROBE_TO)).map(toPt);
  if (rules.length < MIN_RULES) throw new AppError("جدول فرم دادخواست در این فایل پیدا نشد؛ فقط فرم‌های جدول‌دار «دادخواست خدمات قضایی» قابل ورود است.");
  const bands = rules.slice(1).map((y1, i) => ({ y0: rules[i], y1 })).filter((b) => b.y1 - b.y0 >= MIN_BAND);
  const columns = detectColumns(img, bands);
  const lines = await pageLines(pdf);
  const cells = bands.map((b) => {
    const label = cleanCellText(cellText(lines, { x0: columns.divider, y0: b.y0, x1: columns.labelX1 + PAD, y1: b.y1 }, false)).join(" ");
    const key = fieldOf(label);
    const gaps = !!key && GAP_FIELDS.has(key);
    const value = cleanCellText(cellText(lines, { x0: columns.valueX0 - PAD, y0: b.y0, x1: columns.divider, y1: b.y1 }, gaps)).join("\n");
    return { label, value };
  });
  return { cells: cells.filter((c) => c.label || c.value), rules, columns };
}

/** تجزیه یک فایل PDF روی دیسک → ساختار نوع دادخواست به‌همراه خانه‌های خام (برای گزارش ورود) */
export async function parseFormFile(pdf: string): Promise<{ parsed: ParsedForm; cells: Cell[] }> {
  const { cells } = await extractFormCells(pdf);
  return { parsed: parseForm(cells), cells };
}

export const formCode = (sha: string): string => `FK-${sha.slice(0, CODE_CHARS).toUpperCase()}`;
export const formFileKey = (sha: string): string => `petitions/forms/${sha.slice(0, KEY_CHARS)}.pdf`;

/** داده ستون‌های PetitionType از فرم تجزیه‌شده */
export function petitionTypeData(parsed: ParsedForm): Omit<Prisma.PetitionTypeUncheckedCreateInput, "code" | "source" | "status"> {
  return {
    title: parsed.title, kind: "INITIAL", category: parsed.category, court: parsed.court, courtBasis: parsed.courtBasis,
    eligible: parsed.eligible, defendant: parsed.defendant, valueType: parsed.valueType,
    valueOptions: parsed.valueOptions as unknown as Prisma.InputJsonValue,
    evidence: parsed.evidence.map((e) => e.label), requirements: parsed.evidence as unknown as Prisma.InputJsonValue,
    evidenceInfo: parsed.evidenceInfo, fees: parsed.fees, investigations: parsed.investigations, ancillary: parsed.ancillary,
    bodyTemplate: parsed.bodyTemplate, blanks: parsed.blanks as unknown as Prisma.InputJsonValue,
    optionalClauses: parsed.optionalClauses as unknown as Prisma.InputJsonValue, notes: parsed.notes,
    rules: parsed.rules as unknown as Prisma.InputJsonValue, formCode: parsed.formCode, keywords: parsed.keywords,
  };
}

/** ورود فرم بارگذاری‌شده توسط کاربر مجاز: پیش‌نویس نوع دادخواست (تکرار همان فایل، همان رکورد را برمی‌گرداند) */
export async function importPetitionForm(input: { data: Buffer; fileName: string }, user: SessionUser): Promise<{ id: string; existed: boolean; warnings: string[] }> {
  assertCan(user, "petition.manage");
  const { mime } = validateUpload(input.fileName, input.data);
  if (mime !== "application/pdf") throw new AppError("فقط فایل PDF فرم دادخواست قابل ورود است.");
  const sha = sha256(input.data);
  const existing = await db.petitionType.findFirst({ where: { sourceSha256: sha }, select: { id: true } });
  if (existing) return { id: existing.id, existed: true, warnings: [] };
  const dir = await mkdtemp(path.join(tmpdir(), "petition-form-"));
  const file = path.join(dir, "form.pdf");
  try {
    await writeFile(file, input.data);
    const { parsed, cells } = await parseFormFile(file);
    const key = formFileKey(sha);
    if (!(await storage.exists(key))) await storage.put(key, input.data);
    const created = await db.petitionType.create({
      data: {
        ...petitionTypeData(parsed), code: formCode(sha), source: "FORM", sourceLabel: "فرم واردشده توسط کاربر", status: "DRAFT",
        sourceFileKey: key, sourceFileName: input.fileName, sourceSha256: sha, createdById: user.id,
        importReport: { warnings: parsed.warnings, cells, extra: parsed.extra } as unknown as Prisma.InputJsonValue,
      },
    });
    await audit({ actorId: user.id, action: "petition_type.imported", entityType: "PetitionType", entityId: created.id, entityLabel: created.title, meta: { warnings: parsed.warnings.length } });
    return { id: created.id, existed: false, warnings: parsed.warnings };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
