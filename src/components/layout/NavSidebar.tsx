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
  { path: "/",            label: "Global Watch",        shortLabel: "MAP",    icon: "⊕" },
  { path: "/threat",      label: "Threat Intelligence", shortLabel: "THREAT", icon: "◈", badgeColor: "#ef4444" },
  { path: "/assets",      label: "Asset Tracking",      shortLabel: "ASSETS", icon: "⊞" },
  { path: "/timeline",    label: "Timeline Replay",     shortLabel: "TL",     icon: "⏵" },
  { path: "/cases",       label: "Case Management",     shortLabel: "CASES",  icon: "📁" },
  { path: "/analytics",   label: "Analytics",           shortLabel: "ANLYT",  icon: "◱" },
  { path: "/exec",        label: "Executive Summary",   shortLabel: "EXEC",   icon: "◉" },
  { path: "/workspaces",  label: "Workspaces",          shortLabel: "WS",     icon: "⊟" },
  { path: "/admin",       label: "Admin Console",       shortLabel: "ADMIN",  icon: "⚙" },
];

interface NavSidebarProps {
  collapsed: boolean;
}

export function NavSidebar({ collapsed }: NavSidebarProps) {
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
                {/* Active indicator bar */}
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
            <div className="font-mono text-[9px] font-bold truncate" style={{ color: "#00d4ff" }}>
              {user.username.toUpperCase()}
            </div>
            <div className="font-mono text-[8px] text-sx-text-muted truncate">{user.role}</div>
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
