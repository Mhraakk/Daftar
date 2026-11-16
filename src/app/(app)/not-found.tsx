import { SearchX } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";

export default function NotFound() {
  return (
    <div className="panel mx-auto mt-10 max-w-lg">
      <EmptyState icon={<SearchX />} title="رکورد مورد نظر یافت نشد" hint="ممکن است این رکورد حذف شده باشد یا در محدوده دسترسی شما نباشد."
        action={<LinkButton href="/" variant="primary">بازگشت به پیشخوان</LinkButton>} />
    </div>
  );
}
