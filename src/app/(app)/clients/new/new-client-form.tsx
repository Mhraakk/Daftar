"use client";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SmartForm } from "@/components/ui/smart-form";
import { createClientAction, similarClientsAction } from "../actions";
import { clientFields } from "../client-fields";

interface Similar { id: string; code: string; displayName: string; nationalId: string | null; mobile: string | null; archivedAt: Date | null }

export function NewClientForm({ thenCase }: { thenCase: boolean }) {
  const [vals, setVals] = useState<Record<string, unknown>>({});
  const [similar, setSimilar] = useState<Similar[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const nationalId = String(vals.nationalId ?? "").trim();
    const mobile = String(vals.mobile ?? "").trim();
    const name = vals.type === "LEGAL" ? String(vals.companyName ?? "") : `${vals.firstName ?? ""} ${vals.lastName ?? ""}`.trim();
    if (nationalId.length < 10 && mobile.length < 11 && name.length < 5) { setSimilar([]); return; }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const r = await similarClientsAction({ nationalId: nationalId.length >= 10 ? nationalId : undefined, mobile: mobile.length >= 11 ? mobile : undefined, name: name.length >= 5 ? name : undefined });
      if (my === seq.current && r.ok) setSimilar(r.data as Similar[]);
    }, 400);
    return () => clearTimeout(t);
  }, [vals.nationalId, vals.mobile, vals.firstName, vals.lastName, vals.companyName, vals.type]);

  return (
    <SmartForm
      fields={clientFields()} initial={{ type: "PERSON" }} action={createClientAction} submitLabel={thenCase ? "ثبت و ادامه به ایجاد پرونده" : "ثبت مراجعه‌کننده"}
      successMessage="مراجعه‌کننده ثبت شد." onValuesChange={setVals}
      successHref={(d: { id: string }) => (thenCase ? `/cases/new?clientId=${d.id}` : `/clients/${d.id}`)}
      footer={similar.length > 0 && (
        <div className="rounded-md border border-zafaran/40 bg-zafaran-50 p-3" role="alert">
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-zafaran"><TriangleAlert className="size-4" />سوابق مشابه یافت شد — پیش از ثبت بررسی کنید</p>
          <ul className="flex flex-col gap-1 text-sm">
            {similar.map((s) => (
              <li key={s.id}>
                <Link href={`/clients/${s.id}`} target="_blank" className="font-medium text-lapis hover:underline">{s.displayName}</Link>
                <span className="text-ink-2"> · <span className="ltr">{s.code}</span>{s.nationalId && <> · کد ملی <span className="ltr">{s.nationalId}</span></>}{s.mobile && <> · <span className="ltr">{s.mobile}</span></>}{s.archivedAt && " · بایگانی‌شده"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    />
  );
}
