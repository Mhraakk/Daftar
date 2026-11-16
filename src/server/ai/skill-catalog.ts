// کتابخانه مهارت‌های حقوقی: متن SKILL.md دو مخزن متن‌باز (anthropics/claude-for-legal با مجوز Apache-2.0 و
// evolsb/claude-legal-skill با مجوز MIT) در vendor/legal-skills نگهداری و بدون تغییر به مدل داده می‌شود.
// این ماژول فهرست مهارت‌ها را از فایل‌ها می‌خواند، اثر انگشت SHA-256 هر فایل را ثبت و حالت اجرای درون‌برنامه را تعیین می‌کند.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";

export const VENDOR_DIR = path.join(process.cwd(), "vendor", "legal-skills");
const FOR_LEGAL_DIR = "claude-for-legal";
const EVOLSB_PLUGIN = "claude-legal-skill";

export type SkillMode = "RUN" | "REFERENCE" | "AGENT_ONLY";

export interface ParsedSkill {
  slug: string;
  plugin: string;
  name: string;
  description: string;
  argumentHint: string | null;
  version: string | null;
  userInvocable: boolean;
  relPath: string;
  sha256: string;
  sizeBytes: number;
  license: string;
  origin: string;
}

interface SourceInfo { id: string; repo: string; commit: string; license: string }

/** مهارت‌هایی که به فایل‌های تنظیمات Claude Code، دفترچه‌های ماندگار روی دیسک یا اتصال‌های بیرونی وابسته‌اند */
const AGENT_ONLY_NAMES = new Set([
  "cold-start-interview", "customize", "matter-workspace", "review-proposals",
  "renewal-tracker", "leave-tracker", "log-leave", "investigation-open", "investigation-add", "investigation-query",
  "investigation-summary", "investigation-memo", "expansion-kickoff", "expansion-update", "policy-monitor", "reg-feed-watcher",
  "portfolio-status", "oc-status", "gaps", "comments", "deadlines", "semester-handoff", "supervisor-review-queue", "ramp",
  "session", "ai-inventory", "portfolio", "entity-compliance", "integration-management", "ai-tool-handoff",
  "matter-update", "matter-close", "build-guide",
]);
const AGENT_ONLY_PLUGINS = new Set(["legal-builder-hub", "cocounsel-legal"]);
const CASE_REQUIRED_PLUGINS = new Set(["litigation-legal"]);

export const PLUGIN_LABELS: Record<string, string> = {
  [EVOLSB_PLUGIN]: "بررسی قرارداد",
  "commercial-legal": "قراردادهای تجاری",
  "litigation-legal": "دعاوی و دادرسی",
  "corporate-legal": "حقوق شرکت‌ها و معاملات",
  "employment-legal": "حقوق کار و استخدام",
  "ip-legal": "مالکیت فکری",
  "privacy-legal": "حریم خصوصی و داده",
  "product-legal": "حقوق محصول",
  "regulatory-legal": "مقررات و انطباق",
  "ai-governance-legal": "حاکمیت هوش مصنوعی",
  "law-student": "آموزش حقوق",
  "legal-clinic": "کلینیک حقوقی",
  "legal-builder-hub": "ساخت مهارت (Claude Code)",
  "cocounsel-legal": "CoCounsel",
};

/** عنوان فارسی مهارت‌ها (کلید: plugin.name) */
export const SKILL_TITLES_FA: Record<string, string> = {
  [`${EVOLSB_PLUGIN}.contract-review`]: "بررسی ریسک قرارداد و پیشنهاد اصلاح",
  "commercial-legal.amendment-history": "تاریخچه اصلاحیه‌های قرارداد",
  "commercial-legal.escalation-flagger": "ارجاع موضوع قراردادی به مرجع تأیید",
  "commercial-legal.nda-review": "غربال قرارداد عدم افشا (NDA)",
  "commercial-legal.review": "بررسی قرارداد تجاری بر اساس دستورالعمل",
  "commercial-legal.saas-msa-review": "بررسی قرارداد اشتراک نرم‌افزار (SaaS)",
  "commercial-legal.stakeholder-summary": "خلاصه قرارداد برای ذی‌نفعان",
  "commercial-legal.vendor-agreement-review": "بررسی قرارداد تأمین‌کننده",
  "corporate-legal.board-minutes": "صورت‌جلسه هیئت‌مدیره",
  "corporate-legal.closing-checklist": "فهرست اقدامات انعقاد معامله",
  "corporate-legal.deal-team-summary": "خلاصه برای تیم معامله",
  "corporate-legal.diligence-issue-extraction": "استخراج ایرادهای بررسی حقوقی معامله",
  "corporate-legal.material-contract-schedule": "جدول قراردادهای مهم",
  "corporate-legal.tabular-review": "بررسی جدولی مجموعه اسناد",
  "corporate-legal.written-consent": "تصمیم کتبی مدیران یا سهامداران",
  "employment-legal.handbook-updates": "اصلاح آیین‌نامه کارکنان",
  "employment-legal.hiring-review": "بررسی حقوقی فرایند استخدام",
  "employment-legal.internal-investigation": "بازرسی داخلی شکایت کارکنان",
  "employment-legal.international-expansion": "استخدام در کشور دیگر",
  "employment-legal.policy-drafting": "تدوین سیاست کارکنان",
  "employment-legal.termination-review": "بررسی خاتمه رابطه کار",
  "employment-legal.wage-hour-qa": "پرسش‌های دستمزد و ساعت کار",
  "employment-legal.worker-classification": "تشخیص نوع رابطه کاری",
  "ip-legal.cease-desist": "اخطاریه توقف نقض حق",
  "ip-legal.clearance": "بررسی پیشینه علامت تجاری",
  "ip-legal.fto-triage": "غربال آزادی عمل (FTO)",
  "ip-legal.infringement-triage": "غربال ادعای نقض",
  "ip-legal.invention-intake": "ثبت اولیه اختراع",
  "ip-legal.ip-clause-review": "بررسی شرط‌های مالکیت فکری قرارداد",
  "ip-legal.oss-review": "بررسی مجوزهای متن‌باز",
  "ip-legal.takedown": "درخواست حذف محتوای ناقض",
  "law-student.bar-prep-questions": "پرسش‌های آمادگی آزمون",
  "law-student.case-brief": "خلاصه‌نویسی رأی",
  "law-student.cold-call-prep": "آمادگی پرسش کلاسی",
  "law-student.exam-forecast": "پیش‌بینی پرسش‌های امتحان",
  "law-student.flashcards": "کارت‌های مرور",
  "law-student.irac-practice": "تمرین تحلیل IRAC",
  "law-student.legal-writing": "نگارش حقوقی",
  "law-student.outline-builder": "طرح‌واره درس",
  "law-student.socratic-drill": "تمرین پرسش و پاسخ سقراطی",
  "law-student.study-plan": "برنامه مطالعه",
  "legal-clinic.client-comms-log": "ثبت ارتباط با موکل",
  "legal-clinic.client-intake": "پذیرش و مصاحبه اولیه موکل",
  "legal-clinic.client-letter": "نامه به موکل",
  "legal-clinic.draft": "پیش‌نویس سند حقوقی",
  "legal-clinic.form-generation": "تکمیل فرم‌ها",
  "legal-clinic.memo": "یادداشت حقوقی (Memo)",
  "legal-clinic.plain-language-letters": "نامه به زبان ساده",
  "legal-clinic.research-start": "آغاز پژوهش حقوقی",
  "legal-clinic.status": "گزارش وضعیت پرونده برای مخاطب",
  "litigation-legal.brief-section-drafter": "نگارش بخشی از لایحه",
  "litigation-legal.chronology": "گاه‌شمار وقایع پرونده",
  "litigation-legal.claim-chart": "جدول تطبیق ادعا",
  "litigation-legal.demand-draft": "پیش‌نویس مطالبه‌نامه (اظهارنامه)",
  "litigation-legal.demand-intake": "ثبت اولیه مطالبه",
  "litigation-legal.demand-received": "بررسی مطالبه‌نامه دریافتی",
  "litigation-legal.deposition-prep": "آمادگی جلسه استماع شهادت",
  "litigation-legal.legal-hold": "دستور حفظ ادله",
  "litigation-legal.matter-briefing": "گزارش خلاصه پرونده",
  "litigation-legal.matter-intake": "پذیرش پرونده دعوی",
  "litigation-legal.privilege-log-review": "بررسی فهرست اسناد مشمول امتیاز (Privilege Log)",
  "litigation-legal.subpoena-triage": "غربال احضاریه و درخواست ارائه مدرک",
  "privacy-legal.dpa-review": "بررسی قرارداد پردازش داده",
  "privacy-legal.dsar-response": "پاسخ به درخواست دسترسی به داده",
  "privacy-legal.pia-generation": "ارزیابی اثر حریم خصوصی",
  "privacy-legal.reg-gap-analysis": "تحلیل شکاف مقررات حریم خصوصی",
  "privacy-legal.use-case-triage": "غربالگری کاربرد داده",
  "product-legal.feature-risk-assessment": "ارزیابی ریسک قابلیت محصول",
  "product-legal.is-this-a-problem": "آیا این موضوع مشکل حقوقی دارد؟",
  "product-legal.launch-review": "بررسی حقوقی عرضه محصول",
  "product-legal.marketing-claims-review": "بررسی ادعاهای تبلیغاتی",
  "regulatory-legal.gap-surfacer": "یافتن شکاف‌های مقرراتی",
  "regulatory-legal.policy-diff": "مقایسه نسخه‌های سیاست یا مقررات",
  "regulatory-legal.policy-redraft": "بازنویسی سیاست",
  "ai-governance-legal.aia-generation": "ارزیابی اثر الگوریتمی",
  "ai-governance-legal.policy-starter": "پیش‌نویس سیاست استفاده از هوش مصنوعی",
  "ai-governance-legal.reg-gap-analysis": "تحلیل شکاف مقررات هوش مصنوعی",
  "ai-governance-legal.use-case-triage": "غربالگری کاربرد هوش مصنوعی",
  "ai-governance-legal.vendor-ai-review": "بررسی هوش مصنوعی تأمین‌کننده",
};

/** مهارت‌های پیشنهادی برای کار روزمره دفتر خدمات قضایی */
export const FEATURED_SKILLS = new Set([
  `${EVOLSB_PLUGIN}.contract-review`, "litigation-legal.chronology", "litigation-legal.matter-briefing", "litigation-legal.demand-draft",
  "litigation-legal.demand-received", "legal-clinic.client-intake", "legal-clinic.client-letter", "legal-clinic.memo",
  "legal-clinic.status", "legal-clinic.plain-language-letters", "law-student.case-brief", "commercial-legal.nda-review",
  "commercial-legal.amendment-history", "litigation-legal.privilege-log-review",
]);

/** مهارت‌هایی که روی متن قرارداد کار می‌کنند و فهرست بررسی پیش از تحلیل برایشان محاسبه می‌شود */
export const CONTRACT_SKILLS = new Set([
  `${EVOLSB_PLUGIN}.contract-review`, "commercial-legal.review", "commercial-legal.nda-review", "commercial-legal.saas-msa-review",
  "commercial-legal.vendor-agreement-review", "commercial-legal.amendment-history", "commercial-legal.stakeholder-summary",
  "ip-legal.ip-clause-review", "privacy-legal.dpa-review", "ai-governance-legal.vendor-ai-review",
]);

// ───────── خواندن frontmatter (زیرمجموعه YAML به‌کاررفته در SKILL.md) ─────────

const FRONTMATTER_FENCE = "---";
/** شمار خط‌های حصار frontmatter پیش از بدنه (خط نخست و خط پایانی «---») */
const FENCE_LINES = 2;
const COMMIT_SHORT = 12;
const BLOCK_SCALARS = new Set([">", ">-", "|", "|-"]);

const unquote = (v: string): string => {
  const t = v.trim();
  const quoted = t.length > 1 && ((t.startsWith("\"") && t.endsWith("\"")) || (t.startsWith("'") && t.endsWith("'")));
  return quoted ? t.slice(1, -1) : t;
};

interface FmState { out: Record<string, string>; key: string | null; folded: boolean; block: string[] }

const closeBlock = (s: FmState): FmState =>
  s.key && s.block.length ? { ...s, out: { ...s.out, [s.key]: s.block.join(s.folded ? " " : "\n").trim() }, key: null, block: [] } : { ...s, key: null, block: [] };

/** frontmatter میان دو خط «---» در ابتدای فایل؛ پشتیبانی از مقدار ساده، نقل‌قول‌دار و بلوک «>» و «|» */
export function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const lines = text.split("\r\n").join("\n").split("\n");
  if (lines[0]?.trim() !== FRONTMATTER_FENCE) return { data: {}, body: text };
  const end = lines.slice(1).findIndex((l) => l.trim() === FRONTMATTER_FENCE);
  if (end < 0) return { data: {}, body: text };
  const fm = lines.slice(1, end + 1);
  const final = fm.reduce<FmState>((s, line) => {
    const indented = line.startsWith(" ") || line.startsWith("\t");
    if (s.key && (indented || line.trim() === "")) return { ...s, block: line.trim() ? [...s.block, line.trim()] : s.block };
    const base = closeBlock(s);
    const colon = line.indexOf(":");
    if (colon <= 0) return base;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (BLOCK_SCALARS.has(value)) return { ...base, key, folded: value.startsWith(">"), block: [] };
    return { ...base, out: { ...base.out, [key]: unquote(value) } };
  }, { out: {}, key: null, folded: true, block: [] });
  return { data: closeBlock(final).out, body: lines.slice(end + FENCE_LINES).join("\n") };
}

// ───────── پیمایش پوشه‌ها ─────────

const sha256 = (buf: Buffer): string => createHash("sha256").update(buf).digest("hex");
const listDirs = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];

function readSources(): Record<string, SourceInfo> {
  const file = path.join(VENDOR_DIR, "SOURCES.json");
  if (!existsSync(file)) return {};
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { sources?: SourceInfo[] };
  return Object.fromEntries((parsed.sources ?? []).map((s) => [s.id, s]));
}

function parseSkillFile(abs: string, plugin: string, source: SourceInfo | undefined, license: string): ParsedSkill | null {
  if (!existsSync(abs)) return null;
  const buf = readFileSync(abs);
  const { data } = parseFrontmatter(buf.toString("utf8"));
  const name = (data.name ?? path.basename(path.dirname(abs))).trim();
  const shortName = name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
  const rel = path.relative(VENDOR_DIR, abs).split(path.sep).join("/");
  return {
    slug: `${plugin}.${shortName}`,
    plugin,
    name: shortName,
    description: (data.description ?? "").trim(),
    argumentHint: data["argument-hint"]?.trim() || null,
    version: data.version?.trim() || null,
    userInvocable: data["user-invocable"]?.trim() !== "false",
    relPath: rel,
    sha256: sha256(buf),
    sizeBytes: buf.length,
    license,
    origin: source ? `${source.repo}@${source.commit.slice(0, COMMIT_SHORT)}/${rel}` : rel,
  };
}

/** همه مهارت‌های موجود در vendor/legal-skills */
export function scanVendoredSkills(): ParsedSkill[] {
  const sources = readSources();
  const evolsb = parseSkillFile(path.join(VENDOR_DIR, "contract-review", "SKILL.md"), EVOLSB_PLUGIN, sources["contract-review"], "MIT");
  const base = path.join(VENDOR_DIR, FOR_LEGAL_DIR);
  const forLegal = listDirs(base).flatMap((plugin) =>
    listDirs(path.join(base, plugin, "skills")).map((skill) =>
      parseSkillFile(path.join(base, plugin, "skills", skill, "SKILL.md"), plugin, sources["claude-for-legal"], "Apache-2.0")));
  return [evolsb, ...forLegal].filter((s): s is ParsedSkill => !!s);
}

export function modeOf(s: Pick<ParsedSkill, "plugin" | "name" | "userInvocable">): SkillMode {
  if (AGENT_ONLY_PLUGINS.has(s.plugin) || AGENT_ONLY_NAMES.has(s.name)) return "AGENT_ONLY";
  return s.userInvocable ? "RUN" : "REFERENCE";
}

/** همگام‌سازی جدول LegalSkill با فایل‌ها؛ مهارت حذف‌شده غیرفعال می‌شود (سابقه اجرا حفظ می‌شود) */
export async function syncSkills(): Promise<{ total: number; created: number; updated: number; disabled: number }> {
  const parsed = scanVendoredSkills();
  const existing = await db.legalSkill.findMany({ select: { slug: true, sha256: true, enabled: true } });
  const bySlug = new Map(existing.map((e) => [e.slug, e]));
  const now = new Date();
  const results = await Promise.all(parsed.map(async (s) => {
    const mode = modeOf(s);
    const data = {
      plugin: s.plugin, name: s.name, description: s.description, argumentHint: s.argumentHint, origin: s.origin, license: s.license,
      sha256: s.sha256, path: s.relPath, mode, version: s.version, sizeBytes: s.sizeBytes, category: PLUGIN_LABELS[s.plugin] ?? s.plugin,
      requiresCase: CASE_REQUIRED_PLUGINS.has(s.plugin), titleFa: SKILL_TITLES_FA[s.slug] ?? null, syncedAt: now,
    };
    const prev = bySlug.get(s.slug);
    await db.legalSkill.upsert({ where: { slug: s.slug }, create: { slug: s.slug, enabled: true, ...data }, update: data });
    if (!prev) return "created";
    return prev.sha256 === s.sha256 ? "same" : "updated";
  }));
  const present = new Set(parsed.map((s) => s.slug));
  const gone = existing.filter((e) => !present.has(e.slug) && e.enabled).map((e) => e.slug);
  if (gone.length) await db.legalSkill.updateMany({ where: { slug: { in: gone } }, data: { enabled: false } });
  return {
    total: parsed.length,
    created: results.filter((r) => r === "created").length,
    updated: results.filter((r) => r === "updated").length,
    disabled: gone.length,
  };
}

/** متن کامل SKILL.md از دیسک، با بررسی اینکه با اثر انگشت ثبت‌شده یکی باشد */
export function readSkillText(skill: { path: string; sha256: string; slug: string }): string {
  const abs = path.join(VENDOR_DIR, skill.path);
  if (!skill.path || !abs.startsWith(VENDOR_DIR) || !existsSync(abs)) throw new Error(`فایل مهارت ${skill.slug} یافت نشد.`);
  const buf = readFileSync(abs);
  if (sha256(buf) !== skill.sha256) throw new Error(`متن مهارت ${skill.slug} با نسخه ثبت‌شده یکی نیست؛ «همگام‌سازی مهارت‌ها» را اجرا کنید.`);
  return buf.toString("utf8");
}

/** فایل‌های پشتیبان کنار SKILL.md (مانند references/*.md) که متن مهارت به آن‌ها ارجاع می‌دهد */
export function skillReferenceFiles(skill: { path: string }): { name: string; text: string }[] {
  const dir = path.join(VENDOR_DIR, path.dirname(skill.path), "references");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => ({ name: `references/${f}`, text: readFileSync(path.join(dir, f), "utf8") }));
}
