import { PageHeader } from "@/components/ui/page";
import { requirePagePerm } from "@/lib/auth/guard";
import { NewTemplateForm } from "../template-form";

export const metadata = { title: "قالب جدید" };

export default async function NewTemplatePage() {
  await requirePagePerm("template.manage");
  return (
    <>
      <PageHeader title="قالب جدید" crumbs={[{ label: "قالب‌ها", href: "/templates" }, { label: "جدید" }]}
        subtitle="متن را بنویسید یا از فایل Word/PDF درون‌ریزی کنید؛ بخش‌های متغیر را با «{{نام فیلد}}» مشخص کنید." />
      <NewTemplateForm />
    </>
  );
}
