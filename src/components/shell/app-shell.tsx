"use client";
// پوسته برنامه: وضعیت مشترک، چیدمان انتخابی (نوار ناوبری + نوار بالا) و یک <main> ثابت برای محتوای صفحه
import { ChartTips } from "../charts/chart-tips";
import { CommandPalette } from "./command-palette";
import { LayoutChrome, LayoutTopbar } from "./layouts";
import { ShellProvider, type ShellInit } from "./shell-context";

export function AppShell({ init, children }: { init: ShellInit; children: React.ReactNode }) {
  return (
    <ShellProvider init={init}>
      <a href="#main" className="skip-link">پرش به محتوا</a>
      <LayoutChrome />
      <div className="shell-body">
        <LayoutTopbar />
        <main id="main" className="shell-main">{children}</main>
      </div>
      <CommandPalette />
      <ChartTips />
    </ShellProvider>
  );
}
