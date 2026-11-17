// نگاشت صریح نام نماد → مؤلفه (به‌جای بارگذاری کل مجموعه نمادها در مرورگر)
import {
  AlarmClock, BookOpenText, BrainCircuit, BriefcaseBusiness, CalendarDays, ChartNoAxesColumn, Circle, DatabaseBackup, FileSignature, Files, FolderKanban, FolderOpen,
  History, Inbox, Landmark, LayoutDashboard, LayoutTemplate, ListChecks, MessagesSquare, PenLine, Scale, ScrollText, Settings, ShieldCheck,
  SlidersHorizontal, Sparkles, UserCog, Users, Workflow, type LucideIcon,
} from "lucide-react";

export const NAV_ICONS: Record<string, LucideIcon> = {
  AlarmClock, BookOpenText, BrainCircuit, BriefcaseBusiness, CalendarDays, ChartNoAxesColumn, DatabaseBackup, FileSignature, Files, FolderKanban, FolderOpen,
  History, Inbox, Landmark, LayoutDashboard, LayoutTemplate, ListChecks, MessagesSquare, PenLine, Scale, ScrollText, Settings, ShieldCheck,
  SlidersHorizontal, Sparkles, UserCog, Users, Workflow,
};

export const iconOf = (name: string): LucideIcon => NAV_ICONS[name] ?? Circle;
