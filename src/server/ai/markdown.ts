// نمایش امن خروجی Markdown مدل: تبدیل با marked و پاک‌سازی سخت‌گیرانه (بدون اسکریپت، پیوند فعال، تصویر یا رویداد).
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const DISPLAY_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "strong", "b", "em", "i", "u", "s", "del", "ol", "ul", "li",
  "table", "thead", "tbody", "tr", "th", "td", "blockquote", "hr", "code", "pre", "span",
];

/** Markdown → HTML پاک‌سازی‌شده برای نمایش در صفحه */
export function renderAiMarkdown(md: string): string {
  const html = marked.parse(md, { async: false, gfm: true, breaks: false });
  return sanitizeHtml(html, {
    allowedTags: DISPLAY_TAGS,
    allowedAttributes: { td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
    disallowedTagsMode: "discard",
  }).trim();
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
