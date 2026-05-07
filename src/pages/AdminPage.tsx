// src/pages/AdminPage.tsx
// Admin Console — system overview, audit log, live source health monitor, system info
import { useState, useEffect, useRef, useCallback } from "react";
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

interface SourceHealth {
  id: string;
  name: string;
  domain: string;
  protocol: string;
  endpoint: string;
  status: "LIVE" | "DEGRADED" | "OFFLINE";
  latencyMs: number;
  freshnessScore: number;    // 0–100
  confidenceScore: number;   // 0–100
  entityCount: number;
  lastUpdate: Date;
  errorRate: number;         // 0–100
  messagesPerSec: number;
}

const INITIAL_SOURCES: Omit<SourceHealth, "lastUpdate">[] = [
  { id: "src-adsb",    name: "ADS-B Exchange",      domain: "AVIATION",   protocol: "HTTP/JSON", endpoint: "adsbexchange.com/api",        status: "LIVE",     latencyMs: 42,  freshnessScore: 98, confidenceScore: 95, entityCount: 65, errorRate: 0.2, messagesPerSec: 24 },
  { id: "src-ais",     name: "AISStream",            domain: "MARITIME",   protocol: "WebSocket", endpoint: "stream.aisstream.io",         status: "LIVE",     latencyMs: 78,  freshnessScore: 96, confidenceScore: 90, entityCount: 48, errorRate: 0.5, messagesPerSec: 18 },
  { id: "src-celestrack",name: "CelesTrak TLE",      domain: "ORBITAL",    protocol: "HTTP/TLE",  endpoint: "celestrak.org/SOCRATES",      status: "LIVE",     latencyMs: 120, freshnessScore: 88, confidenceScore: 99, entityCount: 32, errorRate: 0.0, messagesPerSec: 3  },
  { id: "src-acled",   name: "ACLED Conflict DB",    domain: "CONFLICT",   protocol: "REST/JSON", endpoint: "api.acleddata.com/acled",     status: "DEGRADED", latencyMs: 380, freshnessScore: 72, confidenceScore: 78, entityCount: 10, errorRate: 4.2, messagesPerSec: 1  },
  { id: "src-shodan",  name: "Shodan Cyber Intel",   domain: "CYBER",      protocol: "REST/JSON", endpoint: "api.shodan.io/stream",        status: "LIVE",     latencyMs: 95,  freshnessScore: 82, confidenceScore: 72, entityCount: 5,  errorRate: 1.1, messagesPerSec: 4  },
  { id: "src-usgs",    name: "USGS Earthquake Feed", domain: "SEISMIC",    protocol: "HTTP/JSON", endpoint: "earthquake.usgs.gov/fdsnws", status: "LIVE",     latencyMs: 34,  freshnessScore: 99, confidenceScore: 99, entityCount: 8,  errorRate: 0.0, messagesPerSec: 1  },
  { id: "src-nro",     name: "NRO/CTBTO Nuclear",    domain: "NUCLEAR",    protocol: "S/MIME",    endpoint: "ims.ctbto.org/idcnkms",       status: "LIVE",     latencyMs: 210, freshnessScore: 70, confidenceScore: 85, entityCount: 5,  errorRate: 0.0, messagesPerSec: 0  },
  { id: "src-sigint",  name: "SIGINT Collector",     domain: "SIGINT",     protocol: "UDP/RF",    endpoint: "sdrint.sentinel-x.internal",  status: "LIVE",     latencyMs: 18,  freshnessScore: 94, confidenceScore: 68, entityCount: 12, errorRate: 2.3, messagesPerSec: 38 },
  { id: "src-noaa",    name: "NOAA Weather",         domain: "WEATHER",    protocol: "HTTP/JSON", endpoint: "api.weather.gov/gridpoints", status: "LIVE",     latencyMs: 61,  freshnessScore: 92, confidenceScore: 88, entityCount: 5,  errorRate: 0.4, messagesPerSec: 6  },
  { id: "src-sysomos", name: "OSINT Social Signals", domain: "SIGINT",     protocol: "REST/JSON", endpoint: "sigint-gateway.mil.local",   status: "OFFLINE",  latencyMs: 0,   freshnessScore: 0,  confidenceScore: 0,  entityCount: 0,  errorRate: 100, messagesPerSec: 0  },
];

const STATUS_COLOR: Record<string, string> = {
  LIVE:     "#10b981",
  DEGRADED: "#f59e0b",
  OFFLINE:  "#ef4444",
};

const tabs = ["OVERVIEW", "SOURCE HEALTH", "AUDIT LOG", "SYSTEM"] as const;
type AdminTab = typeof tabs[number];

export function AdminPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("OVERVIEW");
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [caseCount, setCaseCount] = useState<number | null>(null);
  const [alertCount, setAlertCount] = useState<number | null>(null);

  // Live source health state
  const [sources, setSources] = useState<SourceHealth[]>(
    INITIAL_SOURCES.map((s) => ({ ...s, lastUpdate: new Date(Date.now() - Math.random() * 30000) }))
  );
  const [lastPoll, setLastPoll] = useState(new Date());
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (activeTab === "AUDIT LOG") loadAuditLogs();
  }, [activeTab]);

  // Source health polling simulation
  useEffect(() => {
    if (activeTab !== "SOURCE HEALTH") return;

    const poll = () => {
      setSources((prev) =>
        prev.map((src) => {
          // Simulate realistic fluctuations
          const latencyJitter = (Math.random() - 0.5) * 30;
          const freshnessDecay = Math.random() < 0.1 ? -2 : 0.5;
          const newLatency = Math.max(0, src.latencyMs + latencyJitter);
          const newFreshness = Math.max(0, Math.min(100, src.freshnessScore + freshnessDecay));
          const msgJitter = (Math.random() - 0.5) * 4;
          const newMsgs = Math.max(0, src.messagesPerSec + msgJitter);

          // Random status transitions
          let newStatus = src.status;
          const r = Math.random();
          if (src.status === "LIVE" && r < 0.04) newStatus = "DEGRADED";
          else if (src.status === "DEGRADED" && r < 0.3) newStatus = "LIVE";
          else if (src.status === "OFFLINE" && r < 0.05) newStatus = "DEGRADED";

          return {
            ...src,
            status: newStatus,
            latencyMs: Math.round(newLatency),
            freshnessScore: Math.round(newFreshness),
            messagesPerSec: parseFloat(newMsgs.toFixed(1)),
            lastUpdate: new Date(),
          };
        })
      );
      setLastPoll(new Date());
    };

    pollRef.current = setInterval(poll, 5000);
    return () => clearInterval(pollRef.current);
  }, [activeTab]);

  const loadStats = async () => {
    const [{ count: uc }, { count: cc }, { count: ac }] = await Promise.all([
      supabase.from("user_profiles").select("id", { count: "exact", head: true }),
      supabase.from("cases").select("id", { count: "exact", head: true }),
      supabase.from("alerts_history").select("id", { count: "exact", head: true }),
    ]);
    setUserCount(uc ?? 0);
    setCaseCount(cc ?? 0);
    setAlertCount(ac ?? 0);
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

  const logAction = useCallback(async (action: string) => {
    if (!user) return;
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action,
      resource_type: "SYSTEM",
    });
    toast.success(`Action logged: ${action}`);
    if (activeTab === "AUDIT LOG") loadAuditLogs();
  }, [user, activeTab]);

  const liveCount = sources.filter((s) => s.status === "LIVE").length;
  const degradedCount = sources.filter((s) => s.status === "DEGRADED").length;
  const offlineCount = sources.filter((s) => s.status === "OFFLINE").length;
  const avgLatency = Math.round(sources.filter((s) => s.status === "LIVE").reduce((a, s) => a + s.latencyMs, 0) / Math.max(1, liveCount));
  const totalMsgs = parseFloat(sources.reduce((a, s) => a + s.messagesPerSec, 0).toFixed(1));

  return (
    <div className="flex flex-col h-full bg-sx-bg overflow-hidden">
      {/* Header */}
      <div
        className="flex-shrink-0 border-b border-sx-border px-6 py-3 flex items-center justify-between"
        style={{ background: "#0d1424" }}
      >
        <div>
          <div className="font-display font-bold text-sx-cyan tracking-widest">ADMIN CONSOLE</div>
          <div className="font-mono text-[9px] text-sx-text-muted">
            SYSTEM MANAGEMENT // SOURCE HEALTH // AUDIT // CONFIGURATION
          </div>
        </div>
        {user && (
          <div className="font-mono text-[9px] text-sx-amber border border-sx-amber/30 bg-sx-amber/10 px-2 py-1 rounded">
            ⚠ ADMIN ACCESS · {user.role}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        className="flex-shrink-0 border-b border-sx-border px-4 py-2 flex gap-1"
        style={{ background: "#0a0f1e" }}
      >
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
            {tab === "SOURCE HEALTH" && degradedCount + offlineCount > 0 && (
              <span
                className="ml-1.5 px-1 py-0.5 rounded text-[8px]"
                style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444" }}
              >
                {degradedCount + offlineCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">

        {/* ── OVERVIEW ── */}
        {activeTab === "OVERVIEW" && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "REGISTERED OPERATORS", value: userCount ?? "…", color: "#00d4ff" },
                { label: "OPEN INVESTIGATIONS",  value: caseCount ?? "…",  color: "#a855f7" },
                { label: "PERSISTED ALERTS",     value: alertCount ?? "…", color: "#ef4444" },
                { label: "SYSTEM UPTIME",        value: "99.8%",           color: "#f59e0b" },
              ].map((stat) => (
                <div key={stat.label} className="rounded border border-sx-border-dim bg-sx-panel p-4">
                  <div className="font-mono text-3xl font-bold mb-1" style={{ color: stat.color }}>
                    {String(stat.value)}
                  </div>
                  <div className="font-mono text-[9px] text-sx-text-muted">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Source overview summary */}
            <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
              <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">DATA SOURCE SUMMARY</div>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "LIVE SOURCES",     value: liveCount,    color: "#10b981" },
                  { label: "DEGRADED",         value: degradedCount, color: "#f59e0b" },
                  { label: "OFFLINE",          value: offlineCount,  color: "#ef4444" },
                  { label: "AVG LATENCY",      value: `${avgLatency}ms`, color: "#00d4ff" },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div className="font-mono text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                    <div className="font-mono text-[8px] text-sx-text-muted">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
              <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">QUICK ACTIONS</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "FLUSH CACHE",            action: "CACHE_FLUSH" },
                  { label: "ROTATE API KEYS",         action: "KEY_ROTATION" },
                  { label: "EXPORT AUDIT LOG",        action: "AUDIT_EXPORT" },
                  { label: "FORCE SOURCE SYNC",       action: "FORCE_SYNC" },
                  { label: "TEST ALERT PIPELINE",     action: "ALERT_TEST" },
                  { label: "REFRESH USER SESSIONS",   action: "SESSION_REFRESH" },
                ].map(({ label, action }) => (
                  <button
                    key={action}
                    onClick={() => logAction(action)}
                    className="px-3 py-1.5 rounded font-mono text-[9px] uppercase tracking-wider transition-all"
                    style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#94a3b8" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "#00d4ff40";
                      (e.currentTarget as HTMLElement).style.color = "#00d4ff";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "#1e3a5f";
                      (e.currentTarget as HTMLElement).style.color = "#94a3b8";
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
                {user ? (
                  [
                    ["OPERATOR ID",  user.id.slice(0, 8) + "…"],
                    ["USERNAME",     user.username.toUpperCase()],
                    ["ROLE",         user.role],
                    ["CLEARANCE",    user.clearance],
                    ["EMAIL",        user.email],
                    ["UNIT",         user.unit ?? "SENTCOM"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[9px] text-sx-text-muted">{k}</span>
                      <span className="font-mono text-[9px] text-sx-text">{v}</span>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 font-mono text-[10px] text-sx-text-muted">
                    NOT AUTHENTICATED — ADMIN FUNCTIONS RESTRICTED
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── SOURCE HEALTH MONITOR ── */}
        {activeTab === "SOURCE HEALTH" && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="rounded border border-sx-border-dim bg-sx-panel p-3 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-5">
                {[
                  { label: "LIVE", value: liveCount, color: "#10b981" },
                  { label: "DEGRADED", value: degradedCount, color: "#f59e0b" },
                  { label: "OFFLINE", value: offlineCount, color: "#ef4444" },
                  { label: "MSG/S", value: totalMsgs, color: "#00d4ff" },
                  { label: "AVG LATENCY", value: `${avgLatency}ms`, color: "#a855f7" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center">
                    <div className="font-mono font-bold text-xl" style={{ color }}>{value}</div>
                    <div className="font-mono text-[8px] text-sx-text-muted">{label}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-sx-green"
                    style={{ animation: "pulse 3s infinite", boxShadow: "0 0 4px #10b981" }}
                  />
                  <span className="font-mono text-[9px] text-sx-green">POLLING EVERY 5s</span>
                </div>
                <span className="font-mono text-[8px] text-sx-text-muted">
                  LAST: {lastPoll.toUTCString().split(" ")[4]}Z
                </span>
              </div>
            </div>

            {/* Source rows */}
            <div className="rounded border border-sx-border-dim bg-sx-panel overflow-hidden">
              {/* Table header */}
              <div
                className="grid px-4 py-2 border-b border-sx-border-dim font-mono text-[8px] text-sx-text-muted tracking-widest"
                style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr 100px" }}
              >
                {["SOURCE", "DOMAIN", "PROTOCOL", "STATUS", "LATENCY", "FRESHNESS", "MSG/S", "LAST UPDATE"].map((h) => (
                  <span key={h}>{h}</span>
                ))}
              </div>

              <div className="divide-y divide-sx-border-dim">
                {sources.map((src) => {
                  const statusColor = STATUS_COLOR[src.status];
                  const secsSince = Math.floor((Date.now() - src.lastUpdate.getTime()) / 1000);
                  return (
                    <div
                      key={src.id}
                      className="grid px-4 py-3 items-center transition-all hover:bg-sx-surface/30"
                      style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr 100px" }}
                    >
                      {/* Name */}
                      <div>
                        <div className="font-mono text-[10px] font-bold text-sx-text">{src.name}</div>
                        <div className="font-mono text-[8px] text-sx-text-muted truncate">{src.endpoint}</div>
                      </div>

                      {/* Domain */}
                      <span className="font-mono text-[9px] text-sx-cyan">{src.domain}</span>

                      {/* Protocol */}
                      <span className="font-mono text-[8px] text-sx-text-muted">{src.protocol}</span>

                      {/* Status badge */}
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{
                            background: statusColor,
                            boxShadow: `0 0 4px ${statusColor}`,
                            animation: src.status === "LIVE" ? "pulse 2s infinite" : "none",
                          }}
                        />
                        <span className="font-mono text-[9px] font-bold" style={{ color: statusColor }}>
                          {src.status}
                        </span>
                      </div>

                      {/* Latency */}
                      <span
                        className="font-mono text-[9px]"
                        style={{
                          color: src.latencyMs > 200 ? "#f59e0b" : src.latencyMs > 400 ? "#ef4444" : "#94a3b8",
                        }}
                      >
                        {src.status === "OFFLINE" ? "—" : `${src.latencyMs}ms`}
                      </span>

                      {/* Freshness bar */}
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-mono text-[8px] text-sx-text-muted">{src.freshnessScore}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-sx-border-dim overflow-hidden w-16">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${src.freshnessScore}%`,
                              background: src.freshnessScore > 85 ? "#10b981" : src.freshnessScore > 60 ? "#f59e0b" : "#ef4444",
                            }}
                          />
                        </div>
                      </div>

                      {/* Messages/s */}
                      <span
                        className="font-mono text-[9px]"
                        style={{ color: src.messagesPerSec > 0 ? "#00d4ff" : "#334155" }}
                      >
                        {src.status === "OFFLINE" ? "—" : `${src.messagesPerSec}/s`}
                      </span>

                      {/* Last update */}
                      <span className="font-mono text-[8px] text-sx-text-muted">
                        {secsSince < 60 ? `${secsSince}s ago` : `${Math.floor(secsSince / 60)}m ago`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Confidence matrix */}
            <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
              <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">SOURCE CONFIDENCE MATRIX</div>
              <div className="space-y-2">
                {sources.filter((s) => s.status !== "OFFLINE").map((src) => (
                  <div key={src.id} className="flex items-center gap-3">
                    <span className="font-mono text-[9px] w-36 text-sx-text-muted truncate">{src.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-sx-border-dim overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${src.confidenceScore}%`,
                          background: `linear-gradient(90deg, #00d4ff, #a855f7)`,
                        }}
                      />
                    </div>
                    <span
                      className="font-mono text-[9px] w-8 text-right"
                      style={{ color: src.confidenceScore > 80 ? "#10b981" : src.confidenceScore > 60 ? "#f59e0b" : "#ef4444" }}
                    >
                      {src.confidenceScore}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── AUDIT LOG ── */}
        {activeTab === "AUDIT LOG" && (
          <div className="rounded border border-sx-border-dim bg-sx-panel overflow-hidden">
            <div
              className="px-4 py-2 border-b border-sx-border-dim bg-sx-surface flex items-center justify-between"
            >
              <span className="font-mono text-[10px] text-sx-text-muted tracking-widest">AUDIT LOG</span>
              <button
                onClick={loadAuditLogs}
                className="font-mono text-[9px] text-sx-cyan hover:text-sx-cyan/70 transition-colors"
              >
                ↻ REFRESH
              </button>
            </div>
            {loadingLogs ? (
              <div className="p-8 text-center font-mono text-[10px] text-sx-text-muted">LOADING…</div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center font-mono text-[10px] text-sx-text-muted">NO AUDIT ENTRIES FOUND</div>
            ) : (
              <div className="divide-y divide-sx-border-dim">
                {auditLogs.map((entry) => (
                  <div key={entry.id} className="px-4 py-2 flex items-center gap-4 hover:bg-sx-surface/30 transition-all">
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

        {/* ── SYSTEM ── */}
        {activeTab === "SYSTEM" && (
          <div className="space-y-4">
            <div className="rounded border border-sx-border-dim bg-sx-panel overflow-hidden">
              <div className="px-4 py-2.5 border-b border-sx-border-dim bg-sx-surface">
                <span className="font-mono text-[10px] text-sx-text-muted tracking-widest">SUBSYSTEM HEALTH</span>
              </div>
              <div className="divide-y divide-sx-border-dim">
                {[
                  { name: "Database Connection",    status: "OPERATIONAL", latency: "14ms",  color: "#10b981" },
                  { name: "Authentication Service", status: "OPERATIONAL", latency: "22ms",  color: "#10b981" },
                  { name: "Entity Stream Engine",   status: "OPERATIONAL", latency: "3ms",   color: "#10b981" },
                  { name: "Threat Assessor",        status: "OPERATIONAL", latency: "1ms",   color: "#10b981" },
                  { name: "Alert Pipeline",         status: "DEGRADED",    latency: "180ms", color: "#f59e0b" },
                  { name: "SIGINT RF Collector",    status: "OPERATIONAL", latency: "18ms",  color: "#10b981" },
                  { name: "Orbital TLE Processor",  status: "OPERATIONAL", latency: "120ms", color: "#10b981" },
                  { name: "Case Management DB",     status: "OPERATIONAL", latency: "8ms",   color: "#10b981" },
                  { name: "Geofence Engine",        status: "OPERATIONAL", latency: "2ms",   color: "#10b981" },
                  { name: "AI Analyst Copilot",     status: "OPERATIONAL", latency: "1.2s",  color: "#10b981" },
                ].map((item) => (
                  <div key={item.name} className="px-4 py-2.5 flex items-center justify-between">
                    <span className="font-mono text-[10px] text-sx-text">{item.name}</span>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-[9px] text-sx-text-muted">{item.latency}</span>
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: item.color, boxShadow: `0 0 4px ${item.color}` }}
                        />
                        <span className="font-mono text-[9px]" style={{ color: item.color }}>{item.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="rounded border border-sx-border-dim p-4 font-mono text-[9px] space-y-1.5"
              style={{ background: "rgba(0,212,255,0.02)" }}
            >
              {[
                ["PLATFORM",    "SENTINEL-X v6.3 // GLOBAL SITUATIONAL AWARENESS SYSTEM"],
                ["BACKEND",     "ONSPACE CLOUD (Supabase-compatible PostgreSQL + Edge Functions)"],
                ["FRONTEND",    "React 18.3 + TypeScript 5.5 + Tailwind CSS 3.4"],
                ["MAP ENGINE",  "Leaflet v1.9.4 + WGS-84 // CartoDB Dark Matter Tiles"],
                ["DATA ENGINE", "Synthetic OSINT Simulation · 9 Domains · 120+ Entity Types"],
                ["AUTH",        "OTP + Password · RBAC · Audit Logging · TS/SCI Clearance Model"],
                ["DATABASE",    "PostgreSQL + Row Level Security · 10 Tables · 4 Edge Functions"],
                ["AI COPILOT",  "OnSpace AI · GPT-4 Turbo · SENTINEL Context Window"],
                ["CLEARANCE",   "TOP SECRET // SENTINEL // NOFORN // REL TO USA, FVEY"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start gap-3">
                  <span className="text-sx-text-muted w-20 flex-shrink-0">{k}:</span>
                  <span className="text-sx-text-dim">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
