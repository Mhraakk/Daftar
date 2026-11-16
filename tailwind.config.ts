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
      borderRadius: { sm: "4px", DEFAULT: "6px", md: "8px", lg: "10px", xl: "14px" },
      boxShadow: {
        raised: "0 1px 0 rgb(var(--line) / 0.9), 0 1px 2px rgb(24 34 43 / 0.04)",
        pop: "0 12px 32px -8px rgb(24 34 43 / 0.22), 0 2px 6px rgb(24 34 43 / 0.08)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "rise-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "slide-in": { from: { transform: "translateX(100%)" }, to: { transform: "none" } },
      },
      animation: {
        "fade-in": "fade-in 140ms ease-out",
        "rise-in": "rise-in 180ms cubic-bezier(.2,.8,.2,1)",
        "slide-in": "slide-in 220ms cubic-bezier(.2,.8,.2,1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
