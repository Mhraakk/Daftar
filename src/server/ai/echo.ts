// تشخیص تکرار دستورالعمل در پاسخ مدل. مدل کوچک گاهی به‌جای انجام کار، متن مهارت را بازمی‌گرداند (در آزمون زنده با
// Qwen2.5-1.5B روی مهارت بررسی قرارداد رخ داد: فهرست‌های بررسی و نمونه «Acme Software Inc.» خود مهارت). سهم سطرهای
// معنادار پاسخ که عیناً در دستورالعمل آمده‌اند سنجیده می‌شود تا بازبین پیش از خواندن هشدار ببیند.

/** سطر کوتاه‌تر از این (پس از پاک‌سازی) سنجیده نمی‌شود؛ سطرهای کوتاه مانند «ریسک» در هر متنی پیدا می‌شوند */
const MIN_LINE = 12;
/** از این سهم به بالا، پاسخ «تکرار دستورالعمل» شمرده و هشدار داده می‌شود */
export const ECHO_WARN = 0.5;

// Markdown decoration and table pipes removed before comparing: matches "### ", "| ", "**" and "- "; rejects "ماده ۶".
// https://regex101.com/?regex=%5B%23*%7C%3E%60_-%5D%2B&testString=%23%23%23%20%7C%20Direction%20%7C&flavor=javascript&flags=g
const DECOR = /[#*|>`_-]+/g;
// Runs of whitespace (line breaks included): matches " \n  ", rejects "a".
// https://regex101.com/?regex=%5Cs%2B&testString=a%20%0A%20%20b&flavor=javascript&flags=g
const SPACES = /\s+/g;
const clean = (text: string): string => text.replace(DECOR, " ").replace(SPACES, " ").trim().toLowerCase();

/** سهم (۰ تا ۱) سطرهای معنادار پاسخ که عیناً در دستورالعمل هستند؛ پاسخ بی‌سطر معنادار ۰ است */
export function echoRatio(output: string, instructions: string): number {
  const source = clean(instructions);
  const lines = output.split("\n").map(clean).filter((l) => l.length >= MIN_LINE);
  return lines.length ? lines.filter((l) => source.includes(l)).length / lines.length : 0;
}
