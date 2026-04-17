// src/components/layout/AppShell.tsx
// Outer application shell — persistent nav + content router
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { NavSidebar } from "@/components/layout/NavSidebar";
import { useAuth } from "@/hooks/useAuth";

export function AppShell() {
  const [navCollapsed, setNavCollapsed] = useState(false);
  const { user } = useAuth();

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-sx-bg">
      {/* Left nav sidebar */}
      <NavSidebar collapsed={navCollapsed} />

      {/* Main content area — each child page fills this */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        {/* Collapse toggle */}
        <button
          onClick={() => setNavCollapsed((v) => !v)}
          className="absolute top-2 left-2 z-50 w-6 h-6 flex items-center justify-center rounded text-sx-text-muted hover:text-sx-cyan transition-colors"
          title="Toggle navigation"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect y="1" width="14" height="1.5" rx="1" />
            <rect y="6.25" width="14" height="1.5" rx="1" />
            <rect y="11.5" width="14" height="1.5" rx="1" />
          </svg>
        </button>

        {/* Operator badge top-right */}
        {user && (
          <div
            className="absolute top-2 right-3 z-50 flex items-center gap-2 px-2 py-1 rounded"
            style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.12)" }}
          >
            <div
              className="w-5 h-5 rounded-sm flex items-center justify-center text-[9px] font-bold"
              style={{ background: user.avatarColor + "20", color: user.avatarColor }}
            >
              {user.username.slice(0, 2).toUpperCase()}
            </div>
            <span className="font-mono text-[9px]" style={{ color: "#475569" }}>
              {user.username.toUpperCase()} · {user.clearance}
            </span>
          </div>
        )}

        <Outlet />
      </div>
    </div>
  );
}
