import { PageHeader, Panel } from "@/components/ui/page";
import { requirePagePerm } from "@/lib/auth/guard";
import { NewClientForm } from "./new-client-form";

export const metadata = { title: "ثبت مراجعه‌کننده" };

export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ then?: string }> }) {
  await requirePagePerm("client.create");
  const thenCase = (await searchParams).then === "case";
  return (
    <>
      <PageHeader title="ثبت مراجعه‌کننده" crumbs={[{ label: "مراجعان", href: "/clients" }, { label: "ثبت جدید" }]}
        subtitle="هنگام ورود کد ملی، تلفن یا نام، سوابق مشابه به‌صورت خودکار جست‌وجو می‌شود." />
      <Panel className="max-w-4xl"><NewClientForm thenCase={thenCase} /></Panel>
    </>
  );
}
