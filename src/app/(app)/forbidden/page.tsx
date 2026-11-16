import { ShieldX } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";

export const metadata = { title: "دسترسی غیرمجاز" };
export default function Forbidden() {
  return (
    <div className="panel mx-auto mt-10 max-w-lg">
      <EmptyState icon={<ShieldX />} title="شما به این بخش دسترسی ندارید" hint="اگر برای انجام کارتان به این بخش نیاز دارید، از مدیر سامانه بخواهید مجوز لازم را به نقش شما اضافه کند."
        action={<LinkButton href="/" variant="primary">بازگشت به پیشخوان</LinkButton>} />
    </div>
  );
}
