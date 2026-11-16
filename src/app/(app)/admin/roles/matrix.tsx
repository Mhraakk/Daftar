"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { rolePermissionsAction } from "../actions";

export function PermissionMatrix({ roleId, roleName, locked, groups, initial }: { roleId: string; roleName: string; locked: boolean; groups: { group: string; items: { key: string; label: string }[] }[]; initial: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [sel, setSel] = useState(() => new Set(initial));
  const [pending, start] = useTransition();
  const dirty = useMemo(() => sel.size !== initial.length || initial.some((k) => !sel.has(k)), [sel, initial]);
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const save = () => start(async () => {
    const r = await rolePermissionsAction({ roleId, keys: [...sel] });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`مجوزهای «${roleName}» ذخیره شد.`); router.refresh();
  });
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => {
          const all = g.items.every((i) => sel.has(i.key));
          return (
            <fieldset key={g.group} className="rounded-md border border-line p-3" disabled={locked}>
              <legend className="flex items-center gap-2 px-1 text-sm font-bold">{g.group}
                {!locked && <button type="button" className="text-2xs font-normal text-lapis hover:underline" onClick={() => setSel((s) => { const n = new Set(s); g.items.forEach((i) => (all ? n.delete(i.key) : n.add(i.key))); return n; })}>{all ? "حذف همه" : "انتخاب همه"}</button>}</legend>
              <div className="flex flex-col gap-1">{g.items.map((i) => (
                <label key={i.key} className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-surface-2">
                  <input type="checkbox" checked={sel.has(i.key)} onChange={() => toggle(i.key)} className="mt-1 size-4 accent-[rgb(var(--firuze))]" /><span className="text-sm leading-6">{i.label}</span>
                </label>))}</div>
            </fieldset>
          );
        })}
      </div>
      {!locked && <div className="sticky bottom-3 mt-4 flex items-center justify-end gap-3 rounded-lg border border-line bg-surface p-3 shadow-pop">
        <span className="text-sm text-ink-2">{dirty ? "تغییرات ذخیره نشده است." : "بدون تغییر"}</span>
        <Button variant="primary" onClick={save} loading={pending} disabled={!dirty}>ذخیره مجوزها</Button>
      </div>}
    </div>
  );
}
