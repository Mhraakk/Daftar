"use client";
import { SmartForm } from "@/components/ui/smart-form";
import { addNoteAction } from "@/app/(app)/clients/actions";

export function NoteBox({ caseId, clientId }: { caseId?: string; clientId?: string }) {
  return (
    <SmartForm cols={1} action={addNoteAction} hidden={{ caseId, clientId }} submitLabel="ثبت یادداشت" successMessage="یادداشت ثبت شد." resetOnSuccess
      fields={[{ name: "body", label: "یادداشت جدید", type: "textarea", rows: 2, required: true, placeholder: "نکته، نتیجه تماس یا پیگیری را بنویسید…" }]} />
  );
}
