// src/pages/AdminPage.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface AuditEntry {
  id: string;
  user_id?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  created_at: string;
}

const tabs = ["OVERVIEW", "AUDIT LOG", "SYSTEM"] as const;
type AdminTab = typeof tabs[number];

export function AdminPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("OVERVIEW");
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [caseCount, setCaseCount] = useState<number | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (activeTab === "AUDIT LOG") loadAuditLogs();
  }, [activeTab]);

  const loadStats = async () => {
    const [{ count: uc }, { count: cc }] = await Promise.all([
      supabase.from("user_profiles").select("id", { count: "exact", head: true }),
      supabase.from("cases").select("id", { count: "exact", head: true }),
    ]);
    setUserCount(uc ?? 0);
    setCaseCount(cc ?? 0);
  };

  const loadAuditLogs = async () => {
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error) setAuditLogs(data ?? []);
    setLoadingLogs(false);
  };

  const logAction = async (action: string) => {
    if (!user) return;
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action,
      resource_type: "SYSTEM",
    });
    toast.success(`Action logged: ${action}`);
    if (activeTab === "AUDIT LOG") loadAuditLogs();
  };

  const systemHealthItems = [
    { name: "Database Connection", status: "OPERATIONAL", color: "#10b981" },
    { name: "Authentication Service", status: "OPERATIONAL", color: "#10b981" },
    { name: "Entity Stream Engine", status: "OPERATIONAL", color: "#10b981" },
    { name: "Threat Assessor", status: "OPERATIONAL", color: "#10b981" },
    { name: "Alert Pipeline", status: "DEGRADED", color: "#f59e0b" },
    { name: "SIGINT Collector", status: "OPERATIONAL", color: "#10b981" },
    { name: "Orbital TLE Feed", status: "OPERATIONAL", color: "#10b981" },
    { name: "Case Management DB", status: "OPERATIONAL", color: "#10b981" },
  ];

  return (
    <div className="flex flex-col h-full bg-sx-bg overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-sx-border px-6 py-3 flex items-center justify-between" style={{ background: "#0d1424" }}>
        <div>
          <div className="font-display font-bold text-sx-cyan tracking-widest">ADMIN CONSOLE</div>
          <div className="font-mono text-[9px] text-sx-text-muted">SYSTEM MANAGEMENT // AUDIT // CONFIGURATION</div>
        </div>
        {user && (
          <div className="font-mono text-[9px] text-sx-amber border border-sx-amber/30 bg-sx-amber/10 px-2 py-1 rounded">
            ⚠ ADMIN ACCESS · {user.role}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 border-b border-sx-border px-4 py-2 flex gap-1" style={{ background: "#0a0f1e" }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-3 py-1.5 rounded font-mono text-[10px] uppercase tracking-wider transition-all"
            style={{
              background: activeTab === tab ? "rgba(0,212,255,0.12)" : "transparent",
              color: activeTab === tab ? "#00d4ff" : "#475569",
              border: activeTab === tab ? "1px solid rgba(0,212,255,0.25)" : "1px solid transparent",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "OVERVIEW" && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "REGISTERED OPERATORS", value: userCount ?? "…", color: "#00d4ff" },
                { label: "OPEN INVESTIGATIONS", value: caseCount ?? "…", color: "#a855f7" },
                { label: "CONFIGURED WORKSPACES", value: "—", color: "#10b981" },
                { label: "SYSTEM UPTIME", value: "99.8%", color: "#f59e0b" },
              ].map((stat) => (
                <div key={stat.label} className="rounded border border-sx-border-dim bg-sx-panel p-4">
                  <div className="font-mono text-3xl font-bold mb-1" style={{ color: stat.color }}>{String(stat.value)}</div>
                  <div className="font-mono text-[9px] text-sx-text-muted">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
              <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">QUICK ACTIONS</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "FLUSH CACHE", action: "CACHE_FLUSH" },
                  { label: "ROTATE KEYS", action: "KEY_ROTATION" },
                  { label: "EXPORT AUDIT LOG", action: "AUDIT_EXPORT" },
                  { label: "FORCE SYNC", action: "FORCE_SYNC" },
                  { label: "TEST ALERT PIPELINE", action: "ALERT_TEST" },
                ].map(({ label, action }) => (
                  <button
                    key={action}
                    onClick={() => logAction(action)}
                    className="px-3 py-1.5 rounded font-mono text-[9px] uppercase tracking-wider transition-all"
                    style={{
                      background: "#080e1a",
                      border: "1px solid #1e3a5f",
                      color: "#94a3b8",
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLElement).style.borderColor = "#00d4ff40";
                      (e.target as HTMLElement).style.color = "#00d4ff";
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.borderColor = "#1e3a5f";
                      (e.target as HTMLElement).style.color = "#94a3b8";
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Session info */}
            <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
              <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">CURRENT SESSION</div>
              <div className="grid grid-cols-2 gap-3">
                {user ? [
                  ["OPERATOR ID", user.id.slice(0, 8) + "..."],
                  ["USERNAME", user.username.toUpperCase()],
                  ["ROLE", user.role],
                  ["CLEARANCE", user.clearance],
                  ["EMAIL", user.email],
                  ["UNIT", user.unit ?? "SENTCOM"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[9px] text-sx-text-muted">{k}</span>
                    <span className="font-mono text-[9px] text-sx-text">{v}</span>
                  </div>
                )) : (
                  <div className="col-span-2 font-mono text-[10px] text-sx-text-muted">
                    NOT AUTHENTICATED — ADMIN FUNCTIONS RESTRICTED
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "AUDIT LOG" && (
          <div className="rounded border border-sx-border-dim bg-sx-panel overflow-hidden">
            <div className="px-4 py-2 border-b border-sx-border-dim bg-sx-surface flex items-center justify-between">
              <span className="font-mono text-[10px] text-sx-text-muted tracking-widest">AUDIT LOG</span>
              <button onClick={loadAuditLogs} className="font-mono text-[9px] text-sx-cyan">REFRESH</button>
            </div>
            {loadingLogs ? (
              <div className="p-8 text-center font-mono text-[10px] text-sx-text-muted">LOADING...</div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center font-mono text-[10px] text-sx-text-muted">NO AUDIT ENTRIES FOUND</div>
            ) : (
              <div className="divide-y divide-sx-border-dim">
                {auditLogs.map((entry) => (
                  <div key={entry.id} className="px-4 py-2 flex items-center gap-4">
                    <span className="font-mono text-[8px] text-sx-text-muted flex-shrink-0 w-20">
                      {new Date(entry.created_at).toUTCString().split(" ")[4]}Z
                    </span>
                    <span className="font-mono text-[10px] text-sx-cyan font-bold flex-1">{entry.action}</span>
                    <span className="font-mono text-[9px] text-sx-text-muted">{entry.resource_type ?? "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "SYSTEM" && (
          <div className="space-y-4">
            <div className="rounded border border-sx-border-dim bg-sx-panel overflow-hidden">
              <div className="px-4 py-2 border-b border-sx-border-dim bg-sx-surface">
                <span className="font-mono text-[10px] text-sx-text-muted tracking-widest">SYSTEM HEALTH</span>
              </div>
              <div className="divide-y divide-sx-border-dim">
                {systemHealthItems.map((item) => (
                  <div key={item.name} className="px-4 py-2.5 flex items-center justify-between">
                    <span className="font-mono text-[10px] text-sx-text">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: item.color, boxShadow: `0 0 4px ${item.color}` }} />
                      <span className="font-mono text-[9px]" style={{ color: item.color }}>{item.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded border border-sx-border-dim bg-sx-panel p-4 font-mono text-[9px] text-sx-text-muted space-y-1">
              <div>PLATFORM: SENTINEL-X v6.3</div>
              <div>BACKEND: ONSPACE CLOUD (Supabase-compatible)</div>
              <div>FRONTEND: React 18 + TypeScript + Tailwind CSS</div>
              <div>MAP ENGINE: Leaflet v1.9.4 + WGS-84</div>
              <div>DATA ENGINE: Synthetic OSINT Simulation (9 Domains)</div>
              <div>AUTH: OTP + Password · SENTCOM-IAM</div>
              <div>DATABASE: PostgreSQL + Row Level Security</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
