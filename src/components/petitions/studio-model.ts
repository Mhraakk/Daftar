// مدل خالص استودیوی دادخواست (بدون React): گام مربوط به هر بررسی و ردیف‌های «کپی برای ثبت در سامانه»
import { toFaDigits } from "@/lib/text";
import { partyName, type PetitionData, type PetitionParty, type PetitionSpec } from "@/server/petitions/data";
import { courtLabel, fillBody, formatAmount } from "@/server/petitions/render";
import type { PetitionCheck } from "@/server/petitions/validate";

export type StepId = "parties" | "claim" | "evidence" | "extras" | "court" | "body" | "review";

/** گامی که هر بررسی به آن مربوط است (از روی مسیر فیلد) */
const STEP_PREFIXES: [string, StepId][] = [
  ["plaintiffs", "parties"], ["defendants", "parties"], ["representatives", "parties"], ["claim", "claim"], ["evidence", "evidence"], ["witnesses", "evidence"],
  ["investigations", "extras"], ["ancillary", "extras"], ["court", "court"], ["decision", "court"], ["mainCase", "court"], ["blanks", "body"], ["body", "body"],
];
export const stepOf = (field: string | null): StepId => STEP_PREFIXES.find(([p]) => field === p || field?.startsWith(`${p}.`))?.[1] ?? "review";

export const countSteps = (checks: PetitionCheck[]): Partial<Record<StepId, number>> =>
  checks.filter((c) => c.status === "missing").reduce<Partial<Record<StepId, number>>>((acc, c) => ({ ...acc, [stepOf(c.field)]: (acc[stepOf(c.field)] ?? 0) + 1 }), {});

// ── کپی برای ثبت در سامانه: هر ردیف همان خانه‌ای است که در سامانه ثبت دادخواست پر می‌شود ──

function partyLine(p: PetitionParty): string {
  const legal = p.partyType === "LEGAL";
  const parts = [
    partyName(p),
    !legal && p.fatherName && `فرزند ${p.fatherName}`,
    p.nationalId && `${legal ? "شناسه ملی" : "کد ملی"} ${p.nationalId}`,
    !legal && p.age && `سن ${p.age}`,
    p.occupation && `${legal ? "فعالیت" : "شغل"} ${p.occupation}`,
    p.address && `نشانی: ${p.address}`,
    p.postalCode && `کد پستی ${p.postalCode}`,
    p.phone && `تلفن ${p.phone}`,
  ];
  return toFaDigits(parts.filter(Boolean).join("، "));
}

function valueText(c: PetitionData["claim"]): string {
  const basis = c.valueBasis.trim();
  if (c.valueType === "MALI" && c.value.trim()) return basis ? `${formatAmount(c.value)} ریال (${basis})` : `${formatAmount(c.value)} ریال`;
  if (basis) return basis;
  return c.valueType === "GHEIR_MALI" ? "غیرمالی" : "";
}

export function systemRows(spec: PetitionSpec, d: PetitionData, sides: readonly [string, string]): { label: string; value: string }[] {
  const body = fillBody(spec, d);
  const value = valueText(d.claim);
  return [
    { label: sides[0], value: d.plaintiffs.map(partyLine).join("\n") },
    { label: sides[1], value: d.defendants.map(partyLine).join("\n") },
    { label: "وکیل یا نماینده", value: toFaDigits(d.representatives.map((r) => [[r.firstName, r.lastName].filter(Boolean).join(" "), r.licenseNo && `پروانه ${r.licenseNo}`, r.address].filter(Boolean).join("، ")).join("\n")) },
    { label: "خواسته", value: d.claim.subject },
    { label: "بهای خواسته", value },
    { label: "دلایل و منضمات", value: d.evidence.filter((e) => e.include && e.label.trim()).map((e, i) => `${toFaDigits(i + 1)}- ${e.label}${e.detail ? ` (${e.detail})` : ""}`).join("\n") },
    { label: "گواهان", value: d.witnesses.filter((w) => w.name.trim()).map((w) => [w.name, w.details, w.address].filter(Boolean).join("، ")).join("\n") },
    { label: "مرجع رسیدگی", value: courtLabel(d.court) },
    { label: "شرح دادخواست", value: body.text },
  ].filter((r) => r.value.trim() !== "");
}
