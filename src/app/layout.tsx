import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#101d25" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazir.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
