// فیلدهای پویای قالب‌ها: «{{client.displayName}}» و فیلدهای آزاد مانند «{{خواسته و بهای آن}}»

export const KNOWN_FIELDS: Record<string, string> = {
  "client.displayName": "نام مراجعه‌کننده", "client.nationalId": "کد/شناسه ملی مراجعه‌کننده", "client.fatherName": "نام پدر مراجعه‌کننده",
  "client.address": "نشانی مراجعه‌کننده", "client.mobile": "تلفن همراه مراجعه‌کننده", "client.postalCode": "کد پستی مراجعه‌کننده",
  "case.number": "شماره پرونده (دفتر)", "case.title": "عنوان پرونده", "case.courtName": "مرجع قضایی", "case.courtBranch": "شعبه",
  "case.courtCaseNumber": "کلاسه پرونده قضایی", "case.archiveNumber": "شماره بایگانی شعبه",
  "opponent.name": "نام طرف مقابل", "opponent.nationalId": "کد ملی طرف مقابل", "opponent.address": "نشانی طرف مقابل", "opponent.phone": "تلفن طرف مقابل",
  "office.name": "نام دفتر", "office.address": "نشانی دفتر", "office.phone": "تلفن دفتر", "user.fullName": "نام تنظیم‌کننده", today: "تاریخ امروز",
};

const RE = /\{\{\s*([^{}<>]+?)\s*\}\}/g;

export function extractFields(html: string): string[] {
  return [...new Set([...html.matchAll(RE)].map((m) => m[1].trim()))];
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** جای‌گذاری مقادیر؛ فیلدهای بدون مقدار دست‌نخورده می‌مانند تا در ویرایشگر مشخص باشند. */
export function fillFields(html: string, values: Record<string, string | null | undefined>): string {
  return html.replace(RE, (whole, raw: string) => {
    const v = values[raw.trim()];
    return v && v.trim() ? escapeHtml(v.trim()).replace(/\n/g, "<br>") : whole;
  });
}

export function unfilledFields(html: string): string[] {
  return extractFields(html);
}
