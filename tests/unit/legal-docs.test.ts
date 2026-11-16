import JSZip from "jszip";
import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { diffBlocks, diffHtml, htmlToBlocks } from "@/lib/diff";
import { extractFields, fillFields, KNOWN_FIELDS } from "@/lib/template-fields";
import { htmlToDocx } from "@/server/draft-export";
import { sanitizeLegalHtml } from "@/server/sanitize";

describe("فیلدهای قالب", () => {
  const tpl = "<p>{{client.displayName}} فرزند {{ client.fatherName }} — خواسته: {{خواسته و بهای آن}} — {{client.displayName}}</p>";
  it("استخراج یکتا و بدون فاصله‌های اضافه", () => {
    expect(extractFields(tpl)).toEqual(["client.displayName", "client.fatherName", "خواسته و بهای آن"]);
    expect(KNOWN_FIELDS["client.displayName"]).toBeDefined();
  });
  it("پرکردن، escape مقادیر و حفظ فیلدهای خالی", () => {
    const out = fillFields(tpl, { "client.displayName": "علی <b>رضایی</b>", "خواسته و بهای آن": "مطالبه وجه\nبه مبلغ ۱۰۰" });
    expect(out).toContain("علی &lt;b&gt;رضایی&lt;/b&gt;");
    expect(out).toContain("مطالبه وجه<br>به مبلغ ۱۰۰");
    expect(out).toContain("{{ client.fatherName }}");
    expect(extractFields(out)).toEqual(["client.fatherName"]);
  });
});

describe("مقایسه نسخه‌ها", () => {
  it("تبدیل HTML به بندها", () => {
    expect(htmlToBlocks("<h1>عنوان</h1><p>بند &amp; یک</p><ul><li>الف</li><li>ب</li></ul><table><tr><td>۱</td><td>۲</td></tr></table>")).toEqual(["عنوان", "بند & یک", "الف", "ب", "۱ | ۲ |"]);
  });
  it("افزوده و حذف‌شده با LCS", () => {
    expect(diffBlocks(["الف", "ب", "ج"], ["الف", "ج", "د"])).toEqual([{ type: "same", text: "الف" }, { type: "del", text: "ب" }, { type: "same", text: "ج" }, { type: "add", text: "د" }]);
    expect(diffHtml("<p>یک</p>", "<p>یک</p>").every((l) => l.type === "same")).toBe(true);
  });
});

describe("پاک‌سازی HTML سند", () => {
  it("اسکریپت، رویداد، پیوند و تصویر بیرونی حذف می‌شوند", () => {
    const dirty = `<p onclick="x()" style="text-align: center; color: red">متن<script>alert(1)</script><img src="http://evil/x.png" onerror="y()"><a href="javascript:z()">پیوند</a></p><iframe src="//x"></iframe>`;
    const clean = sanitizeLegalHtml(dirty);
    expect(clean).not.toMatch(/script|onclick|onerror|<img|<a |iframe|javascript|color/);
    expect(clean).toContain('style="text-align:center"');
    expect(clean).toContain("متن");
  });
  it("ساختار جدول و فهرست حفظ می‌شود", () => {
    const html = '<table><tbody><tr><th colspan="2">سر</th></tr><tr><td>۱</td><td>۲</td></tr></tbody></table><ol><li>یک</li></ol>';
    expect(sanitizeLegalHtml(html)).toBe(html);
  });
});

describe("خروجی Word", () => {
  const html = `<h1>دادخواست</h1><p style="text-align:justify">با سلام، <strong>خواهان</strong> اعلام می‌دارد (Bank Melli).</p>
    <ol><li>بند نخست<ul><li>زیربند</li></ul></li><li>بند دوم</li></ol><table><tbody><tr><th>خواهان</th><th>خوانده</th></tr><tr><td>علی</td><td>شرکت نمونه</td></tr></tbody></table><blockquote><p>نقل قول</p></blockquote><hr>`;
  it("فایل معتبر، راست‌به‌چپ و با فونت وزیرمتن", async () => {
    const buf = await htmlToDocx(html, { title: "آزمون", footer: "دفتر · L-1" });
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("<w:bidi/>");
    expect(xml).toContain("<w:rtl/>");
    expect(await zip.file("word/styles.xml")!.async("string")).toContain("Vazirmatn");
    expect(await zip.file("word/numbering.xml")!.async("string")).toContain("%1-");
    expect(xml).toContain('w:w="11906"'); // A4
  });
  it("بازخوانی با mammoth: عنوان، فهرست، جدول و متن پررنگ", async () => {
    const back = (await mammoth.convertToHtml({ buffer: await htmlToDocx(html, { title: "آزمون", footer: "x" }) })).value;
    expect(back).toMatch(/<h1>دادخواست<\/h1>/);
    expect(back).toMatch(/<strong>خواهان<\/strong>/);
    expect(back).toMatch(/<ol><li>بند نخست/);
    expect(back).toContain("بند دوم");
    expect(back).toMatch(/<table>[\s\S]*شرکت نمونه[\s\S]*<\/table>/);
    expect(back).toContain("نقل قول");
  });
  it("متن خالی هم فایل معتبر می‌سازد", async () => {
    expect((await htmlToDocx("", { title: "x", footer: "x" })).subarray(0, 2).toString()).toBe("PK");
  });
});
