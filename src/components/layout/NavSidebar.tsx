// src/components/layout/NavSidebar.tsx
// Primary navigation sidebar — full platform nav for all views
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { authService } from "@/lib/auth";
import { toast } from "sonner";

interface NavItem {
  path: string;
  label: string;
  shortLabel: string;
  icon: string;
  badge?: string;
  badgeColor?: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: "/",           label: "Global Watch",        shortLabel: "MAP",   icon: "⊕" },
  { path: "/threat",     label: "Threat Intelligence", shortLabel: "THREAT",icon: "◈", badgeColor: "#ef4444" },
  { path: "/assets",     label: "Asset Tracking",      shortLabel: "ASSETS",icon: "⊞" },
  { path: "/timeline",   label: "Timeline Replay",     shortLabel: "TL",    icon: "⏵" },
  { path: "/cases",      label: "Case Management",     shortLabel: "CASES", icon: "📁" },
  { path: "/geofences",  label: "Geofence Manager",    shortLabel: "GEO",   icon: "◯" },
  { path: "/graph",      label: "Knowledge Graph",     shortLabel: "GRAPH", icon: "◉" },
  { path: "/sigint",     label: "SIGINT Spectrum",      shortLabel: "SIGINT",icon: "📡" },
  { path: "/orbital",   label: "3D Orbital Globe",     shortLabel: "ORBIT", icon: "🌍" },
  { path: "/analytics",  label: "Analytics",           shortLabel: "ANLYT", icon: "◱" },
  { path: "/exec",       label: "Executive Summary",   shortLabel: "EXEC",  icon: "★" },
  { path: "/workspaces", label: "Workspaces",          shortLabel: "WS",    icon: "⊟" },
  { path: "/cctv",       label: "CCTV Monitor",        shortLabel: "CCTV",  icon: "📹" },
  { path: "/osint",      label: "OSINT Toolkit",       shortLabel: "OSINT", icon: "🔍", badgeColor: "#10b981" },
  { path: "/admin",      label: "Admin Console",       shortLabel: "ADMIN", icon: "⚙" },
];

interface NavSidebarProps {
  collapsed: boolean;
  onToggle?: () => void;
}

export function NavSidebar({ collapsed, onToggle }: NavSidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await authService.signOut();
      logout();
      navigate("/login");
    } catch {
      toast.error("Logout failed");
    }
  };

  return (
    <div
      className="flex flex-col flex-shrink-0 border-r border-sx-border bg-sx-surface transition-all duration-200 overflow-hidden"
      style={{ width: collapsed ? 48 : 180, boxShadow: "2px 0 12px rgba(0,0,0,0.4)" }}
    >
      {/* Logo / collapse button */}
      <div
        className="flex-shrink-0 flex items-center border-b border-sx-border"
        style={{ height: 40, paddingInline: collapsed ? 8 : 12 }}
      >
        {collapsed ? (
          <button
            onClick={onToggle}
            className="w-7 h-7 rounded flex items-center justify-center text-[9px] font-bold mx-auto transition-all"
            style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "#00d4ff" }}
            title="Expand navigation"
          >
            SX
          </button>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div>
              <div className="font-display font-bold text-sx-cyan text-xs tracking-[0.2em]">SENTINEL-X</div>
              <div className="font-mono text-[7px] text-sx-text-muted tracking-wider">GLOBAL AWARENESS</div>
            </div>
            {onToggle && (
              <button onClick={onToggle} className="text-sx-text-muted hover:text-sx-cyan transition-colors p-0.5" title="Collapse navigation">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <rect y="1" width="12" height="1.5" rx="0.75" />
                  <rect y="5.25" width="12" height="1.5" rx="0.75" />
                  <rect y="9.5" width="12" height="1.5" rx="0.75" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 mx-1 my-0.5 rounded transition-all group relative ${
                isActive
                  ? "bg-sx-cyan/12 border border-sx-cyan/25 text-sx-cyan"
                  : "border border-transparent text-sx-text-muted hover:text-sx-text hover:bg-sx-panel"
              }`
            }
            title={collapsed ? item.label : undefined}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <div
                    className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r"
                    style={{ background: "#00d4ff", boxShadow: "0 0 6px #00d4ff" }}
                  />
                )}
                <span className="text-base flex-shrink-0 w-5 text-center">{item.icon}</span>
                {!collapsed && (
                  <span className="font-mono text-[10px] tracking-wider uppercase truncate flex-1">
                    {item.shortLabel}
                  </span>
                )}
                {!collapsed && item.badge && (
                  <span
                    className="font-mono text-[8px] px-1 py-0.5 rounded font-bold"
                    style={{
                      background: `${item.badgeColor}20`,
                      color: item.badgeColor,
                      border: `1px solid ${item.badgeColor}40`,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-sx-border p-2 flex-shrink-0">
        {user && !collapsed && (
          <div className="px-2 py-1.5 mb-1 rounded" style={{ background: "#080e1a" }}>
            <div className="flex items-center gap-1.5">
              <div
                className="w-4 h-4 rounded-sm flex items-center justify-center text-[7px] font-bold flex-shrink-0"
                style={{ background: `${user.avatarColor}20`, color: user.avatarColor }}
              >
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-mono text-[9px] font-bold truncate" style={{ color: "#00d4ff" }}>
                  {user.username.toUpperCase()}
                </div>
                <div className="font-mono text-[8px] text-sx-text-muted truncate">{user.role} · {user.clearance}</div>
              </div>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded transition-all text-sx-text-muted hover:text-sx-red border border-transparent hover:border-sx-red/20 hover:bg-sx-red/5"
          title="Sign out"
        >
          <span className="text-base flex-shrink-0 w-5 text-center">⏻</span>
          {!collapsed && <span className="font-mono text-[10px] uppercase tracking-wider">SIGN OUT</span>}
        </button>
      </div>
    </div>
  );
}
