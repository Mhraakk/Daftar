// قواعد مهلت‌های پرتکرار دادرسی. این فهرست «پیشنهاد اولیه» است و در سامانه با برچسب «تأییدنشده» ثبت می‌شود؛
// مسئول حقوقی دفتر باید هر قاعده را با متن رسمی قانون تطبیق دهد و سپس تأیید کند. قواعد ق.آ.د.م به ماده‌های
// کتابخانه (lawCode/articleNos) پیوند دارند و آزمون tests/unit/acp.test.ts مدت هر قاعده را با متن همان ماده می‌سنجد.
/** مدت‌ها به همان واژه‌ای که در متن ماده آمده است («بیست روز»، «دو ماه»، ...) */
const THREE_DAYS = 3;
const ONE_WEEK = 7;
const TEN_DAYS = 10;
const TWENTY_DAYS = 20;
const ONE_MONTH = 1;
const TWO_MONTHS = 2;

export const DEADLINE_RULES = [
  { key: "CIVIL_APPEAL", title: "تجدیدنظرخواهی از آرای حقوقی", days: TWENTY_DAYS, monthsAbroad: TWO_MONTHS, basis: "ماده ۳۳۶ قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور مدنی", description: "مقیم ایران ۲۰ روز و مقیم خارج از کشور ۲ ماه از تاریخ ابلاغ یا انقضای مدت واخواهی.", lawCode: "ACP", articleNos: ["336"] },
  { key: "CIVIL_OBJECTION", title: "واخواهی از حکم غیابی حقوقی", days: TWENTY_DAYS, monthsAbroad: TWO_MONTHS, basis: "ماده ۳۰۶ قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور مدنی", description: "مقیم ایران ۲۰ روز و مقیم خارج از کشور ۲ ماه از تاریخ ابلاغ واقعی.", lawCode: "ACP", articleNos: ["306"] },
  { key: "CIVIL_CASSATION", title: "فرجام‌خواهی حقوقی", days: TWENTY_DAYS, monthsAbroad: TWO_MONTHS, basis: "مواد ۳۹۷ و ۳۹۸ قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور مدنی", description: "مقیم ایران ۲۰ روز و مقیم خارج از کشور ۲ ماه (ماده ۳۹۷)؛ آغاز مهلت طبق ماده ۳۹۸.", lawCode: "ACP", articleNos: ["397", "398"] },
  { key: "CIVIL_FIX_DEFECT", title: "رفع نقص دادخواست", days: TEN_DAYS, monthsAbroad: null, basis: "ماده ۵۴ قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور مدنی", description: "۱۰ روز از تاریخ ابلاغ اخطار رفع نقص.", lawCode: "ACP", articleNos: ["54"] },
  { key: "CIVIL_EXPERT_OBJECTION", title: "اظهارنظر/اعتراض به نظر کارشناس", days: ONE_WEEK, monthsAbroad: null, basis: "ماده ۲۶۰ قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور مدنی", description: "یک هفته از تاریخ ابلاغ وصول نظر کارشناس.", lawCode: "ACP", articleNos: ["260"] },
  { key: "CIVIL_RETRIAL", title: "درخواست اعاده دادرسی حقوقی", days: TWENTY_DAYS, monthsAbroad: TWO_MONTHS, basis: "ماده ۴۲۷ قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور مدنی", description: "مقیم ایران ۲۰ روز و مقیم خارج ۲ ماه؛ آرای حضوری از ابلاغ، غیابی از انقضای مهلت واخواهی و تجدیدنظر.", lawCode: "ACP", articleNos: ["427"] },
  { key: "CIVIL_THIRD_PARTY_JOINDER", title: "تقدیم دادخواست جلب ثالث", days: THREE_DAYS, monthsAbroad: null, basis: "ماده ۱۳۵ قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور مدنی", description: "ظرف سه روز پس از جلسه اول دادرسی (جهات تا پایان جلسه اول اظهار شده باشد).", lawCode: "ACP", articleNos: ["135"] },
  { key: "CIVIL_INTERIM_MAIN_CLAIM", title: "اقامه دعوای اصلی پس از دستور موقت", days: TWENTY_DAYS, monthsAbroad: null, basis: "ماده ۳۱۸ قانون آیین دادرسی دادگاه‌های عمومی و انقلاب در امور مدنی", description: "حداکثر ۲۰ روز از تاریخ صدور دستور موقت، اگر دعوای اصلی از قبل اقامه نشده باشد.", lawCode: "ACP", articleNos: ["318"] },
  { key: "CRIMINAL_APPEAL", title: "تجدیدنظر/فرجام‌خواهی از آرای کیفری", days: TWENTY_DAYS, monthsAbroad: TWO_MONTHS, basis: "ماده ۴۳۱ قانون آیین دادرسی کیفری", description: "مقیم ایران ۲۰ روز و مقیم خارج از کشور ۲ ماه از تاریخ ابلاغ رأی یا انقضای مهلت واخواهی.", lawCode: null, articleNos: [] },
  { key: "CRIMINAL_OBJECTION", title: "واخواهی از حکم غیابی کیفری", days: TWENTY_DAYS, monthsAbroad: TWO_MONTHS, basis: "ماده ۴۰۶ قانون آیین دادرسی کیفری", description: "مقیم ایران ۲۰ روز و مقیم خارج از کشور ۲ ماه از تاریخ ابلاغ واقعی.", lawCode: null, articleNos: [] },
  { key: "CRIMINAL_ORDER_OBJECTION", title: "اعتراض به قرارهای قابل اعتراض دادسرا", days: TEN_DAYS, monthsAbroad: ONE_MONTH, basis: "ماده ۲۷۰ قانون آیین دادرسی کیفری", description: "مقیم ایران ۱۰ روز و مقیم خارج از کشور ۱ ماه از تاریخ ابلاغ.", lawCode: null, articleNos: [] },
];
