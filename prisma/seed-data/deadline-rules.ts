// قواعد مهلت‌های پرتکرار دادرسی. این فهرست «پیشنهاد اولیه» است و در سامانه با برچسب «تأییدنشده» ثبت می‌شود؛
// مسئول حقوقی دفتر باید هر قاعده را با متن رسمی قانون تطبیق دهد و سپس تأیید کند. قواعد ق.آ.د.م به ماده‌های
// کتابخانه (lawCode/articleNos) پیوند دارند و آزمون tests/unit/acp.test.ts مدت هر قاعده را با متن همان ماده می‌سنجد.
export const DEADLINE_RULES = [
  { key: "CIVIL_APPEAL", title: "تجدیدنظرخواهی از آرای حقوقی", days: 20, monthsAbroad: 2, basis: "ماده ۳۳۶ قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور مدنی", description: "مقیم ایران ۲۰ روز و مقیم خارج از کشور ۲ ماه از تاریخ ابلاغ یا انقضای مدت واخواهی.", lawCode: "ACP", articleNos: ["336"] },
  { key: "CIVIL_OBJECTION", title: "واخواهی از حکم غیابی حقوقی", days: 20, monthsAbroad: 2, basis: "ماده ۳۰۶ قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور مدنی", description: "مقیم ایران ۲۰ روز و مقیم خارج از کشور ۲ ماه از تاریخ ابلاغ واقعی.", lawCode: "ACP", articleNos: ["306"] },
  { key: "CIVIL_CASSATION", title: "فرجام‌خواهی حقوقی", days: 20, monthsAbroad: 2, basis: "مواد ۳۹۷ و ۳۹۸ قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور مدنی", description: "مقیم ایران ۲۰ روز و مقیم خارج از کشور ۲ ماه (ماده ۳۹۷)؛ آغاز مهلت طبق ماده ۳۹۸.", lawCode: "ACP", articleNos: ["397", "398"] },
  { key: "CIVIL_FIX_DEFECT", title: "رفع نقص دادخواست", days: 10, monthsAbroad: null, basis: "ماده ۵۴ قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور مدنی", description: "۱۰ روز از تاریخ ابلاغ اخطار رفع نقص.", lawCode: "ACP", articleNos: ["54"] },
  { key: "CIVIL_EXPERT_OBJECTION", title: "اظهارنظر/اعتراض به نظر کارشناس", days: 7, monthsAbroad: null, basis: "ماده ۲۶۰ قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور مدنی", description: "یک هفته از تاریخ ابلاغ وصول نظر کارشناس.", lawCode: "ACP", articleNos: ["260"] },
  { key: "CRIMINAL_APPEAL", title: "تجدیدنظر/فرجام‌خواهی از آرای کیفری", days: 20, monthsAbroad: 2, basis: "ماده ۴۳۱ قانون آیین دادرسی کیفری", description: "مقیم ایران ۲۰ روز و مقیم خارج از کشور ۲ ماه از تاریخ ابلاغ رأی یا انقضای مهلت واخواهی.", lawCode: null, articleNos: [] },
  { key: "CRIMINAL_OBJECTION", title: "واخواهی از حکم غیابی کیفری", days: 20, monthsAbroad: 2, basis: "ماده ۴۰۶ قانون آیین دادرسی کیفری", description: "مقیم ایران ۲۰ روز و مقیم خارج از کشور ۲ ماه از تاریخ ابلاغ واقعی.", lawCode: null, articleNos: [] },
  { key: "CRIMINAL_ORDER_OBJECTION", title: "اعتراض به قرارهای قابل اعتراض دادسرا", days: 10, monthsAbroad: 1, basis: "ماده ۲۷۰ قانون آیین دادرسی کیفری", description: "مقیم ایران ۱۰ روز و مقیم خارج از کشور ۱ ماه از تاریخ ابلاغ.", lawCode: null, articleNos: [] },
];
