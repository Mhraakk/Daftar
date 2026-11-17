import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { getSessionUser } from "@/lib/auth/guard";
import { resolveUi } from "@/theme/prefs";
import { SKINS, skinCss } from "@/theme/skins";
import "./globals.css";

const vazir = localFont({
  src: "../assets/fonts/Vazirmatn-Variable.woff2",
  variable: "--font-vazir",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "دفتر — سامانه دفتر خدمات الکترونیک قضایی", template: "%s · دفتر" },
  description: "سامانه هوشمند مدیریت دفتر خدمات الکترونیک قضایی",
};

/** رنگ نوار مرورگر همراه با بوم پوسته فعال */
export async function generateViewport(): Promise<Viewport> {
  const user = await getSessionUser();
  const ui = await resolveUi(user?.id ?? null);
  return { width: "device-width", initialScale: 1, themeColor: `#${SKINS[ui.skin].colors.paper}`, viewportFit: "cover" };
}

/** چیدمان و پوسته روی <html> از سمت سرور نشانده می‌شود تا صفحه بی‌پرش با ظاهر درست بارگذاری شود */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const ui = await resolveUi(user?.id ?? null);
  return (
    <html lang="fa" dir="rtl" className={vazir.variable} data-layout={ui.layout} data-skin={ui.skin} data-time-axis={ui.chartTimeAxis} suppressHydrationWarning>
      <head>
        <style id="skins" dangerouslySetInnerHTML={{ __html: skinCss() }} />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
