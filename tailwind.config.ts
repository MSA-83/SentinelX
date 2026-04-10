import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["Share Tech Mono", "JetBrains Mono", "Consolas", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Rajdhani", "Inter", "sans-serif"],
      },
      colors: {
        // Sentinel design tokens
        "sx-bg": "#020617",
        "sx-surface": "#0a0f1e",
        "sx-panel": "#0d1424",
        "sx-border": "#1e3a5f",
        "sx-border-dim": "#0f2040",
        "sx-cyan": "#00d4ff",
        "sx-cyan-dim": "#0ea5e9",
        "sx-cyan-dark": "#0369a1",
        "sx-amber": "#f59e0b",
        "sx-amber-dim": "#d97706",
        "sx-red": "#ef4444",
        "sx-red-dim": "#dc2626",
        "sx-green": "#10b981",
        "sx-green-dim": "#059669",
        "sx-purple": "#a855f7",
        "sx-text": "#e2e8f0",
        "sx-text-dim": "#94a3b8",
        "sx-text-muted": "#475569",
      },
      backgroundImage: {
        "grid-pattern": "linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)",
        "scanline": "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
        "hud-glow": "radial-gradient(ellipse at center, rgba(0,212,255,0.08) 0%, transparent 70%)",
      },
      backgroundSize: {
        "grid": "32px 32px",
      },
      boxShadow: {
        "sx-glow": "0 0 20px rgba(0,212,255,0.15), 0 0 40px rgba(0,212,255,0.05)",
        "sx-glow-sm": "0 0 8px rgba(0,212,255,0.2)",
        "sx-amber": "0 0 12px rgba(245,158,11,0.3)",
        "sx-red": "0 0 12px rgba(239,68,68,0.4)",
        "sx-panel": "0 0 0 1px rgba(30,58,95,0.8), 0 4px 24px rgba(0,0,0,0.6)",
        "sx-inner": "inset 0 1px 0 rgba(0,212,255,0.08)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "ping-slow": "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite",
        "scan": "scan 8s linear infinite",
        "blink": "blink 1s step-end infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "slide-in-left": "slideInLeft 0.3s ease-out",
        "matrix-rain": "matrixRain 20s linear infinite",
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
