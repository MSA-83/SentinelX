// src/pages/NotFound.tsx
import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-sx-bg">
      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none tactical-grid opacity-50" />
      <div className="relative z-10 text-center space-y-6">
        <div className="font-mono text-[10px] tracking-[0.4em]" style={{ color: "rgba(239,68,68,0.7)" }}>
          ⚠ ROUTE NOT FOUND
        </div>
        <div
          className="font-display font-bold tracking-widest"
          style={{ fontSize: 80, color: "rgba(0,212,255,0.12)", lineHeight: 1 }}
        >
          404
        </div>
        <div className="font-display font-bold text-xl tracking-widest" style={{ color: "#00d4ff" }}>
          NAVIGATION ERROR
        </div>
        <div className="font-mono text-[11px] text-sx-text-muted max-w-xs">
          The requested tactical route does not exist in the operational database.
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded font-mono text-[11px] font-bold tracking-widest uppercase transition-all"
          style={{
            background: "rgba(0,212,255,0.12)",
            border: "1px solid rgba(0,212,255,0.35)",
            color: "#00d4ff",
          }}
        >
          ← RETURN TO GLOBAL WATCH
        </Link>
      </div>
    </div>
  );
}
