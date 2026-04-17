// src/pages/NotFound.tsx
import { useNavigate } from "react-router-dom";

export function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-full bg-sx-bg space-y-6">
      <div className="font-mono text-8xl font-bold" style={{ color: "#ef4444", textShadow: "0 0 40px rgba(239,68,68,0.4)" }}>404</div>
      <div className="font-display font-bold text-2xl text-sx-cyan tracking-widest">ROUTE NOT FOUND</div>
      <div className="font-mono text-sm text-sx-text-muted">SENTINEL-X // NAVIGATION ERROR // CHECK COORDINATES</div>
      <button
        onClick={() => navigate("/")}
        className="mt-4 font-mono text-sm border px-6 py-2 rounded transition-all"
        style={{ borderColor: "rgba(0,212,255,0.4)", color: "#00d4ff", background: "rgba(0,212,255,0.05)" }}
        onMouseEnter={(e) => ((e.target as HTMLElement).style.background = "rgba(0,212,255,0.12)")}
        onMouseLeave={(e) => ((e.target as HTMLElement).style.background = "rgba(0,212,255,0.05)")}
      >
        ← RETURN TO OPERATIONS CENTER
      </button>
    </div>
  );
}
