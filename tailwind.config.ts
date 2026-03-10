import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          '"Fira Code"',
          '"SF Mono"',
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        bg: "hsl(var(--color-bg) / <alpha-value>)",
        surface: "hsl(var(--color-surface) / <alpha-value>)",
        border: "hsl(var(--color-border) / <alpha-value>)",
        "text-primary": "hsl(var(--color-text-primary) / <alpha-value>)",
        "text-secondary": "hsl(var(--color-text-secondary) / <alpha-value>)",
        "text-subtle": "hsl(var(--color-text-subtle) / <alpha-value>)",
        accent: "hsl(var(--color-accent) / <alpha-value>)",
        "accent-2": "hsl(var(--color-accent-2) / <alpha-value>)",
        "accent-hover": "hsl(var(--color-accent-hover) / <alpha-value>)",
        pin: "hsl(var(--color-pin) / <alpha-value>)",
        "tag-bg": "hsl(var(--color-tag-bg) / <alpha-value>)",
        danger: "hsl(var(--color-danger) / <alpha-value>)",
        "status-ok": "hsl(var(--color-status-ok) / <alpha-value>)",
        "status-warn": "hsl(var(--color-status-warn) / <alpha-value>)",
        "status-busy": "hsl(var(--color-status-busy) / <alpha-value>)",
        "status-error": "hsl(var(--color-status-error) / <alpha-value>)",
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        base: "16px",
        lg: "24px",
        xl: "32px",
      },
      borderRadius: {
        input: "8px",
        window: "12px",
        chip: "6px",
        btn: "8px",
        toast: "10px",
        modal: "12px",
      },
      boxShadow: {
        window:
          "0 8px 30px rgba(0,0,0,0.10), 0 1px 6px rgba(0,0,0,0.04)",
        toast: "0 4px 16px rgba(0,0,0,0.10)",
        dropdown: "0 4px 12px rgba(0,0,0,0.08)",
      },
      fontSize: {
        "snippet-title": ["13px", { lineHeight: "18px", fontWeight: "500" }],
        "snippet-body": ["12px", { lineHeight: "16px", fontWeight: "400" }],
        "snippet-meta": ["11px", { lineHeight: "14px", fontWeight: "500" }],
        "search-input": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "editor-title": ["15px", { lineHeight: "22px", fontWeight: "600" }],
        "editor-content": ["13px", { lineHeight: "20px", fontWeight: "400" }],
      },
      animation: {
        "fade-in": "fadeIn 120ms ease-out",
        "slide-up": "slideUp 150ms ease-out",
        "scale-in": "scaleIn 100ms ease-out",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.98)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
