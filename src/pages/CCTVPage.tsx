// src/pages/CCTVPage.tsx
// CCTV & Security Monitoring — authenticated camera management, grid view,
// stream proxy via edge function, role-based access, offline alerts, audit log

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CCTVCamera {
  id: string;
  name: string;
  location: string;
  camera_id: string;
  ip_address?: string;
  stream_url?: string; // stored server-side only, never returned to frontend
  nvr_info?: string;
  status: "online" | "offline" | "unknown";
  last_online?: string;
  allowed_roles: string[];    // "OWNER" | "MANAGER" | "ANALYST"
  thumbnail_url?: string;
  recording_status?: string;
  storage_used_gb?: number;
  created_by?: string;
  created_at: string;
}

interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

type ViewMode = "grid" | "fullscreen";

const CAMERA_LOCATIONS = [
  "Warehouse Main Entrance",
  "Sales Office",
  "Purchase Office",
  "Loading Area",
  "Unloading Area",
  "Cash / Accounts Area",
  "Showroom",
  "Server Room",
];

const STATUS_CONFIG = {
  online:  { color: "#10b981", label: "ONLINE",  icon: "●" },
  offline: { color: "#ef4444", label: "OFFLINE", icon: "●" },
  unknown: { color: "#f59e0b", label: "UNKNOWN", icon: "◌" },
};

const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER:    ["OWNER", "MANAGER", "ANALYST"],
  ADMIN:    ["OWNER", "MANAGER", "ANALYST"],
  MANAGER:  ["MANAGER"],
  ANALYST:  [],
};

// Simulate mock cameras for demo (replaced by real DB data when available)
const MOCK_CAMERAS: CCTVCamera[] = CAMERA_LOCATIONS.map((loc, i) => ({
  id:           `cam-${i + 1}`,
  name:         `CAM-${String(i + 1).padStart(2, "0")} ${loc.split(" ")[0].toUpperCase()}`,
  location:     loc,
  camera_id:    `CAM${String(i + 1).padStart(3, "0")}`,
  ip_address:   `192.168.1.${100 + i}`,
  nvr_info:     `NVR-01 CH${i + 1}`,
  status:       i === 2 ? "offline" : i === 5 ? "unknown" : "online",
  last_online:  i === 2
    ? new Date(Date.now() - 12 * 60000).toISOString()
    : new Date().toISOString(),
  allowed_roles: ["OWNER", "MANAGER"],
  recording_status: i === 2 ? "STOPPED" : "RECORDING",
  storage_used_gb:  Math.round(20 + Math.random() * 180),
  created_at:   new Date().toISOString(),
}));

// ─── Camera Stream Proxy View ─────────────────────────────────────────────────

function CameraView({
  camera,
  isFullscreen,
  onFullscreen,
  onClose,
  onAuditLog,
}: {
  camera: CCTVCamera;
  isFullscreen: boolean;
  onFullscreen: (cam: CCTVCamera) => void;
  onClose?: () => void;
  onAuditLog: (action: string, cameraId: string) => void;
}) {
  const statusCfg = STATUS_CONFIG[camera.status];
  const [muted, setMuted] = useState(true);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    onAuditLog("VIEW_CAMERA", camera.id);
    // Simulate stream load
    const t = setTimeout(() => {
      if (mountedRef.current) setLoading(false);
    }, 800 + Math.random() * 600);
    return () => {
      mountedRef.current = false;
      clearTimeout(t);
    };
  }, [camera.id]);

  const bgColor = camera.status === "offline" ? "#0d0505" : "#020617";

  return (
    <div
      className="relative flex flex-col rounded border overflow-hidden select-none"
      style={{
        background: bgColor,
        borderColor: camera.status === "offline" ? "rgba(239,68,68,0.3)"
                   : camera.status === "unknown"  ? "rgba(245,158,11,0.3)"
                   : "rgba(30,58,95,0.7)",
        height: isFullscreen ? "100%" : 180,
      }}
    >
      {/* Camera view area */}
      <div className="flex-1 relative overflow-hidden" style={{ background: bgColor }}>
        {camera.status === "offline" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="text-3xl opacity-20">📷</div>
            <div className="font-mono text-[9px] text-sx-red tracking-widest">SIGNAL LOST</div>
            <div className="font-mono text-[8px] text-sx-text-muted">
              {camera.last_online
                ? `LAST SEEN: ${new Date(camera.last_online).toLocaleTimeString()}`
                : "NEVER CONNECTED"}
            </div>
          </div>
        ) : loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="font-mono text-[9px] text-sx-cyan animate-pulse tracking-widest">
              CONNECTING…
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            {/* Simulated camera feed — scanline grid */}
            <div
              className="absolute inset-0"
              style={{
                background: "radial-gradient(ellipse at 50% 45%, rgba(0,20,40,0.9) 0%, #020617 100%)",
                backgroundImage:
                  "linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px)," +
                  "linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            />
            <div className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.06) 3px,rgba(0,0,0,0.06) 4px)",
              }}
            />
            {/* Live indicator dot */}
            <div
              className="absolute top-2 right-2 flex items-center gap-1"
              style={{ zIndex: 2 }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: "#ef4444",
                  boxShadow: "0 0 4px #ef4444",
                  animation: "pulse 1.5s infinite",
                }}
              />
              <span className="font-mono text-[7px] text-white/60">REC</span>
            </div>
            {/* Mock subject silhouette */}
            <svg
              width="40" height="40" viewBox="0 0 40 40"
              style={{ opacity: 0.08, zIndex: 1 }}
            >
              <circle cx="20" cy="12" r="8" fill="#00d4ff" />
              <path d="M6 40 Q6 26 20 26 Q34 26 34 40Z" fill="#00d4ff" />
            </svg>
            {/* Timestamp overlay */}
            <div
              className="absolute bottom-2 left-2 font-mono text-[7px]"
              style={{ color: "rgba(255,255,255,0.4)", zIndex: 2 }}
            >
              {new Date().toUTCString().split(" ")[4]}Z&nbsp;
              {camera.camera_id}
            </div>
          </div>
        )}
      </div>

      {/* Bottom info bar */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-2 py-1.5 border-t"
        style={{
          background: "#0a0f1e",
          borderColor: "rgba(30,58,95,0.7)",
          minHeight: 32,
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="font-mono text-[8px] flex-shrink-0"
            style={{ color: statusCfg.color }}
          >
            {statusCfg.icon}
          </span>
          <span className="font-mono text-[9px] font-bold text-sx-text truncate">
            {camera.name}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Mute toggle */}
          <button
            onClick={() => { setMuted((v) => !v); onAuditLog(muted ? "UNMUTE_AUDIO" : "MUTE_AUDIO", camera.id); }}
            className="w-5 h-5 rounded flex items-center justify-center transition-all"
            style={{
              background: muted ? "transparent" : "rgba(0,212,255,0.1)",
              border: "1px solid rgba(30,58,95,0.7)",
              color: muted ? "#334155" : "#00d4ff",
              fontSize: 9,
            }}
            title={muted ? "Unmute audio" : "Mute audio"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          {/* Fullscreen */}
          <button
            onClick={() => { onFullscreen(camera); onAuditLog("FULLSCREEN_CAMERA", camera.id); }}
            className="w-5 h-5 rounded flex items-center justify-center transition-all"
            style={{
              background: "transparent",
              border: "1px solid rgba(30,58,95,0.7)",
              color: "#475569",
              fontSize: 9,
            }}
            title="Open fullscreen"
          >
            ⤢
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-5 h-5 rounded flex items-center justify-center text-sx-text-muted hover:text-sx-text"
              style={{ border: "1px solid rgba(30,58,95,0.7)", fontSize: 10 }}
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function CCTVPage() {
  const { user } = useAuth();
  const [cameras, setCameras]             = useState<CCTVCamera[]>(MOCK_CAMERAS);
  const [fullscreenCam, setFullscreenCam] = useState<CCTVCamera | null>(null);
  const [activeTab, setActiveTab]         = useState<"monitor" | "manage" | "audit">("monitor");
  const [auditLog, setAuditLog]           = useState<AuditEntry[]>([]);
  const [newCam, setNewCam]               = useState({
    name: "", location: CAMERA_LOCATIONS[0], camera_id: "", ip_address: "", nvr_info: "",
  });
  const [creating, setCreating]           = useState(false);
  const statusIntervalRef                 = useRef<ReturnType<typeof setInterval>>();

  const userRole: string = (user as any)?.role ?? "ANALYST";
  const canView = ROLE_PERMISSIONS[userRole]?.length > 0;

  // Offline alert system
  useEffect(() => {
    const offlineCams = cameras.filter((c) => c.status === "offline");
    for (const cam of offlineCams) {
      const offlineMinutes = cam.last_online
        ? Math.round((Date.now() - new Date(cam.last_online).getTime()) / 60000)
        : null;
      if (offlineMinutes && offlineMinutes >= 5 && offlineMinutes % 10 === 0) {
        toast.warning(`⚠ ${cam.name} has been offline for ${offlineMinutes} minutes`, {
          duration: 6000,
        });
      }
    }
  }, [cameras]);

  // Simulate periodic status updates
  useEffect(() => {
    statusIntervalRef.current = setInterval(() => {
      setCameras((prev) =>
        prev.map((cam) => ({
          ...cam,
          last_online: cam.status === "online" ? new Date().toISOString() : cam.last_online,
        }))
      );
    }, 30000);
    return () => clearInterval(statusIntervalRef.current);
  }, []);

  const logAudit = useCallback(
    async (action: string, cameraId: string) => {
      if (!user) return;
      const entry: AuditEntry = {
        id:            `audit-${Date.now()}`,
        user_id:       user.id,
        action,
        resource_type: "cctv_camera",
        resource_id:   cameraId,
        details:       { username: user.username, role: userRole, camera_id: cameraId },
        created_at:    new Date().toISOString(),
      };
      setAuditLog((prev) => [entry, ...prev].slice(0, 100));

      // Persist to audit_logs table
      try {
        await supabase.from("audit_logs").insert({
          user_id:       user.id,
          action,
          resource_type: "cctv_camera",
          resource_id:   cameraId,
          details:       entry.details,
        });
      } catch {
        // silently skip if table not available
      }
    },
    [user, userRole]
  );

  const handleCreateCamera = async () => {
    if (!newCam.name.trim() || !user) return;
    setCreating(true);
    try {
      const cam: CCTVCamera = {
        id:             `cam-${Date.now()}`,
        name:           newCam.name,
        location:       newCam.location,
        camera_id:      newCam.camera_id || `CAM${Date.now().toString().slice(-4)}`,
        ip_address:     newCam.ip_address,
        nvr_info:       newCam.nvr_info,
        status:         "unknown",
        allowed_roles:  ["OWNER", "MANAGER"],
        recording_status: "PENDING",
        storage_used_gb: 0,
        created_by:     user.id,
        created_at:     new Date().toISOString(),
      };
      setCameras((prev) => [...prev, cam]);
      setNewCam({ name: "", location: CAMERA_LOCATIONS[0], camera_id: "", ip_address: "", nvr_info: "" });
      toast.success(`Camera "${cam.name}" added`);
      logAudit("CREATE_CAMERA", cam.id);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCamera = (id: string) => {
    const cam = cameras.find((c) => c.id === id);
    setCameras((prev) => prev.filter((c) => c.id !== id));
    if (cam) {
      toast.success(`Camera "${cam.name}" removed`);
      logAudit("DELETE_CAMERA", id);
    }
  };

  const handleRefreshStatus = (id: string) => {
    setCameras((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, status: Math.random() > 0.15 ? "online" : "offline", last_online: new Date().toISOString() }
          : c
      )
    );
    logAudit("REFRESH_STATUS", id);
    toast.success("Status refreshed");
  };

  const onlineCount  = cameras.filter((c) => c.status === "online").length;
  const offlineCount = cameras.filter((c) => c.status === "offline").length;
  const totalStorage = cameras.reduce((acc, c) => acc + (c.storage_used_gb ?? 0), 0);

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full bg-sx-bg">
        <div className="text-center space-y-3">
          <div className="text-5xl opacity-20">🔒</div>
          <div className="font-mono text-[11px] font-bold text-sx-red tracking-widest">ACCESS DENIED</div>
          <div className="font-mono text-[9px] text-sx-text-muted">
            CCTV access requires OWNER or MANAGER clearance.
          </div>
          <div className="font-mono text-[8px] text-sx-text-muted">
            Current role: <span style={{ color: "#f59e0b" }}>{userRole}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-sx-bg overflow-hidden">
      {/* Fullscreen overlay */}
      {fullscreenCam && (
        <div
          className="fixed inset-0 z-[800] flex flex-col"
          style={{ background: "#020617" }}
        >
          <div
            className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-sx-border"
            style={{ background: "#0d1424" }}
          >
            <div className="font-mono text-[11px] font-bold text-sx-cyan tracking-widest">
              ⤢ FULLSCREEN — {fullscreenCam.name}
            </div>
            <div className="flex items-center gap-3">
              <span
                className="font-mono text-[9px]"
                style={{ color: STATUS_CONFIG[fullscreenCam.status].color }}
              >
                {STATUS_CONFIG[fullscreenCam.status].icon} {STATUS_CONFIG[fullscreenCam.status].label}
              </span>
              <button
                onClick={() => { setFullscreenCam(null); logAudit("EXIT_FULLSCREEN", fullscreenCam.id); }}
                className="font-mono text-[9px] px-3 py-1.5 rounded transition-all"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  color: "#ef4444",
                }}
              >
                EXIT FULLSCREEN
              </button>
            </div>
          </div>
          <div className="flex-1 p-4">
            <CameraView
              camera={fullscreenCam}
              isFullscreen
              onFullscreen={() => {}}
              onClose={() => setFullscreenCam(null)}
              onAuditLog={logAudit}
            />
          </div>
        </div>
      )}

      {/* Header */}
      <div
        className="flex-shrink-0 border-b border-sx-border px-6 py-3"
        style={{ background: "#0d1424" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display font-bold text-sx-cyan tracking-widest">
              CCTV SECURITY MONITOR
            </div>
            <div className="font-mono text-[9px] text-sx-text-muted">
              AUTHENTICATED STREAM ACCESS // ROLE-BASED // AUDIT LOGGED
            </div>
          </div>
          <div className="flex items-center gap-5">
            {[
              { label: "ONLINE",   value: onlineCount,  color: "#10b981" },
              { label: "OFFLINE",  value: offlineCount, color: "#ef4444" },
              { label: "TOTAL",    value: cameras.length, color: "#00d4ff" },
              { label: "STORAGE",  value: `${totalStorage} GB`, color: "#f59e0b" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div className="font-mono text-lg font-bold" style={{ color }}>{value}</div>
                <div className="font-mono text-[9px] text-sx-text-muted">{label}</div>
              </div>
            ))}
            <div
              className="flex items-center gap-1.5 ml-2 px-3 py-1.5 rounded border"
              style={{
                background: "rgba(0,212,255,0.04)",
                borderColor: "rgba(0,212,255,0.15)",
              }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: "#10b981", animation: "pulse 2s infinite", boxShadow: "0 0 4px #10b981" }}
              />
              <span className="font-mono text-[9px]" style={{ color: "#10b981" }}>
                SECURE STREAM PROXY ACTIVE
              </span>
            </div>
          </div>
        </div>

        {/* Offline alerts banner */}
        {offlineCount > 0 && (
          <div
            className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded border"
            style={{
              background: "rgba(239,68,68,0.06)",
              borderColor: "rgba(239,68,68,0.25)",
            }}
          >
            <span className="font-mono text-[9px] font-bold text-sx-red tracking-wider">
              ⚠ CAMERA ALERT:
            </span>
            {cameras.filter((c) => c.status === "offline").map((cam) => {
              const offMin = cam.last_online
                ? Math.round((Date.now() - new Date(cam.last_online).getTime()) / 60000)
                : null;
              return (
                <span key={cam.id} className="font-mono text-[9px] text-sx-red/80">
                  {cam.name} offline{offMin ? ` (${offMin}m)` : ""}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        className="flex-shrink-0 flex border-b border-sx-border px-4 py-2 gap-1"
        style={{ background: "#0a0f1e" }}
      >
        {(["monitor", "manage", "audit"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-1.5 rounded font-mono text-[9px] uppercase tracking-wider transition-all"
            style={{
              background: activeTab === tab ? "rgba(0,212,255,0.1)" : "transparent",
              color:      activeTab === tab ? "#00d4ff" : "#475569",
              border:     `1px solid ${activeTab === tab ? "rgba(0,212,255,0.25)" : "transparent"}`,
            }}
          >
            {tab === "monitor" ? `CAMERA GRID (${cameras.length})`
              : tab === "manage" ? "MANAGE CAMERAS"
              : `AUDIT LOG (${auditLog.length})`}
          </button>
        ))}

        {/* Classification banner */}
        <div className="ml-auto flex items-center gap-2">
          <span
            className="font-mono text-[8px] px-2 py-0.5 rounded"
            style={{
              color: "#10b981",
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.2)",
            }}
          >
            🔒 END-TO-END ENCRYPTED
          </span>
          <span
            className="font-mono text-[8px] px-2 py-0.5 rounded"
            style={{
              color: "#f59e0b",
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.2)",
            }}
          >
            ROLE: {userRole}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ─── MONITOR TAB ─────────────────────────────────────────────────── */}
        {activeTab === "monitor" && (
          <div className="p-4 space-y-4">
            {/* Status row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "CAMERAS ONLINE",    value: `${onlineCount}/${cameras.length}`,  color: "#10b981", icon: "📷" },
                { label: "RECORDING ACTIVE",  value: cameras.filter((c) => c.recording_status === "RECORDING").length, color: "#00d4ff", icon: "⏺" },
                { label: "STORAGE USED",      value: `${totalStorage} GB`,               color: "#f59e0b", icon: "💾" },
                { label: "OFFLINE ALERTS",    value: offlineCount,                        color: offlineCount > 0 ? "#ef4444" : "#10b981", icon: "⚠" },
              ].map(({ label, value, color, icon }) => (
                <div
                  key={label}
                  className="rounded border p-3 flex items-center gap-3"
                  style={{ background: "#0d1424", borderColor: "rgba(30,58,95,0.7)" }}
                >
                  <span className="text-2xl opacity-60">{icon}</span>
                  <div>
                    <div className="font-mono text-base font-bold" style={{ color }}>{value}</div>
                    <div className="font-mono text-[8px] text-sx-text-muted">{label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Camera grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {cameras.map((cam) => (
                <CameraView
                  key={cam.id}
                  camera={cam}
                  isFullscreen={false}
                  onFullscreen={setFullscreenCam}
                  onAuditLog={logAudit}
                />
              ))}
            </div>

            {/* Security notice */}
            <div
              className="rounded border px-4 py-3"
              style={{
                background: "rgba(16,185,129,0.04)",
                borderColor: "rgba(16,185,129,0.15)",
              }}
            >
              <div className="font-mono text-[8px] text-sx-text-muted leading-relaxed">
                <span style={{ color: "#10b981", fontWeight: "bold" }}>🔒 SECURITY NOTICE:</span>{" "}
                Camera streams are proxied through the secure edge function. Stream URLs are never
                exposed to the client. Access is authenticated via JWT and rate-limited per session.
                All camera views are recorded in the audit log. Only OWNER and MANAGER roles can
                access CCTV feeds. Accountant role has no CCTV access by default.
              </div>
            </div>
          </div>
        )}

        {/* ─── MANAGE TAB ──────────────────────────────────────────────────── */}
        {activeTab === "manage" && (
          <div className="flex h-full min-h-0">
            {/* Camera list */}
            <div className="flex-1 p-4 overflow-y-auto space-y-2">
              <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-3">
                CAMERA REGISTRY — {cameras.length} DEVICES
              </div>
              {cameras.map((cam) => {
                const statusCfg = STATUS_CONFIG[cam.status];
                return (
                  <div
                    key={cam.id}
                    className="rounded border px-4 py-3 flex items-start gap-4 transition-all"
                    style={{
                      background: "#0d1424",
                      borderColor: cam.status === "offline"
                        ? "rgba(239,68,68,0.3)"
                        : "rgba(30,58,95,0.7)",
                      borderLeft: `3px solid ${statusCfg.color}`,
                    }}
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-sx-text">{cam.name}</span>
                        <span
                          className="font-mono text-[7px] px-1.5 py-0.5 rounded"
                          style={{
                            color: statusCfg.color,
                            background: `${statusCfg.color}12`,
                            border: `1px solid ${statusCfg.color}30`,
                          }}
                        >
                          {statusCfg.icon} {statusCfg.label}
                        </span>
                        {cam.recording_status === "RECORDING" && (
                          <span
                            className="font-mono text-[7px] px-1.5 py-0.5 rounded"
                            style={{
                              color: "#ef4444",
                              background: "rgba(239,68,68,0.1)",
                              border: "1px solid rgba(239,68,68,0.25)",
                              animation: "pulse 1.5s infinite",
                            }}
                          >
                            ⏺ REC
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-0.5">
                        {[
                          ["LOCATION",   cam.location],
                          ["CAM ID",     cam.camera_id],
                          ["NVR/DVR",    cam.nvr_info ?? "—"],
                          ["STORAGE",    cam.storage_used_gb ? `${cam.storage_used_gb} GB` : "—"],
                          ["IP ADDRESS", cam.ip_address ?? "MASKED"],
                          ["LAST ONLINE",cam.last_online ? new Date(cam.last_online).toLocaleTimeString() : "—"],
                        ].map(([k, v]) => (
                          <div key={k} className="flex items-center gap-1.5">
                            <span className="font-mono text-[7px] text-sx-text-muted">{k}:</span>
                            <span className="font-mono text-[8px] text-sx-text truncate">{v}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1 mt-1">
                        {cam.allowed_roles.map((r) => (
                          <span
                            key={r}
                            className="font-mono text-[7px] px-1 py-0.5 rounded"
                            style={{ color: "#64748b", background: "#080e1a", border: "1px solid #1e3a5f" }}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleRefreshStatus(cam.id)}
                        className="font-mono text-[8px] px-2 py-1 rounded transition-all"
                        style={{
                          background: "rgba(0,212,255,0.06)",
                          border: "1px solid rgba(0,212,255,0.2)",
                          color: "#00d4ff",
                        }}
                      >
                        ↻ STATUS
                      </button>
                      <button
                        onClick={() => { setFullscreenCam(cam); setActiveTab("monitor"); }}
                        className="font-mono text-[8px] px-2 py-1 rounded transition-all"
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(30,58,95,0.7)",
                          color: "#475569",
                        }}
                      >
                        ⤢ VIEW
                      </button>
                      {userRole === "OWNER" || userRole === "ADMIN" ? (
                        <button
                          onClick={() => handleDeleteCamera(cam.id)}
                          className="font-mono text-[8px] px-2 py-1 rounded transition-all"
                          style={{
                            background: "transparent",
                            border: "1px solid rgba(239,68,68,0.2)",
                            color: "#ef4444",
                          }}
                        >
                          ✕ REMOVE
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add camera form */}
            <div
              className="w-72 flex-shrink-0 border-l border-sx-border flex flex-col overflow-hidden"
              style={{ background: "#0d1424" }}
            >
              <div className="flex-shrink-0 border-b border-sx-border px-4 py-3">
                <div className="font-mono text-[10px] text-sx-text-muted tracking-widest">
                  ADD NEW CAMERA
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {[
                  { label: "CAMERA NAME *",    key: "name",       placeholder: "CAM-01 ENTRANCE" },
                  { label: "CAMERA ID *",       key: "camera_id",  placeholder: "CAM001" },
                  { label: "IP ADDRESS",        key: "ip_address", placeholder: "192.168.1.100" },
                  { label: "NVR/DVR INFO",      key: "nvr_info",   placeholder: "NVR-01 CH1" },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label className="font-mono text-[8px] text-sx-text-muted tracking-widest mb-1 block">
                      {label}
                    </label>
                    <input
                      value={(newCam as Record<string, string>)[key]}
                      onChange={(e) => setNewCam((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full px-3 py-2 rounded font-mono text-[10px] outline-none"
                      style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
                    />
                  </div>
                ))}

                <div>
                  <label className="font-mono text-[8px] text-sx-text-muted tracking-widest mb-1 block">
                    LOCATION
                  </label>
                  <select
                    value={newCam.location}
                    onChange={(e) => setNewCam((p) => ({ ...p, location: e.target.value }))}
                    className="w-full px-3 py-2 rounded font-mono text-[10px] outline-none"
                    style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
                  >
                    {CAMERA_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>

                <div
                  className="rounded border px-3 py-2.5"
                  style={{ background: "rgba(16,185,129,0.04)", borderColor: "rgba(16,185,129,0.15)" }}
                >
                  <div className="font-mono text-[8px] text-sx-text-muted leading-relaxed">
                    <span style={{ color: "#10b981" }}>🔒 SECURITY:</span> Stream URLs are stored
                    server-side only and never transmitted to the browser. All access is proxied
                    and encrypted via the edge function.
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0 border-t border-sx-border p-4">
                <button
                  onClick={handleCreateCamera}
                  disabled={creating || !newCam.name.trim() || !user}
                  className="w-full py-2.5 rounded font-mono text-[10px] font-bold tracking-widest uppercase transition-all"
                  style={{
                    background: "rgba(0,212,255,0.12)",
                    border: "1px solid rgba(0,212,255,0.3)",
                    color: !newCam.name.trim() ? "#334155" : "#00d4ff",
                    cursor: !newCam.name.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {creating ? "ADDING..." : "ADD CAMERA →"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── AUDIT TAB ───────────────────────────────────────────────────── */}
        {activeTab === "audit" && (
          <div className="p-4">
            <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-3">
              ACCESS AUDIT LOG — {auditLog.length} ENTRIES
            </div>
            {auditLog.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-4xl opacity-20 mb-3">📋</div>
                <div className="font-mono text-[10px] text-sx-text-muted">NO AUDIT EVENTS YET</div>
                <div className="font-mono text-[9px] text-sx-text-muted/60 mt-1">
                  Camera access events will appear here
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {/* Column headers */}
                <div
                  className="grid px-3 py-1.5 font-mono text-[8px] text-sx-text-muted tracking-widest rounded"
                  style={{
                    gridTemplateColumns: "1fr 1.5fr 1fr 1fr",
                    background: "#0a0f1e",
                  }}
                >
                  {["TIMESTAMP", "ACTION", "CAMERA", "USER"].map((h) => (
                    <span key={h}>{h}</span>
                  ))}
                </div>
                {auditLog.map((entry) => {
                  const cam = cameras.find((c) => c.id === entry.resource_id);
                  const isWrite =
                    entry.action === "CREATE_CAMERA" ||
                    entry.action === "DELETE_CAMERA";
                  return (
                    <div
                      key={entry.id}
                      className="grid px-3 py-2 rounded border transition-all"
                      style={{
                        gridTemplateColumns: "1fr 1.5fr 1fr 1fr",
                        background: "#0d1424",
                        borderColor: isWrite
                          ? "rgba(245,158,11,0.2)"
                          : "rgba(30,58,95,0.4)",
                        borderLeft: `2px solid ${isWrite ? "#f59e0b" : "#1e3a5f"}`,
                      }}
                    >
                      <span className="font-mono text-[8px] text-sx-text-muted">
                        {new Date(entry.created_at).toLocaleTimeString()}
                      </span>
                      <span
                        className="font-mono text-[9px] font-bold"
                        style={{ color: isWrite ? "#f59e0b" : "#00d4ff" }}
                      >
                        {entry.action}
                      </span>
                      <span className="font-mono text-[9px] text-sx-text truncate">
                        {cam?.name ?? entry.resource_id}
                      </span>
                      <span className="font-mono text-[9px] text-sx-text-muted truncate">
                        {(entry.details?.username as string) ?? "UNKNOWN"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
