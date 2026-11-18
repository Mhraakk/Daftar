// نمایش امن خروجی Markdown مدل: تبدیل با marked و پاک‌سازی سخت‌گیرانه (بدون اسکریپت، پیوند فعال، تصویر یا رویداد).
import { marked } from "marked";
import { parse as parseHtml } from "node-html-parser";
import sanitizeHtml from "sanitize-html";

const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote";
// Latin letters: matches "M" and "e" in "Mehلت"; rejects "م".
// https://regex101.com/?regex=%5BA-Za-z%5D&testString=Meh%D9%84%D8%AA&flavor=javascript&flags=g
const LATIN_LETTERS = /[A-Za-z]/g;
// Arabic-script (Persian) letters: matches "ل" and "ت" in "Mehلت"; rejects "e".
// https://regex101.com/?regex=%5B%5Cu0600-%5Cu06FF%5D&testString=Meh%D9%84%D8%AA&flavor=javascript&flags=g
const ARABIC_LETTERS = /[\u0600-\u06FF]/g;

/**
 * جهت هر بند از اکثریت حروف آن تعیین می‌شود، نه از نخستین حرف: بند فارسی‌ای که با واژه لاتین (یا واژه درهمِ مدل مانند
 * «Mehلت») آغاز شود راست‌به‌چپ می‌ماند و بند انگلیسی چپ‌به‌راست نمایش داده می‌شود.
 */
function withBlockDirection(html: string): string {
  const root = parseHtml(html);
  root.querySelectorAll(BLOCKS).forEach((el) => {
    const latin = el.text.match(LATIN_LETTERS)?.length ?? 0;
    const arabic = el.text.match(ARABIC_LETTERS)?.length ?? 0;
    el.setAttribute("dir", latin > arabic ? "ltr" : "rtl");
  });
  return root.toString();
}

const DISPLAY_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "strong", "b", "em", "i", "u", "s", "del", "ol", "ul", "li",
  "table", "thead", "tbody", "tr", "th", "td", "blockquote", "hr", "code", "pre", "span",
];

/** Markdown → HTML پاک‌سازی‌شده برای نمایش در صفحه */
export function renderAiMarkdown(md: string): string {
  const html = marked.parse(md, { async: false, gfm: true, breaks: false });
  return withBlockDirection(sanitizeHtml(html, {
    allowedTags: DISPLAY_TAGS,
    allowedAttributes: { td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
    disallowedTagsMode: "discard",
  }).trim());
}

/** Markdown → HTML مناسب ویرایشگر اسناد حقوقی (سرعنوان‌های ریزتر به h3 تبدیل می‌شوند) */
export function aiMarkdownToDraftHtml(md: string): string {
  const html = marked.parse(md, { async: false, gfm: true, breaks: false });
  return sanitizeHtml(html, {
    allowedTags: ["h1", "h2", "h3", "p", "br", "strong", "em", "u", "s", "ol", "ul", "li", "table", "thead", "tbody", "tr", "th", "td", "blockquote", "hr"],
    allowedAttributes: { td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
    transformTags: { h4: "h3", h5: "h3", h6: "h3", b: "strong", i: "em", del: "s", code: "span", pre: "p" },
    disallowedTagsMode: "discard",
  }).trim();
}
