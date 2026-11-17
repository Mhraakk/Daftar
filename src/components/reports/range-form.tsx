"use client";
// بازه دلخواه شمسی برای گزارش: «از» و «تا» (روز پایان هم شمرده می‌شود)
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { JalaliDateInput } from "@/components/ui/date-picker";

export function RangeForm({ from, to, path = "/reports" }: { from: string; to: string; path?: string }) {
  const router = useRouter();
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`${path}?${new URLSearchParams({ from: a, to: b })}`);
  };
  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-2" aria-label="بازه دلخواه">
      <label className="w-40"><span className="mb-1 block text-xs text-ink-3">از</span><JalaliDateInput value={a} onChange={setA} /></label>
      <label className="w-40"><span className="mb-1 block text-xs text-ink-3">تا</span><JalaliDateInput value={b} onChange={setB} /></label>
      <Button type="submit" size="sm" variant="secondary" disabled={!a || !b}>اعمال بازه</Button>
    </form>
  );
}
