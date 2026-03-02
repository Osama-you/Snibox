import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
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
        surface: "hsl(220, 14%, 96%)",
        border: "hsl(220, 13%, 91%)",
        "text-primary": "hsl(220, 20%, 14%)",
        "text-secondary": "hsl(220, 10%, 46%)",
        "text-subtle": "hsl(220, 8%, 62%)",
        accent: "hsl(220, 90%, 56%)",
        "accent-hover": "hsl(220, 90%, 50%)",
        pin: "hsl(45, 93%, 58%)",
        "tag-bg": "hsl(220, 14%, 93%)",
        danger: "hsl(0, 72%, 51%)",
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
          "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
        toast: "0 4px 16px rgba(0,0,0,0.10)",
        dropdown: "0 4px 12px rgba(0,0,0,0.08)",
      },
      fontSize: {
        "snippet-title": ["14px", { lineHeight: "20px", fontWeight: "600" }],
        "snippet-body": ["13px", { lineHeight: "18px", fontWeight: "400" }],
        "snippet-meta": ["11px", { lineHeight: "16px", fontWeight: "500" }],
        "search-input": ["15px", { lineHeight: "20px", fontWeight: "400" }],
        "editor-title": ["16px", { lineHeight: "24px", fontWeight: "600" }],
        "editor-content": ["14px", { lineHeight: "22px", fontWeight: "400" }],
      },
      animation: {
        "fade-in": "fadeIn 150ms ease-out",
        "slide-up": "slideUp 200ms ease-out",
        "scale-in": "scaleIn 120ms ease-out",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
