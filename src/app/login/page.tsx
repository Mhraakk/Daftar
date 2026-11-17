import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/shell/brand";
import { getSessionUser } from "@/lib/auth/guard";
import { formatJalali } from "@/lib/jalali";
import { getOffice } from "@/server/admin";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ورود" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const { next } = await searchParams;
  const office = await getOffice();
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="girih relative hidden flex-col justify-between p-12 lg:flex">
        <Brand size="lg" />
        <div className="max-w-md">
          <p className="text-3xl font-extrabold leading-[1.6]">هر پرونده، یک دفتر منظم.<br /><span className="text-firuze-50/80">هر مهلت، سرِ وقت.</span></p>
          <p className="mt-4 leading-8 text-chrome-ink-2">
            مراجعان، پرونده‌ها، اسناد، ارجاع‌ها و مهلت‌های دفتر در یک سامانه یکپارچه و روی شبکه داخلی خودتان.
          </p>
        </div>
        <p className="text-sm text-chrome-ink-2">{office.officeName} · {formatJalali(new Date(), "long")}</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Brand tone="page" /></div>
          <h1 className="text-2xl font-extrabold">ورود کارمندان</h1>
          <p className="mb-6 mt-1 text-sm text-ink-2">با حساب کاربری سازمانی خود وارد شوید.</p>
          <LoginForm next={next} />
          <p className="mt-6 border-t border-line pt-4 text-xs leading-6 text-ink-3">
            دسترسی به این سامانه فقط برای کارمندان مجاز دفتر است. همه ورودها و عملیات حساس در تاریخچه ثبت می‌شود.
          </p>
        </div>
      </section>
    </main>
  );
}
