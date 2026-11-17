import type { PermissionKey } from "@/lib/permissions";

export interface NavItem { href: string; label: string; icon: string; perm?: PermissionKey; badge?: "cartable" | "tasks" | "messages" | "deadlines" | "reviews" }
export interface NavGroup { title: string; icon: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    title: "میز کار",
    icon: "BriefcaseBusiness",
    items: [
      { href: "/", label: "پیشخوان", icon: "LayoutDashboard" },
      { href: "/cartable", label: "کارتابل", icon: "Inbox", perm: "correspondence.view", badge: "cartable" },
      { href: "/tasks", label: "وظایف", icon: "ListChecks", perm: "task.view", badge: "tasks" },
      { href: "/deadlines", label: "مهلت‌ها", icon: "AlarmClock", perm: "deadline.view", badge: "deadlines" },
      { href: "/calendar", label: "تقویم", icon: "CalendarDays", perm: "calendar.view" },
      { href: "/messages", label: "پیام‌ها", icon: "MessagesSquare", perm: "message.send", badge: "messages" },
    ],
  },
  {
    title: "پرونده‌ها و اسناد",
    icon: "FolderKanban",
    items: [
      { href: "/clients", label: "مراجعان", icon: "Users", perm: "client.view" },
      { href: "/cases", label: "پرونده‌ها", icon: "FolderOpen", perm: "case.view" },
      { href: "/documents", label: "اسناد و بایگانی", icon: "Files", perm: "document.view" },
    ],
  },
  {
    title: "کارگاه حقوقی",
    icon: "Landmark",
    items: [
      { href: "/drafts", label: "اسناد حقوقی", icon: "PenLine", perm: "draft.view", badge: "reviews" },
      { href: "/templates", label: "قالب‌ها", icon: "LayoutTemplate", perm: "template.view" },
      { href: "/assistant", label: "دستیار هوشمند", icon: "Sparkles", perm: "ai.use" },
      { href: "/skills", label: "مهارت‌های حقوقی", icon: "Scale", perm: "skill.run" },
      { href: "/research", label: "پژوهش و منابع", icon: "BookOpenText", perm: "research.use" },
    ],
  },
  {
    title: "مدیریت",
    icon: "SlidersHorizontal",
    items: [
      { href: "/reports", label: "گزارش‌ها", icon: "ChartNoAxesColumn", perm: "report.view" },
      { href: "/admin/users", label: "کارمندان", icon: "UserCog", perm: "user.manage" },
      { href: "/admin/roles", label: "نقش‌ها و مجوزها", icon: "ShieldCheck", perm: "role.manage" },
      { href: "/admin/audit", label: "تاریخچه فعالیت‌ها", icon: "History", perm: "audit.view" },
      { href: "/admin/automation", label: "اتوماسیون", icon: "Workflow", perm: "automation.manage" },
      { href: "/admin/settings", label: "تنظیمات دفتر", icon: "Settings", perm: "settings.manage" },
      { href: "/admin/ai", label: "هوش مصنوعی", icon: "BrainCircuit", perm: "ai.configure" },
      { href: "/admin/backup", label: "پشتیبان‌گیری", icon: "DatabaseBackup", perm: "backup.manage" },
    ],
  },
];
