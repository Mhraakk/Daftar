import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { NAV } from "@/components/shell/nav";
import { ToastProvider } from "@/components/ui/toast";
import { requireUser } from "@/lib/auth/guard";
import { formatJalali } from "@/lib/jalali";
import { getOffice } from "@/server/admin";
import { listRecents, shellBadges } from "@/server/shell";
import { resolveUi } from "@/theme/prefs";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const path = (await headers()).get("x-pathname") ?? "";
  if (user.mustChangePassword && !path.startsWith("/account")) redirect("/account?first=1");

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || user.permissions.has(i.perm)) })).filter((g) => g.items.length);
  const now = new Date();
  const [badges, recents, ui, office] = await Promise.all([shellBadges(user, now), listRecents(user), resolveUi(user.id), getOffice()]);

  return (
    <ToastProvider>
      <AppShell
        init={{
          layout: ui.layout, skin: ui.skin, userLayout: ui.userLayout, userSkin: ui.userSkin, officeLayout: ui.officeLayout, officeSkin: ui.officeSkin,
          groups, badges, recents, today: formatJalali(now, "long"), officeName: office.officeName,
          user: { fullName: user.fullName, roleName: user.roleName, departmentName: user.departmentName, permissions: [...user.permissions] },
        }}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}
