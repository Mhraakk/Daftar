"use client";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const r = await loginAction({ username, password, next });
        if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.error); return; }
        window.location.assign(r.data.href);
      } catch { setError("ارتباط با سرور برقرار نشد. اتصال شبکه داخلی را بررسی کنید."); }
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="username" className="mb-1 block text-sm font-medium text-ink-2">نام کاربری</label>
        <input id="username" name="username" dir="ltr" autoComplete="username" autoFocus required value={username}
          onChange={(e) => setUsername(e.target.value)} className="input h-11 text-right" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink-2">رمز عبور</label>
        <div className="relative">
          <input id="password" name="password" dir="ltr" type={show ? "text" : "password"} autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} className="input h-11 pe-10 text-right" />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "پنهان‌کردن رمز" : "نمایش رمز"}
            className="absolute end-1.5 top-1.5 flex size-8 items-center justify-center rounded text-ink-3 hover:text-ink">
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-md border border-mohr/30 bg-mohr-50 px-3 py-2 text-sm text-mohr">{error}</p>}
      <Button type="submit" variant="primary" loading={pending} className="mt-1 h-11"><LogIn />ورود به سامانه</Button>
    </form>
  );
}
