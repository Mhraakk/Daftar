"use client";
// ویرایش طرفین دادخواست به ترتیب ماده ۵۱: هر شخص حقیقی یا حقوقی یک کارت؛ وکیل و نماینده در فهرست جدا
import { ArrowDown, ArrowUp, Building2, Trash2, User, UserRoundCheck } from "lucide-react";
import { Seal } from "@/components/ui/seal";
import { cn } from "@/lib/cn";
import { toFaDigits } from "@/lib/text";
import { emptyParty, partyName, REPRESENTATIVE_KINDS, type PetitionData, type PetitionParty, type Representative } from "@/server/petitions/data";
import type { PetitionCheck } from "@/server/petitions/validate";
import { AddButton, Card, Field, moveBy, removeAt, replaceAt, Segmented } from "./studio-ui";

type TextKey = Exclude<keyof PetitionParty, "partyType" | "sourceId">;
type InputMode = React.HTMLAttributes<HTMLInputElement>["inputMode"];
interface FieldSpec { key: TextKey; label: string; inputMode?: InputMode; ltr?: boolean; wide?: boolean }

const PERSON_FIELDS: FieldSpec[] = [
  { key: "firstName", label: "نام" }, { key: "lastName", label: "نام خانوادگی" }, { key: "fatherName", label: "نام پدر" },
  { key: "age", label: "سن", inputMode: "numeric" }, { key: "nationalId", label: "کد ملی", inputMode: "numeric", ltr: true }, { key: "occupation", label: "شغل" },
];
const LEGAL_FIELDS: FieldSpec[] = [
  { key: "legalName", label: "نام شخص حقوقی", wide: true }, { key: "nationalId", label: "شناسه ملی", inputMode: "numeric", ltr: true }, { key: "occupation", label: "نوع فعالیت" },
];
const CONTACT_FIELDS: FieldSpec[] = [{ key: "postalCode", label: "کد پستی", inputMode: "numeric", ltr: true }, { key: "phone", label: "تلفن", inputMode: "tel", ltr: true }];
const PARTY_TYPES = [{ value: "PERSON" as const, label: "شخص حقیقی" }, { value: "LEGAL" as const, label: "شخص حقوقی" }];
const REP_LABELS: Record<Representative["kind"], string> = { LAWYER: "وکیل دادگستری", AGENT: "نماینده قانونی", GUARDIAN: "ولی یا قیم" };
const ADDRESS_ROWS = 2;

type Side = "plaintiffs" | "defendants";

/** پیام بررسی‌های ناتمام یک ردیف (برای نمایش زیر سرتیتر کارت) */
const issuesFor = (checks: PetitionCheck[], prefix: string): PetitionCheck[] =>
  checks.filter((c) => c.status !== "ok" && c.status !== "info" && (c.field === prefix || c.field?.startsWith(`${prefix}.`)));

function Issues({ items }: { items: PetitionCheck[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mb-3 flex flex-col gap-1 rounded-ctl bg-zafaran-50 px-3 py-2 text-xs leading-5 text-zafaran">
      {items.map((c) => <li key={c.id}>{c.label}{c.message ? `: ${c.message}` : ""}</li>)}
    </ul>
  );
}

function RowTools({ index, total, onMove, onRemove, disabled, what }: { index: number; total: number; onMove: (by: number) => void; onRemove: () => void; disabled?: boolean; what: string }) {
  if (disabled) return null;
  const btn = "press rounded-ctl p-1.5 text-ink-3 hover:bg-ink/5 hover:text-ink disabled:opacity-30 [&_svg]:size-4";
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button type="button" className={btn} onClick={() => onMove(-1)} disabled={index === 0} aria-label={`بالا بردن ${what}`}><ArrowUp /></button>
      <button type="button" className={btn} onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`پایین بردن ${what}`}><ArrowDown /></button>
      <button type="button" className={cn(btn, "hover:bg-mohr-50 hover:text-mohr")} onClick={onRemove} aria-label={`حذف ${what}`}><Trash2 /></button>
    </div>
  );
}

function PartyCard({ party, index, total, side, onChange, onMove, onRemove, disabled, issues }: {
  party: PetitionParty; index: number; total: number; side: string; onChange: (p: PetitionParty) => void; onMove: (by: number) => void; onRemove: () => void;
  disabled?: boolean; issues: PetitionCheck[];
}) {
  const legal = party.partyType === "LEGAL";
  const fields = legal ? LEGAL_FIELDS : PERSON_FIELDS;
  const name = partyName(party) || "بدون نام";
  const set = (key: TextKey, v: string) => onChange({ ...party, [key]: v });
  const what = `${side} ${toFaDigits(index + 1)}`;
  return (
    <article className="rounded-card border border-line bg-surface p-4" aria-label={what}>
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-lapis-50 text-lapis [&_svg]:size-4">{legal ? <Building2 /> : <User />}</span>
        <div className="min-w-[9rem] flex-1">
          <p className="truncate font-bold">{name}</p>
          <p className="text-xs text-ink-3">{what}{party.sourceId && " · از اطلاعات پرونده"}</p>
        </div>
        <Segmented label={`نوع ${what}`} value={party.partyType} options={PARTY_TYPES} onChange={(v) => onChange({ ...party, partyType: v })} disabled={disabled} />
        <RowTools index={index} total={total} onMove={onMove} onRemove={onRemove} disabled={disabled} what={what} />
      </header>
      <Issues items={issues} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} value={party[f.key] ?? ""} onChange={(v) => set(f.key, v)} disabled={disabled} inputMode={f.inputMode} ltr={f.ltr}
            className={cn(f.wide && "sm:col-span-2")} />
        ))}
        <Field label="اقامتگاه" value={party.address} onChange={(v) => set("address", v)} disabled={disabled} multiline rows={ADDRESS_ROWS} className="sm:col-span-2 lg:col-span-3"
          hint="شهر، خیابان، کوچه و پلاک را به‌گونه‌ای بنویسید که ابلاغ به‌سهولت ممکن باشد (تبصره ۱ ماده ۵۱)." />
        {CONTACT_FIELDS.map((f) => <Field key={f.key} label={f.label} value={party[f.key] ?? ""} onChange={(v) => set(f.key, v)} disabled={disabled} inputMode={f.inputMode} ltr={f.ltr} />)}
      </div>
    </article>
  );
}

export function PartiesEditor({ data, onChange, sides, disabled, checks }: {
  data: PetitionData; onChange: (d: PetitionData) => void; sides: readonly [string, string]; disabled?: boolean; checks: PetitionCheck[];
}) {
  const setSide = (key: Side, list: PetitionParty[]) => onChange({ ...data, [key]: list });
  const sections: { key: Side; label: string }[] = [{ key: "plaintiffs", label: sides[0] }, { key: "defendants", label: sides[1] }];
  return (
    <div className="flex flex-col gap-4">
      {sections.map((s) => {
        const list = data[s.key];
        const missingAll = issuesFor(checks, s.key).filter((c) => c.field === s.key);
        return (
          <Card key={s.key} title={s.label} icon={<User />} note={`${toFaDigits(list.length)} نفر`}
            action={!disabled && <AddButton onClick={() => setSide(s.key, [...list, emptyParty()])}>افزودن {s.label}</AddButton>}>
            <Issues items={missingAll} />
            <div className="flex flex-col gap-3">
              {list.map((p, i) => (
                <PartyCard key={`${s.key}-${i}`} party={p} index={i} total={list.length} side={s.label} disabled={disabled} issues={issuesFor(checks, `${s.key}.${i}`)}
                  onChange={(np) => setSide(s.key, replaceAt(list, i, np))} onMove={(by) => setSide(s.key, moveBy(list, i, by))} onRemove={() => setSide(s.key, removeAt(list, i))} />
              ))}
              {list.length === 0 && <p className="text-sm text-ink-3">هنوز {s.label}ی افزوده نشده است.</p>}
            </div>
          </Card>
        );
      })}
      <RepresentativesEditor list={data.representatives} onChange={(representatives) => onChange({ ...data, representatives })} disabled={disabled} checks={checks} />
    </div>
  );
}

const emptyRep = (): Representative => ({ kind: "LAWYER", firstName: "", lastName: "", licenseNo: "", address: "", phone: "" });

function RepresentativesEditor({ list, onChange, disabled, checks }: { list: Representative[]; onChange: (l: Representative[]) => void; disabled?: boolean; checks: PetitionCheck[] }) {
  return (
    <Card title="وکیل یا نماینده" icon={<UserRoundCheck />} note="اگر دادخواست را وکیل یا نماینده تقدیم می‌کند، مشخصات او هم باید درج شود (تبصره بند ۱ ماده ۵۱)."
      action={!disabled && <AddButton onClick={() => onChange([...list, emptyRep()])}>افزودن وکیل یا نماینده</AddButton>}>
      <div className="flex flex-col gap-3">
        {list.map((r, i) => {
          const what = `وکیل یا نماینده ${toFaDigits(i + 1)}`;
          const set = (patch: Partial<Representative>) => onChange(replaceAt(list, i, { ...r, ...patch }));
          return (
            <article key={`rep-${i}`} className="rounded-card border border-line bg-surface p-4" aria-label={what}>
              <header className="mb-3 flex flex-wrap items-center gap-2">
                <p className="min-w-[9rem] flex-1 truncate font-bold">{[r.firstName, r.lastName].filter(Boolean).join(" ") || what}</p>
                <Seal>{REP_LABELS[r.kind]}</Seal>
                <RowTools index={i} total={list.length} onMove={(by) => onChange(moveBy(list, i, by))} onRemove={() => onChange(removeAt(list, i))} disabled={disabled} what={what} />
              </header>
              <Issues items={issuesFor(checks, `representatives.${i}`)} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="min-w-0">
                  <span className="mb-1 block text-sm font-medium text-ink-2">سمت</span>
                  <Segmented label={`سمت ${what}`} value={r.kind} options={REPRESENTATIVE_KINDS.map((k) => ({ value: k, label: REP_LABELS[k] }))} onChange={(kind) => set({ kind })} disabled={disabled} />
                </div>
                <Field label="نام" value={r.firstName} onChange={(firstName) => set({ firstName })} disabled={disabled} />
                <Field label="نام خانوادگی" value={r.lastName} onChange={(lastName) => set({ lastName })} disabled={disabled} />
                <Field label="شماره پروانه" value={r.licenseNo} onChange={(licenseNo) => set({ licenseNo })} disabled={disabled} inputMode="numeric" ltr />
                <Field label="تلفن" value={r.phone} onChange={(phone) => set({ phone })} disabled={disabled} inputMode="tel" ltr />
                <Field label="نشانی" value={r.address} onChange={(address) => set({ address })} disabled={disabled} multiline rows={ADDRESS_ROWS} className="sm:col-span-2 lg:col-span-3" />
              </div>
            </article>
          );
        })}
        {list.length === 0 && <p className="text-sm text-ink-3">اگر دادخواست را وکیل یا نماینده تقدیم می‌کند، مشخصات او را اینجا بیفزایید.</p>}
      </div>
    </Card>
  );
}
