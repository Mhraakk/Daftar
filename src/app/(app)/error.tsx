"use client";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel mx-auto mt-10 flex max-w-lg flex-col items-center gap-3 p-8 text-center">
      <TriangleAlert className="size-9 text-mohr" />
      <h1 className="text-lg font-bold">در نمایش این صفحه خطایی رخ داد</h1>
      <p className="text-sm leading-7 text-ink-2">اطلاعات ذخیره‌شده شما آسیبی ندیده است. دوباره تلاش کنید؛ اگر مشکل ادامه داشت، کد زیر را به مدیر سامانه اطلاع دهید.</p>
      {error.digest && <code className="mono-code">{error.digest}</code>}
      <Button variant="primary" onClick={reset}>تلاش دوباره</Button>
    </div>
  );
}
