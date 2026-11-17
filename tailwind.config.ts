import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: v("paper"), surface: v("surface"), "surface-2": v("surface-2"),
        line: v("line"), "line-strong": v("line-strong"),
        ink: { DEFAULT: v("ink"), 2: v("ink-2"), 3: v("ink-3") },
        lapis: { DEFAULT: v("lapis"), 600: v("lapis-600"), 50: v("lapis-50") },
        firuze: { DEFAULT: v("firuze"), 50: v("firuze-50") },
        mohr: { DEFAULT: v("mohr"), 50: v("mohr-50") },
        zafaran: { DEFAULT: v("zafaran"), 50: v("zafaran-50") },
        sabz: { DEFAULT: v("sabz"), 50: v("sabz-50") },
        night: { DEFAULT: v("night"), 2: v("night-2") },
        "on-lapis": v("on-lapis"), "on-firuze": v("on-firuze"), "on-mohr": v("on-mohr"), "on-night": v("on-night"),
        chrome: { DEFAULT: v("chrome"), 2: v("chrome-2"), ink: v("chrome-ink"), "ink-2": v("chrome-ink-2"), line: v("chrome-line"), active: v("chrome-active"), "active-ink": v("chrome-active-ink") },
        chart: { 1: v("chart-1"), 2: v("chart-2"), 3: v("chart-3"), 4: v("chart-4"), 5: v("chart-5"), 6: v("chart-6"), pos: v("chart-pos"), neg: v("chart-neg"), grid: v("chart-grid"), axis: v("chart-axis"), prev: v("chart-prev") },
        scrim: v("scrim"),
        sheet: v("sheet"),
      },
      fontFamily: { sans: ["var(--font-vazir)", "Vazirmatn", "Tahoma", "sans-serif"] },
      fontSize: {
        "2xs": ["0.6875rem", "1rem"],
        xs: ["0.75rem", "1.125rem"],
        sm: ["0.8125rem", "1.375rem"],
        base: ["0.875rem", "1.5rem"],
        md: ["0.9375rem", "1.625rem"],
        lg: ["1.0625rem", "1.75rem"],
        xl: ["1.25rem", "1.875rem"],
        "2xl": ["1.5rem", "2.125rem"],
        "3xl": ["1.875rem", "2.5rem"],
      },
      borderRadius: { sm: "4px", DEFAULT: "6px", md: "8px", lg: "10px", xl: "14px", card: "var(--radius-card)", ctl: "var(--radius-ctl)" },
      boxShadow: {
        raised: "0 1px 2px rgb(var(--shadow) / calc(var(--shadow-alpha) * 0.5)), 0 10px 28px -16px rgb(var(--shadow) / var(--shadow-alpha))",
        pop: "0 24px 60px -20px rgb(var(--shadow) / calc(var(--shadow-alpha) + 0.15)), 0 2px 8px rgb(var(--shadow) / calc(var(--shadow-alpha) * 0.6))",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "rise-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "slide-in": { from: { transform: "translateX(100%)" }, to: { transform: "none" } },
        "sheet-up": { from: { transform: "translateY(100%)" }, to: { transform: "none" } },
      },
      animation: {
        "fade-in": "fade-in 140ms ease-out",
        "rise-in": "rise-in 180ms cubic-bezier(.2,.8,.2,1)",
        "slide-in": "slide-in 220ms cubic-bezier(.2,.8,.2,1)",
        "sheet-up": "sheet-up 320ms var(--ease-spring)",
      },
    },
  },
  plugins: [],
} satisfies Config;
