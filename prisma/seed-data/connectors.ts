// اتصال‌های بیرونی پیاده‌سازی‌شده. هیچ‌کدام بدون پیکربندی و اطلاعات دسترسی معتبرِ دفتر فعال نمی‌شوند.
// اتصال‌های Google (Drive، Gmail، Calendar) در این نسخه پیاده‌سازی نشده‌اند و عمداً در فهرست نیستند (مستندات: NOT STARTED).
export const CONNECTORS = [
  { key: "legal_web", name: "منابع حقوقی رسمی (ورود متن از وب)", kind: "LEGAL_WEB" },
  { key: "messenger_bot", name: "اعلان در پیام‌رسان (Bot API بله / تلگرام)", kind: "MESSENGER" },
];
