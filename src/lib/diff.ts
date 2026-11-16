// مقایسه دو نسخه سند در سطح پاراگراف (LCS)
export interface DiffLine { type: "same" | "add" | "del"; text: string }

export function htmlToBlocks(html: string): string[] {
  return html
    .replace(/<\/(p|h[1-6]|li|tr|blockquote|div)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(td|th)>/gi, " | ")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

export function diffBlocks(a: string[], b: string[]): DiffLine[] {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "same", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ type: "del", text: a[i++] });
    else out.push({ type: "add", text: b[j++] });
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}

export const diffHtml = (oldHtml: string, newHtml: string) => diffBlocks(htmlToBlocks(oldHtml), htmlToBlocks(newHtml));
