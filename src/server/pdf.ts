// تولید PDF با موتور Chromium (شکل‌دهی صحیح حروف فارسی، RTL و صفحه‌بندی A4). فونت وزیرمتن درون‌سازی می‌شود تا بدون اینترنت کار کند.
import { promises as fs } from "node:fs";
import path from "node:path";
import { AppError } from "@/lib/errors";

let fontCss: string | null = null;
async function fonts(): Promise<string> {
  if (fontCss) return fontCss;
  const dir = path.join(process.cwd(), "src/assets/fonts");
  const [r, b] = await Promise.all([fs.readFile(path.join(dir, "Vazirmatn-Regular.ttf")), fs.readFile(path.join(dir, "Vazirmatn-Bold.ttf"))]);
  fontCss = `@font-face{font-family:Vazirmatn;font-weight:400;src:url(data:font/ttf;base64,${r.toString("base64")}) format("truetype")}
@font-face{font-family:Vazirmatn;font-weight:700;src:url(data:font/ttf;base64,${b.toString("base64")}) format("truetype")}`;
  return fontCss;
}

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const BASE_CSS = `
*{box-sizing:border-box} html{direction:rtl}
body{font-family:Vazirmatn,Tahoma,sans-serif;font-size:11.5pt;line-height:2;color:#18222b;margin:0;font-feature-settings:"ss01"}
h1{font-size:15pt;text-align:center;margin:0 0 10pt} h2{font-size:12.5pt;margin:12pt 0 4pt} h3{font-size:11.5pt;margin:10pt 0 2pt}
p{margin:4pt 0;text-align:justify} ol,ul{margin:4pt 0;padding-inline-start:22pt} ol{list-style-type:persian}
table{width:100%;border-collapse:collapse;margin:6pt 0;page-break-inside:auto} tr{page-break-inside:avoid}
th,td{border:.6pt solid #8b939a;padding:3pt 6pt;vertical-align:top;text-align:right} th{background:#f1eee6;font-weight:700}
blockquote{margin:6pt 0;padding:2pt 10pt;border-inline-start:2.5pt solid #0d7a78;background:#f3faf9}
hr{border:0;border-top:.6pt solid #8b939a;margin:10pt 0}
.ltr{direction:ltr;unicode-bidi:isolate;display:inline-block} .muted{color:#5b6670} .small{font-size:9pt}
.report th,.report td{font-size:9.5pt;line-height:1.7}
.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.2pt double #18222b;padding-bottom:6pt;margin-bottom:12pt}
`;

export interface PdfOptions { title: string; bodyHtml: string; headerNote?: string; footerNote?: string; landscape?: boolean; extraCss?: string; margins?: { top: string; bottom: string; side: string } }

export async function htmlToPdf(o: PdfOptions): Promise<Buffer> {
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(o.title)}</title><style>${await fonts()}${BASE_CSS}${o.extraCss ?? ""}</style></head><body>${o.bodyHtml}</body></html>`;
  let chromium: typeof import("playwright-core").chromium;
  try { ({ chromium } = await import("playwright-core")); } catch { throw new AppError("موتور تولید PDF نصب نیست.", "PDF_UNAVAILABLE", 503); }
  const candidates = [process.env.CHROMIUM_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/opt/pw-browsers/chromium"].filter(Boolean) as string[];
  let executablePath: string | undefined;
  for (const c of candidates) {
    const st = await fs.stat(c).catch(() => null);
    if (st?.isFile()) { executablePath = c; break; }
    if (st?.isDirectory()) { // پوشه مرورگر Playwright
      const hit = (await fs.readdir(c).catch(() => [])).find((x) => x.startsWith("chrome"));
      const bin = hit && path.join(c, hit, "chrome");
      if (bin && (await fs.stat(bin).catch(() => null))?.isFile()) { executablePath = bin; break; }
    }
  }
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"] }).catch((e) => {
    console.error("[pdf] chromium launch failed", e);
    throw new AppError("موتور تولید PDF (Chromium) روی سرور در دسترس نیست. متغیر CHROMIUM_PATH را بررسی کنید.", "PDF_UNAVAILABLE", 503);
  });
  try {
    const page = await browser.newPage({ javaScriptEnabled: false });
    // محتوای سند هرگز به شبکه دسترسی ندارد
    await page.route("**/*", (r) => (r.request().url().startsWith("data:") || r.request().url() === "about:blank" ? r.continue() : r.abort()));
    await page.setContent(html, { waitUntil: "load" });
    const m = o.margins ?? { top: "22mm", bottom: "20mm", side: "20mm" };
    const foot = `<div style="width:100%;font-family:Vazirmatn,Tahoma;font-size:8pt;color:#5b6670;padding:0 14mm;display:flex;justify-content:space-between;direction:rtl"><span>${esc(o.footerNote ?? "")}</span><span>صفحه <span class="pageNumber"></span> از <span class="totalPages"></span></span></div>`;
    const head = o.headerNote ? `<div style="width:100%;font-family:Vazirmatn,Tahoma;font-size:8pt;color:#5b6670;padding:0 14mm;direction:rtl">${esc(o.headerNote)}</div>` : "<span></span>";
    const pdf = await page.pdf({ format: "A4", landscape: o.landscape, printBackground: true, displayHeaderFooter: true, headerTemplate: head, footerTemplate: foot, margin: { top: m.top, bottom: m.bottom, left: m.side, right: m.side } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
