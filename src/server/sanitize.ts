import sanitizeHtml from "sanitize-html";

/** پاک‌سازی HTML اسناد حقوقی: فقط ساختار متنی مجاز است (بدون اسکریپت، پیوند، تصویر بیرونی یا رویداد). */
export function sanitizeLegalHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["h1", "h2", "h3", "p", "br", "strong", "b", "em", "i", "u", "s", "ol", "ul", "li", "table", "thead", "tbody", "tr", "th", "td", "blockquote", "hr", "span", "colgroup", "col"],
    allowedAttributes: { "*": ["style"], td: ["colspan", "rowspan", "style"], th: ["colspan", "rowspan", "style"] },
    allowedStyles: { "*": { "text-align": [/^(right|left|center|justify)$/], width: [/^\d{1,3}(%|px)$/] } },
    disallowedTagsMode: "discard",
  }).trim();
}
