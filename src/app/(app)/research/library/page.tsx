import { Globe, Library, Plus } from "lucide-react";
import { SourceCard } from "@/components/research/source-card";
import { FilterBar } from "@/components/ui/filter-bar";
import { FormDialog } from "@/components/ui/form-dialog";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/ui/page";
import { can, requirePagePerm } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { SOURCE_STATUS } from "@/lib/labels";
import { faNum } from "@/lib/text";
import { getConnector, legalWebConfig } from "@/server/connectors";
import { SOURCE_KINDS, searchLibrary } from "@/server/legal-library";
import { importFromUrlAction, saveLegalSourceAction } from "../actions";
import { SOURCE_FIELDS } from "./fields";

export const metadata = { title: "کتابخانه منابع حقوقی" };

const LIMIT = 50;
const YES_NO = [{ value: "1", label: "تأییدشده" }, { value: "0", label: "تأییدنشده" }];
const ORIGINS = [{ value: "law" as const, label: "مواد قوانین واردشده" }, { value: "manual" as const, label: "ثبت‌شده در دفتر" }];

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePerm("research.use");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const verified = sp.verified === undefined ? undefined : sp.verified === "1";
  const origin = ORIGINS.find((o) => o.value === sp.origin)?.value;
  const [rows, legalWeb, manualCount] = await Promise.all([
    searchLibrary(q, { kind: sp.kind, status: sp.status, verified, origin, take: LIMIT }),
    getConnector("legal_web"),
    db.legalSource.count({ where: { lawCode: null } }),
  ]);
  const manage = can(user, "legal_source.manage");
  const domains = legalWeb ? legalWebConfig(legalWeb.config).domains : [];
  return (
    <>
      <PageHeader title="کتابخانه منابع حقوقی" crumbs={[{ label: "پژوهش و منابع", href: "/research" }, { label: "کتابخانه" }]}
        subtitle={`مواد قوانین واردشده و ${faNum(manualCount)} منبع ثبت‌شده در دفتر (رأی وحدت رویه، نظریه مشورتی، بخشنامه و …)`}
        actions={manage && <>
          {legalWeb?.enabled && domains.length > 0 && (
            <FormDialog trigger="ورود از نشانی وب" triggerVariant="secondary" icon={<Globe />} title="ورود متن از نشانی وب" action={importFromUrlAction} cols={1}
              successMessage="متن صفحه به‌عنوان منبع تأییدنشده ثبت شد." successHref="/research/library/{id}"
              fields={[{ name: "url", label: "نشانی صفحه", required: true, ltr: true, placeholder: "https://…", hint: `فقط دامنه‌های مجاز: ${domains.join("، ")}` }]} />
          )}
          <FormDialog trigger="منبع جدید" icon={<Plus />} title="ثبت منبع در کتابخانه" action={saveLegalSourceAction} successMessage="منبع ثبت شد (تأییدنشده)."
            successHref="/research/library/{id}" fields={SOURCE_FIELDS} initial={{ kind: "UNIFORM_PRECEDENT", status: "VALID" }} />
        </>} />
      <div className="mb-4">
        <FilterBar searchPlaceholder="جست‌وجو در عنوان، متن، مرجع یا شماره ماده…" filters={[
          { name: "kind", label: "نوع", options: Object.entries(SOURCE_KINDS).map(([value, label]) => ({ value, label })) },
          { name: "status", label: "وضعیت", options: Object.entries(SOURCE_STATUS).map(([value, m]) => ({ value, label: m.label })) },
          { name: "verified", label: "تأیید", options: YES_NO },
          { name: "origin", label: "خاستگاه", options: ORIGINS },
        ]} />
      </div>
      <Panel title={`منابع (${faNum(rows.length)})`} icon={<Library />}>
        {rows.length === 0
          ? <EmptyState icon={<Library />} title="منبعی پیدا نشد" hint={manage ? "با «منبع جدید» رأی، نظریه یا بخشنامه‌ای را با نشانی منبع رسمی ثبت کنید." : undefined} />
          : <div className="flex flex-col gap-3">{rows.map((r) => <SourceCard key={r.id} s={r} snippet={q ? r.snippet : undefined} showHeading />)}</div>}
        {rows.length === LIMIT && <p className="mt-3 text-xs text-ink-3">فقط {faNum(LIMIT)} نتیجه نخست نمایش داده شده است؛ جست‌وجو یا فیلتر را دقیق‌تر کنید.</p>}
      </Panel>
      <div className="mt-4"><Notice tone="info">هر منبع تا وقتی کاربر مجاز آن را با منبع رسمی تطبیق ندهد «تأییدنشده» است و هر ویرایش متن، تأیید را باطل می‌کند. هیچ متن قانونی به‌صورت خودکار ساخته نمی‌شود.</Notice></div>
    </>
  );
}
