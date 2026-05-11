// src/components/layout/AppShell.tsx
// Outer application shell — persistent nav + content router
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { NavSidebar } from "@/components/layout/NavSidebar";
import { useAuth } from "@/hooks/useAuth";

export function AppShell() {
  const [navCollapsed, setNavCollapsed] = useState(false);
  const { user } = useAuth();

  // Expose collapse toggle via a data attribute so TopBar hamburger can call it
  return (
    <div className="flex w-screen h-screen overflow-hidden bg-sx-bg">
      {/* Left nav sidebar */}
      <NavSidebar collapsed={navCollapsed} onToggle={() => setNavCollapsed((v) => !v)} />

      {/* Main content area — each child page fills this */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        {/* Operator badge absolute top-right on non-dashboard pages */}
        {user && (
          <div
            className="absolute top-2 right-3 z-50 flex items-center gap-2 px-2 py-1 rounded pointer-events-none select-none"
            style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.1)" }}
          >
            <div
              className="w-5 h-5 rounded-sm flex items-center justify-center text-[9px] font-bold"
              style={{ background: user.avatarColor + "20", color: user.avatarColor }}
            >
              {user.username.slice(0, 2).toUpperCase()}
            </div>
            <span className="font-mono text-[9px]" style={{ color: "#334155" }}>
              {user.username.toUpperCase()} · {user.clearance}
            </span>
          </div>
        )}

        <Outlet context={{ navCollapsed, toggleNav: () => setNavCollapsed((v) => !v) }} />
      </div>
    </div>
  );
}
