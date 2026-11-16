"use client";
// ادامه گفت‌وگو با مهارت (پاسخ به «پرسش‌های لازم پیش از ادامه» یا درخواست تکمیلی)
import { MessageSquareReply } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { continueSkillRunAction } from "@/app/(app)/skills/actions";

export function FollowupForm({ runId }: { runId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const send = () => start(async () => {
    const res = await continueSkillRunAction({ runId, text });
    if (!res.ok) { toast.error(res.error); return; }
    setText("");
    toast.success("پیام در صف قرار گرفت.");
    router.refresh();
  });
  return (
    <div className="flex flex-col gap-2" data-testid="followup">
      <label className="text-sm font-medium" htmlFor="fu-text">پاسخ یا درخواست تکمیلی</label>
      <textarea id="fu-text" className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="پاسخ پرسش‌های مهارت یا درخواست تکمیلی خود را بنویسید" />
      <div className="flex justify-end"><Button variant="primary" onClick={send} loading={pending} disabled={!text.trim()}><MessageSquareReply />ارسال</Button></div>
    </div>
  );
}
