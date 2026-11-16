"use client";
// آزمون اتصال واقعی به ارائه‌دهنده (یک درخواست کوچک بدون داده پرونده) و نمایش نتیجه
import { PlugZap } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/page";
import { toFaDigits } from "@/lib/text";
import { testAiConnectionAction } from "@/app/(app)/admin/ai/actions";

interface Result { ok: boolean; model?: string; latencyMs: number; sample?: string; error?: string; inputTokens?: number | null; outputTokens?: number | null }

export function ConnectionTest({ disabled }: { disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const run = () => start(async () => {
    const res = await testAiConnectionAction({});
    setResult(res.ok ? res.data : { ok: false, latencyMs: 0, error: res.error });
  });
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={run} loading={pending} disabled={disabled} data-testid="ai-test"><PlugZap />آزمون اتصال</Button>
      {result && (result.ok
        ? <Notice tone="success" title="اتصال برقرار است">
            <span data-testid="ai-test-ok">پاسخ مدل <span dir="ltr">{result.model}</span>: «{result.sample}» — زمان {toFaDigits(result.latencyMs)} میلی‌ثانیه{result.outputTokens != null ? ` — ${toFaDigits(result.outputTokens)} توکن خروجی` : ""}</span>
          </Notice>
        : <Notice tone="danger" title="اتصال ناموفق">{result.error}</Notice>)}
    </div>
  );
}
