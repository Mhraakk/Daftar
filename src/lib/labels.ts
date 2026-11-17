// برچسب‌های فارسی وضعیت‌ها و انواع (منبع واحد برای رابط کاربری و خروجی‌ها)
export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

export const CASE_STATUS: Record<string, { label: string; tone: Tone }> = {
  INTAKE: { label: "پذیرش اولیه", tone: "neutral" },
  OPEN: { label: "باز", tone: "info" },
  IN_PROGRESS: { label: "در جریان", tone: "accent" },
  WAITING: { label: "در انتظار", tone: "warning" },
  CLOSED: { label: "مختومه", tone: "success" },
  ARCHIVED: { label: "بایگانی", tone: "neutral" },
};
export const PRIORITY: Record<string, { label: string; tone: Tone }> = {
  LOW: { label: "کم", tone: "neutral" },
  NORMAL: { label: "عادی", tone: "info" },
  HIGH: { label: "مهم", tone: "warning" },
  URGENT: { label: "فوری", tone: "danger" },
};
export const TASK_STATUS: Record<string, { label: string; tone: Tone }> = {
  TODO: { label: "در صف", tone: "neutral" },
  IN_PROGRESS: { label: "در حال انجام", tone: "accent" },
  WAITING_REVIEW: { label: "منتظر تأیید", tone: "warning" },
  DONE: { label: "انجام‌شده", tone: "success" },
  REJECTED: { label: "برگشت‌خورده", tone: "danger" },
  CANCELLED: { label: "لغوشده", tone: "neutral" },
};
export const CORR_DIRECTION: Record<string, string> = { INCOMING: "وارده", OUTGOING: "صادره", INTERNAL: "داخلی" };
export const CORR_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "پیش‌نویس", tone: "neutral" },
  REGISTERED: { label: "ثبت‌شده", tone: "info" },
  IN_PROGRESS: { label: "در گردش", tone: "accent" },
  APPROVED: { label: "تأییدشده", tone: "success" },
  REJECTED: { label: "ردشده", tone: "danger" },
  COMPLETED: { label: "اقدام‌شده", tone: "success" },
  ARCHIVED: { label: "بایگانی", tone: "neutral" },
};
export const REFERRAL_ACTION: Record<string, string> = {
  REFER: "ارجاع", FORWARD: "ارسال", RETURN: "بازگشت", APPROVE: "تأیید", REJECT: "رد", COMPLETE: "اتمام اقدام", FOLLOW_UP: "پیگیری",
};
export const REFERRAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "دیده‌نشده", tone: "warning" },
  SEEN: { label: "در دست اقدام", tone: "accent" },
  DONE: { label: "اقدام‌شده", tone: "success" },
  RETURNED: { label: "بازگشتی", tone: "danger" },
};
export const DEADLINE_TYPE: Record<string, string> = {
  FILING: "ثبت/تقدیم سند", PETITION: "تنظیم دادخواست", BRIEF: "لایحه", HEARING: "جلسه رسیدگی", APPEAL: "تجدیدنظر / فرجام",
  OBJECTION: "واخواهی / اعتراض", RESPONSE: "پاسخ به اخطاریه", REVIEW: "بازبینی داخلی", FOLLOW_UP: "پیگیری اداری",
  DOCUMENT: "تکمیل مدارک", OTHER: "سایر",
};
export const DEADLINE_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: "باز", tone: "info" },
  DONE: { label: "انجام‌شده", tone: "success" },
  MISSED: { label: "ازدست‌رفته", tone: "danger" },
  CANCELLED: { label: "لغوشده", tone: "neutral" },
};
export const DEADLINE_SOURCE: Record<string, string> = {
  MANUAL: "ثبت دستی", RULE: "محاسبه از قاعده", EXTRACTED: "استخراج از سند", AI_SUGGESTED: "پیشنهاد هوش مصنوعی",
};
export const EVENT_TYPE: Record<string, { label: string; tone: Tone }> = {
  HEARING: { label: "جلسه دادگاه", tone: "danger" },
  APPOINTMENT: { label: "قرار با مراجعه‌کننده", tone: "accent" },
  MEETING: { label: "جلسه داخلی", tone: "info" },
  FOLLOW_UP: { label: "پیگیری", tone: "warning" },
  OTHER: { label: "سایر", tone: "neutral" },
};
// وضعیت ماده قانون (از راهنمای رنگ PDF منبع یا ثبت دستی)؛ منسوخ برای استناد پیشنهاد نمی‌شود
export const SOURCE_STATUS: Record<string, { label: string; tone: Tone }> = {
  VALID: { label: "معتبر", tone: "success" },
  AMENDED: { label: "اصلاحی/الحاقی", tone: "info" },
  PARTLY_AMENDED: { label: "بخشی اصلاح‌شده", tone: "info" },
  PARTLY_REPEALED: { label: "بخشی منسوخ", tone: "warning" },
  REPEALED: { label: "منسوخ", tone: "danger" },
  INTERPRETATION: { label: "تفسیر", tone: "neutral" },
};
export const CONFIDENTIALITY: Record<string, { label: string; tone: Tone }> = {
  NORMAL: { label: "عادی", tone: "neutral" },
  CONFIDENTIAL: { label: "محرمانه", tone: "warning" },
  RESTRICTED: { label: "خیلی محرمانه", tone: "danger" },
};
export const DRAFT_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "پیش‌نویس", tone: "neutral" },
  IN_REVIEW: { label: "در حال بررسی", tone: "warning" },
  CHANGES_REQUESTED: { label: "نیازمند اصلاح", tone: "danger" },
  APPROVED: { label: "تأییدشده", tone: "success" },
  FINAL: { label: "نهایی", tone: "accent" },
};
export const CASE_CATEGORIES = [
  "حقوقی", "کیفری", "خانواده", "ثبتی", "اجرای احکام", "امور حسبی", "کار و تأمین اجتماعی", "دیوان عدالت اداری", "تجاری", "سایر",
];
export const PARTY_ROLES = ["خواهان", "خوانده", "شاکی", "متهم / مشتکی‌عنه", "وکیل", "نماینده قانونی", "شاهد", "کارشناس", "ثالث", "تجدیدنظرخواه", "تجدیدنظرخوانده", "سایر"];
export const DOCUMENT_CATEGORIES = [
  "مدارک هویتی", "وکالت‌نامه", "دادخواست", "لایحه", "اظهارنامه", "شکواییه", "اخطاریه / ابلاغیه", "رأی / دادنامه", "قرارداد",
  "سند مالکیت", "مستندات و ادله", "مکاتبه", "رسید و فیش", "سایر",
];
export const LEGAL_DOC_TYPES: Record<string, string> = {
  PETITION: "دادخواست", DEFENSE_BRIEF: "لایحه دفاعیه", SUPPLEMENTARY_BRIEF: "لایحه تکمیلی", DECLARATION: "اظهارنامه",
  COMPLAINT: "شکواییه", JUDICIAL_REQUEST: "درخواست قضایی", APPEAL: "دادخواست تجدیدنظر", OBJECTION: "دادخواست واخواهی",
  NOTICE_REPLY: "پاسخ به اخطاریه", ENFORCEMENT: "درخواست اجرایی", LETTER: "مکاتبه اداری و حقوقی", OTHER: "سایر",
};
export const ACTION_LABELS: Record<string, string> = {
  "auth.login": "ورود به سامانه", "auth.logout": "خروج از سامانه", "auth.login_failed": "تلاش ناموفق ورود", "auth.password_changed": "تغییر رمز عبور",
  "user.created": "ایجاد کاربر", "user.updated": "ویرایش کاربر", "user.deactivated": "غیرفعال‌سازی کاربر", "user.activated": "فعال‌سازی کاربر", "user.password_reset": "بازنشانی رمز کاربر",
  "role.updated": "تغییر مجوزهای نقش", "role.created": "ایجاد نقش", "department.created": "ایجاد واحد", "department.updated": "ویرایش واحد",
  "client.created": "ثبت مراجعه‌کننده", "client.updated": "ویرایش مراجعه‌کننده", "client.archived": "بایگانی مراجعه‌کننده", "client.restored": "بازگردانی مراجعه‌کننده",
  "case.created": "ایجاد پرونده", "case.updated": "ویرایش پرونده", "case.status_changed": "تغییر وضعیت پرونده", "case.assigned": "تغییر مسئول پرونده",
  "case.member_added": "افزودن عضو پرونده", "case.member_removed": "حذف عضو پرونده", "case.closed": "بستن پرونده", "case.archived": "بایگانی پرونده", "case.reopened": "بازگشایی پرونده",
  "case.party_added": "افزودن طرف پرونده", "case.party_removed": "حذف طرف پرونده", "note.created": "ثبت یادداشت",
  "document.uploaded": "بارگذاری سند", "document.version_added": "ثبت نسخه جدید سند", "document.updated": "ویرایش مشخصات سند", "document.downloaded": "دریافت سند",
  "document.viewed": "مشاهده سند", "document.deleted": "حذف منطقی سند", "document.restored": "بازیابی سند", "document.access_changed": "تغییر دسترسی سند",
  "correspondence.created": "ثبت مکاتبه", "correspondence.referred": "ارجاع مکاتبه", "correspondence.returned": "بازگشت مکاتبه", "correspondence.approved": "تأیید مکاتبه",
  "correspondence.rejected": "رد مکاتبه", "correspondence.completed": "اتمام اقدام مکاتبه", "correspondence.archived": "بایگانی مکاتبه", "correspondence.updated": "ویرایش مکاتبه",
  "task.created": "ایجاد وظیفه", "task.updated": "ویرایش وظیفه", "task.status_changed": "تغییر وضعیت وظیفه", "task.reassigned": "ارجاع مجدد وظیفه",
  "task.completed": "تکمیل وظیفه", "task.approved": "تأیید وظیفه", "task.rejected": "رد نتیجه وظیفه", "task.commented": "ثبت نظر در وظیفه", "task.escalated": "ارجاع وظیفه معوق به مدیر",
  "deadline.created": "ثبت مهلت", "deadline.updated": "ویرایش مهلت", "deadline.completed": "انجام مهلت", "deadline.verified": "تأیید مهلت قانونی",
  "deadline.missed": "ثبت مهلت ازدست‌رفته", "deadline.cancelled": "لغو مهلت", "deadline.escalated": "هشدار مدیریتی مهلت",
  "event.created": "ثبت رویداد تقویم", "event.updated": "ویرایش رویداد", "event.cancelled": "لغو رویداد",
  "message.sent": "ارسال پیام", "announcement.sent": "ارسال اطلاعیه",
  "template.created": "ایجاد قالب", "template.version_added": "نسخه جدید قالب", "template.updated": "ویرایش قالب",
  "draft.created": "ایجاد پیش‌نویس", "draft.saved": "ذخیره نسخه پیش‌نویس", "draft.submitted": "ارسال برای بررسی", "draft.approved": "تأیید سند",
  "draft.changes_requested": "درخواست اصلاح سند", "draft.finalized": "نهایی‌سازی سند", "draft.exported": "خروجی سند", "draft.restored": "بازگردانی نسخه پیش‌نویس",
  "ai.request": "درخواست از دستیار هوشمند", "skill.run": "اجرای مهارت حقوقی", "skill.reviewed": "بازبینی خروجی مهارت",
  "settings.updated": "تغییر تنظیمات", "backup.created": "تهیه پشتیبان", "backup.verified": "راستی‌آزمایی پشتیبان", "backup.restored": "بازیابی پشتیبان",
  "report.exported": "خروجی گزارش", "connector.updated": "تغییر اتصال بیرونی", "user.messenger_linked": "اتصال به پیام‌رسان", "user.messenger_unlinked": "قطع اتصال پیام‌رسان", "automation.updated": "تغییر قاعده اتوماسیون",
  "legal_source.created": "افزودن منبع حقوقی", "legal_source.verified": "تأیید منبع حقوقی", "security.forbidden": "تلاش دسترسی غیرمجاز",
  "petition_type.imported": "ورود فرم دادخواست", "petition_type.updated": "ویرایش نوع دادخواست", "petition_type.published": "انتشار نوع دادخواست",
  "petition_type.archived": "بایگانی نوع دادخواست", "petition_type.unpublished": "بازگشت نوع دادخواست به پیش‌نویس",
};
export const CONNECTOR_STATUS: Record<string, { label: string; tone: Tone }> = {
  NOT_CONFIGURED: { label: "پیکربندی نشده", tone: "neutral" },
  CONFIGURED: { label: "پیکربندی شده", tone: "info" },
  OK: { label: "برقرار", tone: "success" },
  ERROR: { label: "خطا", tone: "danger" },
};

export const PETITION_KIND: Record<string, { label: string; hint: string }> = {
  INITIAL: { label: "بدوی", hint: "دادخواست نخستین برای طرح دعوا" },
  OBJECTION: { label: "اعتراضی", hint: "واخواهی، تجدیدنظر، فرجام، اعتراض ثالث، اعاده دادرسی" },
  INCIDENTAL: { label: "طاری", hint: "ورود و جلب ثالث، دعوای متقابل، تأمین خواسته، دستور موقت" },
};
export const PETITION_TYPE_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "پیش‌نویس", tone: "warning" },
  PUBLISHED: { label: "منتشرشده", tone: "success" },
  ARCHIVED: { label: "بایگانی", tone: "neutral" },
};
export const PETITION_SOURCE: Record<string, string> = { FORM: "فرم نمونه", LAW: "برگرفته از متن قانون" };
export const VALUE_TYPE: Record<string, string> = { MALI: "مالی", GHEIR_MALI: "غیرمالی", BY_SUBJECT: "بر حسب موضوع" };
