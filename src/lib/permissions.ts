// فهرست مجوزها و ماتریس پیش‌فرض نقش‌ها. نقش‌ها و مجوزها در دیتابیس قابل تنظیم‌اند؛
// این فایل فقط کاتالوگ مجوزها و مقادیر اولیه seed است.

export const PERMISSIONS = [
  // مدیریت
  ["dashboard.manager", "داشبورد", "مشاهده داشبورد مدیریتی"],
  ["user.view", "کاربران", "مشاهده فهرست کارمندان"],
  ["user.manage", "کاربران", "ایجاد، ویرایش و غیرفعال‌سازی کارمندان"],
  ["role.manage", "کاربران", "مدیریت نقش‌ها و مجوزها"],
  ["department.manage", "کاربران", "مدیریت واحدها"],
  // مراجعان
  ["client.view", "مراجعان", "مشاهده مراجعان مرتبط"],
  ["client.view_all", "مراجعان", "مشاهده همه مراجعان"],
  ["client.create", "مراجعان", "ثبت مراجعه‌کننده"],
  ["client.edit", "مراجعان", "ویرایش مراجعه‌کننده"],
  ["client.archive", "مراجعان", "بایگانی مراجعه‌کننده"],
  // پرونده‌ها
  ["case.view", "پرونده‌ها", "مشاهده پرونده‌های مرتبط"],
  ["case.view_all", "پرونده‌ها", "مشاهده همه پرونده‌ها"],
  ["case.create", "پرونده‌ها", "ایجاد پرونده"],
  ["case.edit", "پرونده‌ها", "ویرایش پرونده"],
  ["case.assign", "پرونده‌ها", "تعیین مسئول و اعضای پرونده"],
  ["case.close", "پرونده‌ها", "بستن و بایگانی پرونده"],
  // اسناد
  ["document.view", "اسناد", "مشاهده و دریافت اسناد مجاز"],
  ["document.upload", "اسناد", "بارگذاری سند و نسخه جدید"],
  ["document.edit", "اسناد", "ویرایش مشخصات سند"],
  ["document.delete", "اسناد", "حذف منطقی و بازیابی سند"],
  ["document.view_confidential", "اسناد", "مشاهده اسناد محرمانه"],
  ["document.view_restricted", "اسناد", "مشاهده همه اسناد خیلی‌محرمانه"],
  // کارتابل
  ["correspondence.view", "کارتابل", "مشاهده مکاتبات کارتابل شخصی"],
  ["correspondence.view_all", "کارتابل", "مشاهده همه مکاتبات دفتر"],
  ["correspondence.create", "کارتابل", "ثبت مکاتبه"],
  ["correspondence.refer", "کارتابل", "ارجاع و بازگشت مکاتبه"],
  ["correspondence.approve", "کارتابل", "تأیید یا رد مکاتبه"],
  ["correspondence.archive", "کارتابل", "بایگانی مکاتبه"],
  // وظایف
  ["task.view", "وظایف", "مشاهده وظایف مرتبط"],
  ["task.view_all", "وظایف", "مشاهده همه وظایف"],
  ["task.create", "وظایف", "ایجاد وظیفه"],
  ["task.assign", "وظایف", "ارجاع وظیفه به دیگران"],
  ["task.approve", "وظایف", "تأیید یا رد نتیجه وظیفه"],
  // مهلت و تقویم
  ["deadline.view", "مهلت‌ها", "مشاهده مهلت‌های مرتبط"],
  ["deadline.view_all", "مهلت‌ها", "مشاهده همه مهلت‌ها"],
  ["deadline.manage", "مهلت‌ها", "ثبت و ویرایش مهلت"],
  ["deadline.verify_legal", "مهلت‌ها", "تأیید مهلت‌های قانونی"],
  ["calendar.view", "تقویم", "مشاهده تقویم"],
  ["calendar.view_all", "تقویم", "مشاهده تقویم کل دفتر"],
  ["calendar.manage", "تقویم", "ثبت و ویرایش رویداد"],
  // ارتباطات
  ["message.send", "پیام‌ها", "ارسال پیام داخلی"],
  ["announcement.send", "پیام‌ها", "ارسال اطلاعیه"],
  // اسناد حقوقی
  ["template.view", "اسناد حقوقی", "مشاهده قالب‌ها"],
  ["template.manage", "اسناد حقوقی", "مدیریت قالب‌های حقوقی"],
  ["petition.manage", "اسناد حقوقی", "مدیریت انواع دادخواست و ورود فرم‌ها"],
  ["draft.view", "اسناد حقوقی", "مشاهده پیش‌نویس‌های مرتبط"],
  ["draft.view_all", "اسناد حقوقی", "مشاهده همه پیش‌نویس‌ها"],
  ["draft.create", "اسناد حقوقی", "تنظیم و ویرایش پیش‌نویس"],
  ["draft.review", "اسناد حقوقی", "بررسی و تأیید پیش‌نویس"],
  ["draft.finalize", "اسناد حقوقی", "نهایی‌سازی سند تأییدشده"],
  // هوش مصنوعی و پژوهش
  ["ai.use", "هوش مصنوعی", "استفاده از دستیار حقوقی"],
  ["ai.configure", "هوش مصنوعی", "پیکربندی ارائه‌دهنده هوش مصنوعی"],
  ["skill.run", "هوش مصنوعی", "اجرای مهارت‌های حقوقی"],
  ["skill.manage", "هوش مصنوعی", "مدیریت کتابخانه مهارت‌ها"],
  ["research.use", "پژوهش", "جست‌وجو در منابع حقوقی"],
  ["legal_source.manage", "پژوهش", "مدیریت کتابخانه حقوقی داخلی"],
  ["connector.manage", "پژوهش", "مدیریت اتصال‌های بیرونی"],
  // گزارش و سامانه
  ["report.view", "گزارش‌ها", "مشاهده گزارش‌ها"],
  ["report.export", "گزارش‌ها", "خروجی Excel و PDF"],
  ["audit.view", "سامانه", "مشاهده تاریخچه فعالیت‌ها"],
  ["automation.manage", "سامانه", "مدیریت قواعد اتوماسیون"],
  ["settings.manage", "سامانه", "تنظیمات دفتر"],
  ["backup.manage", "سامانه", "پشتیبان‌گیری و بازیابی"],
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number][0];

const ALL = PERMISSIONS.map((p) => p[0]) as PermissionKey[];
const except = (...keys: PermissionKey[]) => ALL.filter((k) => !keys.includes(k));

const STAFF_BASE: PermissionKey[] = [
  "client.view", "case.view", "document.view", "document.upload",
  "correspondence.view", "correspondence.create", "correspondence.refer",
  "task.view", "task.create", "deadline.view", "deadline.manage",
  "calendar.view", "calendar.manage", "message.send", "template.view",
];

export const DEFAULT_ROLES: { key: string; name: string; description: string; permissions: PermissionKey[] }[] = [
  { key: "admin", name: "مدیر سامانه", description: "مدیریت فنی، کاربران، مجوزها و پشتیبان‌گیری", permissions: ALL },
  {
    key: "office_manager", name: "مدیر دفتر", description: "نظارت بر عملیات دفتر، ارجاع کار و گزارش‌ها",
    permissions: except("role.manage", "ai.configure", "connector.manage", "backup.manage", "skill.manage"),
  },
  {
    key: "department_manager", name: "مدیر واحد", description: "مدیریت کار کارمندان واحد",
    permissions: [
      ...STAFF_BASE, "dashboard.manager", "user.view", "client.create", "client.edit", "client.view_all",
      "case.view_all", "case.create", "case.edit", "case.assign", "case.close",
      "document.edit", "document.view_confidential", "correspondence.view_all", "correspondence.approve", "correspondence.archive",
      "task.view_all", "task.assign", "task.approve", "deadline.view_all", "deadline.verify_legal", "calendar.view_all",
      "announcement.send", "draft.view", "draft.view_all", "draft.create", "draft.review",
      "ai.use", "skill.run", "research.use", "report.view", "report.export",
    ],
  },
  {
    key: "legal_staff", name: "کارمند حقوقی", description: "تنظیم اسناد و پیگیری پرونده‌های ارجاع‌شده",
    permissions: [
      ...STAFF_BASE, "user.view", "client.create", "client.edit", "case.create", "case.edit",
      "document.edit", "document.view_confidential", "draft.view", "draft.create",
      "ai.use", "skill.run", "research.use",
    ],
  },
  {
    key: "intake", name: "مسئول پذیرش", description: "ثبت مراجعان، پرونده اولیه و مدارک",
    permissions: [...STAFF_BASE, "user.view", "client.create", "client.edit", "client.view_all", "case.create"],
  },
  {
    key: "reviewer", name: "مسئول بررسی و تأیید اسناد", description: "بررسی، اصلاح و تأیید اسناد حقوقی",
    permissions: [
      ...STAFF_BASE, "user.view", "document.view_confidential", "draft.view", "draft.view_all", "draft.create",
      "draft.review", "draft.finalize", "task.approve", "deadline.verify_legal", "correspondence.approve",
      "ai.use", "skill.run", "research.use",
    ],
  },
  { key: "employee", name: "کارمند", description: "انجام وظایف ارجاع‌شده", permissions: [...STAFF_BASE, "user.view"] },
  {
    key: "auditor", name: "ناظر (فقط مشاهده)", description: "مشاهده بدون امکان تغییر",
    permissions: [
      "dashboard.manager", "user.view", "client.view", "client.view_all", "case.view", "case.view_all",
      "document.view", "document.view_confidential", "correspondence.view", "correspondence.view_all",
      "task.view", "task.view_all", "deadline.view", "deadline.view_all", "calendar.view", "calendar.view_all",
      "template.view", "draft.view", "draft.view_all", "report.view", "report.export", "audit.view",
    ],
  },
];
