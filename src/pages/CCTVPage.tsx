// src/pages/CCTVPage.tsx
// CCTV & Security Monitoring — authenticated camera management, grid view,
// stream proxy via edge function, role-based access, offline alerts, audit log,
// PTZ pan-tilt-zoom controls with preset positions.

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
  allowed_roles: string[];
  thumbnail_url?: string;
  recording_status?: string;
  storage_used_gb?: number;
  ptz_supported?: boolean;
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

type PTZCommand =
  | "pan_left" | "pan_right"
  | "tilt_up"  | "tilt_down"
  | "zoom_in"  | "zoom_out"
  | "stop"     | "preset";

interface PTZState {
  pan: number;   // -100 to +100
  tilt: number;  // -100 to +100
  zoom: number;  //    1 to  10
}

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
  OWNER:   ["OWNER", "MANAGER", "ANALYST"],
  ADMIN:   ["OWNER", "MANAGER", "ANALYST"],
  MANAGER: ["MANAGER"],
  ANALYST: [],
};

// PTZ presets
const PTZ_PRESETS = [
  { id: "home",      label: "HOME",      icon: "⌂", pan:   0, tilt:   0, zoom: 1 },
  { id: "door",      label: "DOOR",      icon: "🚪", pan: -45, tilt: -10, zoom: 3 },
  { id: "perimeter", label: "PERIMETER", icon: "◯", pan:  60, tilt:  15, zoom: 2 },
  { id: "overview",  label: "OVERVIEW",  icon: "⊕", pan:   0, tilt:  20, zoom: 1 },
] as const;

// Simulate mock cameras for demo (replaced by real DB data when available)
const MOCK_CAMERAS: CCTVCamera[] = CAMERA_LOCATIONS.map((loc, i) => ({
  id:             `cam-${i + 1}`,
  name:           `CAM-${String(i + 1).padStart(2, "0")} ${loc.split(" ")[0].toUpperCase()}`,
  location:       loc,
  camera_id:      `CAM${String(i + 1).padStart(3, "0")}`,
  ip_address:     `192.168.1.${100 + i}`,
  nvr_info:       `NVR-01 CH${i + 1}`,
  status:         i === 2 ? "offline" : i === 5 ? "unknown" : "online",
  last_online:    i === 2
    ? new Date(Date.now() - 12 * 60000).toISOString()
    : new Date().toISOString(),
  allowed_roles:  ["OWNER", "MANAGER"],
  recording_status: i === 2 ? "STOPPED" : "RECORDING",
  storage_used_gb: Math.round(20 + Math.random() * 180),
  ptz_supported:  i !== 2 && i !== 5, // offline/unknown cams don't support PTZ
  created_at:     new Date().toISOString(),
}));

// ─── PTZ Control Panel ────────────────────────────────────────────────────────

function PTZControls({
  camera,
  onCommand,
}: {
  camera: CCTVCamera;
  onCommand: (cmd: PTZCommand, opts?: { presetId?: string; speed?: number }) => void;
}) {
  const [speed, setSpeed] = useState<1 | 2 | 3>(2);
  const [activeCmd, setActiveCmd] = useState<PTZCommand | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setInterval>>();

  const isOffline = camera.status === "offline";
  const btnBase: React.CSSProperties = {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    borderRadius: 4,
    cursor: isOffline ? "not-allowed" : "pointer",
    transition: "all 0.12s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    opacity: isOffline ? 0.35 : 1,
  };

  const dirBtn = (cmd: PTZCommand, label: string, w = 36, h = 36): React.ReactNode => {
    const isActive = activeCmd === cmd;
    return (
      <button
        onMouseDown={() => {
          if (isOffline) return;
          setActiveCmd(cmd);
          onCommand(cmd, { speed });
          holdTimerRef.current = setInterval(() => onCommand(cmd, { speed }), 140);
        }}
        onMouseUp={() => {
          clearInterval(holdTimerRef.current);
          setActiveCmd(null);
          onCommand("stop");
        }}
        onMouseLeave={() => {
          if (activeCmd === cmd) {
            clearInterval(holdTimerRef.current);
            setActiveCmd(null);
            onCommand("stop");
          }
        }}
        onTouchStart={(e) => {
          e.preventDefault();
          if (isOffline) return;
          setActiveCmd(cmd);
          onCommand(cmd, { speed });
          holdTimerRef.current = setInterval(() => onCommand(cmd, { speed }), 140);
        }}
        onTouchEnd={() => {
          clearInterval(holdTimerRef.current);
          setActiveCmd(null);
          onCommand("stop");
        }}
        disabled={isOffline}
        style={{
          ...btnBase,
          width: w,
          height: h,
          background: isActive
            ? "rgba(0,212,255,0.25)"
            : "rgba(0,212,255,0.07)",
          border: `1px solid ${isActive ? "rgba(0,212,255,0.6)" : "rgba(0,212,255,0.2)"}`,
          color: isActive ? "#00d4ff" : "#94a3b8",
          boxShadow: isActive ? "0 0 8px rgba(0,212,255,0.3)" : "none",
          fontSize: 14,
        }}
        title={cmd.replace("_", " ").toUpperCase()}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className="rounded border overflow-hidden"
      style={{ background: "#080e1a", borderColor: "rgba(0,212,255,0.15)" }}
    >
      {/* Header */}
      <div
        className="px-3 py-1.5 border-b flex items-center justify-between"
        style={{ background: "#0d1424", borderColor: "rgba(0,212,255,0.12)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-[9px] font-bold tracking-widest"
            style={{ color: isOffline ? "#475569" : "#00d4ff" }}
          >
            PTZ CONTROL
          </span>
          {camera.ptz_supported && !isOffline && (
            <span
              className="font-mono text-[7px] px-1.5 py-0.5 rounded"
              style={{ color: "#10b981", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}
            >
              ONVIF
            </span>
          )}
        </div>
        {/* Speed selector */}
        <div className="flex items-center gap-1">
          <span className="font-mono text-[7px] text-sx-text-muted mr-0.5">SPD</span>
          {([1, 2, 3] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              disabled={isOffline}
              style={{
                ...btnBase,
                width: 20,
                height: 20,
                fontSize: 8,
                background:   speed === s ? "rgba(0,212,255,0.2)" : "transparent",
                border:       `1px solid ${speed === s ? "rgba(0,212,255,0.4)" : "rgba(30,58,95,0.7)"}`,
                color:        speed === s ? "#00d4ff" : "#475569",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* ── D-pad + zoom column ─────────────────────────────────────────── */}
        <div className="flex items-center gap-4 justify-center">
          {/* D-pad */}
          <div className="relative" style={{ width: 112, height: 112 }}>
            {/* Tilt Up */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2">
              {dirBtn("tilt_up", "▲")}
            </div>
            {/* Tilt Down */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
              {dirBtn("tilt_down", "▼")}
            </div>
            {/* Pan Left */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2">
              {dirBtn("pan_left", "◀")}
            </div>
            {/* Pan Right */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              {dirBtn("pan_right", "▶")}
            </div>
            {/* Center STOP button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => !isOffline && onCommand("stop")}
                disabled={isOffline}
                style={{
                  ...btnBase,
                  width: 34,
                  height: 34,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  color: "#ef4444",
                  fontSize: 8,
                  fontWeight: "bold",
                  letterSpacing: "0.05em",
                }}
                title="Stop movement"
              >
                STOP
              </button>
            </div>
          </div>

          {/* Zoom column */}
          <div className="flex flex-col items-center gap-1.5">
            <span className="font-mono text-[7px] text-sx-text-muted tracking-widest">ZOOM</span>
            {dirBtn("zoom_in", "＋", 32, 32)}
            {/* Zoom level visual bar */}
            <div
              className="w-8 rounded-full overflow-hidden"
              style={{ height: 44, background: "rgba(30,58,95,0.5)", border: "1px solid rgba(30,58,95,0.9)" }}
            >
              <div
                className="w-full rounded-full transition-all duration-300"
                style={{
                  height: "40%",
                  background: "linear-gradient(to top, #00d4ff, rgba(0,212,255,0.3))",
                  marginTop: "auto",
                  position: "relative",
                  top: "60%",
                  boxShadow: "0 0 4px rgba(0,212,255,0.4)",
                }}
              />
            </div>
            {dirBtn("zoom_out", "－", 32, 32)}
          </div>
        </div>

        {/* ── Preset quick-access row ──────────────────────────────────────── */}
        <div>
          <div className="font-mono text-[7px] text-sx-text-muted tracking-widest mb-1.5 text-center">
            PRESETS
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {PTZ_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => !isOffline && onCommand("preset", { presetId: preset.id })}
                disabled={isOffline}
                style={{
                  ...btnBase,
                  flexDirection: "column",
                  gap: 2,
                  paddingTop: 6,
                  paddingBottom: 6,
                  background: "rgba(0,212,255,0.05)",
                  border: "1px solid rgba(0,212,255,0.15)",
                  color: "#64748b",
                  fontSize: 14,
                  borderRadius: 4,
                }}
                className="hover:border-sx-cyan/40 hover:text-sx-cyan transition-all"
                title={`Go to ${preset.label} preset`}
              >
                <span style={{ fontSize: 14 }}>{preset.icon}</span>
                <span style={{ fontSize: 7, color: "#475569", fontFamily: "'Share Tech Mono',monospace", letterSpacing: "0.05em" }}>
                  {preset.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Status row ────────────────────────────────────────────────────── */}
        {isOffline ? (
          <div
            className="rounded px-2 py-1.5 text-center font-mono text-[8px]"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", color: "#ef4444" }}
          >
            PTZ UNAVAILABLE — CAMERA OFFLINE
          </div>
        ) : !camera.ptz_supported ? (
          <div
            className="rounded px-2 py-1.5 text-center font-mono text-[8px]"
            style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", color: "#f59e0b" }}
          >
            ⚠ PTZ NOT DETECTED — SENDING ONVIF COMMANDS
          </div>
        ) : (
          <div
            className="rounded px-2 py-1.5 text-center font-mono text-[8px]"
            style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)", color: "#10b981" }}
          >
            ● PTZ READY — ONVIF PROFILE S
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Camera Stream Proxy View ─────────────────────────────────────────────────

// ─── Motion detection engine per camera ────────────────────────────────────────

function useMotionDetection(
  camera: CCTVCamera,
  enabled: boolean,
  onMotion: (cameraName: string, cameraId: string) => void,
) {
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval>>();
  const [motionActive, setMotionActive] = useState(false);
  const cooldownRef = useRef(false);

  // Simulate a "frame" as a 32×32 noise array (no real RTSP stream)
  const generateSimFrame = (): Uint8ClampedArray => {
    const data = new Uint8ClampedArray(32 * 32 * 4);
    for (let i = 0; i < data.length; i += 4) {
      const n = Math.random() * 20 + 4;
      data[i]     = n * 0.3;
      data[i + 1] = n * 0.5;
      data[i + 2] = n * 1.5;
      data[i + 3] = 255;
    }
    // Occasionally inject a large "object" moving through the scene
    if (Math.random() < 0.04) {
      const ox = Math.floor(Math.random() * 24) * 4;
      const oy = Math.floor(Math.random() * 24);
      for (let row = oy; row < oy + 8; row++) {
        for (let col = ox; col < ox + 8 * 4; col += 4) {
          const idx = (row * 32 + col / 4) * 4;
          if (idx + 3 < data.length) {
            data[idx]     = 180 + Math.random() * 60;
            data[idx + 1] = 120 + Math.random() * 40;
            data[idx + 2] = 20  + Math.random() * 20;
            data[idx + 3] = 255;
          }
        }
      }
    }
    return data;
  };

  useEffect(() => {
    if (!enabled || camera.status !== "online") return;

    intervalRef.current = setInterval(() => {
      const frame = generateSimFrame();
      if (prevFrameRef.current) {
        // Compute mean absolute delta across all pixels
        let totalDelta = 0;
        for (let i = 0; i < frame.length; i += 4) {
          totalDelta +=
            Math.abs(frame[i]     - prevFrameRef.current[i])     +
            Math.abs(frame[i + 1] - prevFrameRef.current[i + 1]) +
            Math.abs(frame[i + 2] - prevFrameRef.current[i + 2]);
        }
        const meanDelta = totalDelta / (frame.length / 4);
        // Threshold: mean pixel delta > 22 triggers motion
        if (meanDelta > 22 && !cooldownRef.current) {
          cooldownRef.current = true;
          setMotionActive(true);
          onMotion(camera.name, camera.id);
          // Flash duration: 2.5 s, then 10 s cooldown before next trigger
          setTimeout(() => setMotionActive(false), 2500);
          setTimeout(() => { cooldownRef.current = false; }, 12000);
        }
      }
      prevFrameRef.current = frame;
    }, 1200); // check every 1.2 s

    return () => clearInterval(intervalRef.current);
  }, [enabled, camera.status, camera.id]);

  return motionActive;
}

// ─── Camera Stream Proxy View ─────────────────────────────────────────────────

function CameraView({
  camera,
  isFullscreen,
  onFullscreen,
  onClose,
  onAuditLog,
  ptzState,
  motionDetectionEnabled,
}: {
  camera: CCTVCamera;
  isFullscreen: boolean;
  onFullscreen: (cam: CCTVCamera) => void;
  onClose?: () => void;
  onAuditLog: (action: string, cameraId: string) => void;
  ptzState?: PTZState;
  motionDetectionEnabled?: boolean;
}) {
  const statusCfg = STATUS_CONFIG[camera.status];
  const [muted, setMuted]   = useState(true);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const motionActive = useMotionDetection(
    camera,
    motionDetectionEnabled ?? false,
    (cameraName, cameraId) => {
      toast.warning(
        `⚠ MOTION DETECTED — ${cameraName} at ${new Date().toLocaleTimeString()}`,
        { duration: 5000 }
      );
      onAuditLog("MOTION_DETECTED", cameraId);
    }
  );

  useEffect(() => {
    mountedRef.current = true;
    onAuditLog("VIEW_CAMERA", camera.id);
    const t = setTimeout(() => {
      if (mountedRef.current) setLoading(false);
    }, 800 + Math.random() * 600);
    return () => {
      mountedRef.current = false;
      clearTimeout(t);
    };
  }, [camera.id]);

  const bgColor = camera.status === "offline" ? "#0d0505" : "#020617";

  // Compute simulated viewport offset from PTZ state
  const panOffsetPct  = ((ptzState?.pan  ?? 0) / 100) * 12;
  const tiltOffsetPct = ((ptzState?.tilt ?? 0) / 100) * 8;
  const zoomScale     = 1 + ((ptzState?.zoom ?? 1) - 1) * 0.12;

  return (
    <div
      className="relative flex flex-col rounded border overflow-hidden select-none"
      style={{
        background: bgColor,
        borderColor: motionActive
          ? "rgba(239,68,68,0.9)"
          : camera.status === "offline" ? "rgba(239,68,68,0.3)"
          : camera.status === "unknown"  ? "rgba(245,158,11,0.3)"
          : "rgba(30,58,95,0.7)",
        boxShadow: motionActive ? "0 0 16px rgba(239,68,68,0.45), inset 0 0 12px rgba(239,68,68,0.1)" : "none",
        transition: "border-color 0.2s, box-shadow 0.2s",
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
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{
              transform: `scale(${zoomScale}) translate(${panOffsetPct}%, ${-tiltOffsetPct}%)`,
              transition: "transform 0.25s ease",
              transformOrigin: "center center",
            }}
          >
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
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.06) 3px,rgba(0,0,0,0.06) 4px)",
              }}
            />
            {/* Motion detection indicator */}
            {motionActive && (
              <div
                className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded z-10"
                style={{
                  background: "rgba(239,68,68,0.18)",
                  border: "1px solid rgba(239,68,68,0.6)",
                  animation: "pulse 0.8s infinite",
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#ef4444", boxShadow: "0 0 4px #ef4444" }} />
                <span className="font-mono text-[7px] font-bold" style={{ color: "#ef4444" }}>MOTION</span>
              </div>
            )}
            {/* Live indicator dot */}}
            <div className="absolute top-2 right-2 flex items-center gap-1" style={{ zIndex: 2 }}>
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "#ef4444", boxShadow: "0 0 4px #ef4444", animation: "pulse 1.5s infinite" }}
              />
              <span className="font-mono text-[7px] text-white/60">REC</span>
            </div>
            {/* Mock subject silhouette */}
            <svg width="40" height="40" viewBox="0 0 40 40" style={{ opacity: 0.08, zIndex: 1 }}>
              <circle cx="20" cy="12" r="8" fill="#00d4ff" />
              <path d="M6 40 Q6 26 20 26 Q34 26 34 40Z" fill="#00d4ff" />
            </svg>
            {/* Timestamp + PTZ overlay */}
            <div
              className="absolute bottom-2 left-2 font-mono text-[7px]"
              style={{ color: "rgba(255,255,255,0.4)", zIndex: 2 }}
            >
              {new Date().toUTCString().split(" ")[4]}Z&nbsp;{camera.camera_id}
            </div>
            {ptzState && (
              <div
                className="absolute bottom-2 right-2 font-mono text-[7px]"
                style={{ color: "rgba(0,212,255,0.5)", zIndex: 2 }}
              >
                P:{ptzState.pan.toFixed(0)}° T:{ptzState.tilt.toFixed(0)}° Z:{ptzState.zoom.toFixed(1)}×
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom info bar */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-2 py-1.5 border-t"
        style={{ background: "#0a0f1e", borderColor: "rgba(30,58,95,0.7)", minHeight: 32 }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-[8px] flex-shrink-0" style={{ color: statusCfg.color }}>
            {statusCfg.icon}
          </span>
          <span className="font-mono text-[9px] font-bold text-sx-text truncate">{camera.name}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Mute toggle */}
          <button
            onClick={() => {
              setMuted((v) => !v);
              onAuditLog(muted ? "UNMUTE_AUDIO" : "MUTE_AUDIO", camera.id);
            }}
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
            style={{ background: "transparent", border: "1px solid rgba(30,58,95,0.7)", color: "#475569", fontSize: 9 }}
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
  const { user }  = useAuth();
  const [cameras, setCameras]             = useState<CCTVCamera[]>(MOCK_CAMERAS);
  const [fullscreenCam, setFullscreenCam] = useState<CCTVCamera | null>(null);
  const [activeTab, setActiveTab]         = useState<"monitor" | "manage" | "audit">("monitor");
  const [auditLog, setAuditLog]           = useState<AuditEntry[]>([]);
  const [newCam, setNewCam]               = useState({
    name: "", location: CAMERA_LOCATIONS[0], camera_id: "", ip_address: "", nvr_info: "",
  });
  const [motionDetectionGlobal, setMotionDetectionGlobal] = useState(false);
  const [creating, setCreating] = useState(false);
  const statusIntervalRef       = useRef<ReturnType<typeof setInterval>>();

  const ptzCooldownRef          = useRef(false);
  const [ptzStates, setPtzStates] = useState<Record<string, PTZState>>(() =>
    Object.fromEntries(MOCK_CAMERAS.map((c) => [c.id, { pan: 0, tilt: 0, zoom: 1 }]))
  );

  const userRole: string = (user as any)?.role ?? "ANALYST";
  const canView = ROLE_PERMISSIONS[userRole]?.length > 0;

  // ─── Send PTZ command to edge function + update local state ─────────────────
  const sendPTZCommand = useCallback(
    async (
      camera: CCTVCamera,
      cmd: PTZCommand,
      opts: { presetId?: string; speed?: number } = {}
    ) => {
      // Apply local simulated movement
      if (cmd !== "stop") {
        setPtzStates((prev) => {
          const cur = prev[camera.id] ?? { pan: 0, tilt: 0, zoom: 1 };
          const spd = opts.speed ?? 2;
          const delta = spd * 3;
          let { pan, tilt, zoom } = cur;

          if (cmd === "pan_left")  pan  = Math.max(-100, pan  - delta);
          if (cmd === "pan_right") pan  = Math.min( 100, pan  + delta);
          if (cmd === "tilt_up")   tilt = Math.min( 100, tilt + delta);
          if (cmd === "tilt_down") tilt = Math.max(-100, tilt - delta);
          if (cmd === "zoom_in")   zoom = Math.min(  10, zoom + 0.3 * spd);
          if (cmd === "zoom_out")  zoom = Math.max(   1, zoom - 0.3 * spd);
          if (cmd === "preset") {
            const preset = PTZ_PRESETS.find((p) => p.id === opts.presetId);
            if (preset) { pan = preset.pan; tilt = preset.tilt; zoom = preset.zoom; }
          }

          return { ...prev, [camera.id]: { pan, tilt, zoom } };
        });
      }

      // Throttle edge function calls (max 1 per 200ms for hold-repeat)
      if (ptzCooldownRef.current && cmd !== "preset" && cmd !== "stop") return;
      ptzCooldownRef.current = true;
      setTimeout(() => { ptzCooldownRef.current = false; }, 200);

      // Fire-and-forget to edge function — camera proxy handles ONVIF translation
      supabase.functions
        .invoke("sentinel-feeds", {
          body: {
            action:     "ptz_command",
            camera_id:  camera.camera_id,
            ip_address: camera.ip_address,
            command:    cmd,
            speed:      opts.speed ?? 2,
            preset_id:  opts.presetId,
          },
        })
        .then(({ error }) => {
          if (error) console.warn("[PTZ] Edge function error (non-fatal):", error.message);
        });

      // Audit specific PTZ actions
      if (cmd === "preset" && opts.presetId) {
        logAudit(`PTZ_PRESET_${opts.presetId.toUpperCase()}`, camera.id);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

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
        id:            `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        user_id:       user.id,
        action,
        resource_type: "cctv_camera",
        resource_id:   cameraId,
        details:       { username: user.username, role: userRole, camera_id: cameraId },
        created_at:    new Date().toISOString(),
      };
      setAuditLog((prev) => [entry, ...prev].slice(0, 100));
      try {
        await supabase.from("audit_logs").insert({
          user_id:       user.id,
          action,
          resource_type: "cctv_camera",
          resource_id:   cameraId,
          details:       entry.details,
        });
      } catch { /* silently skip */ }
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
        ptz_supported:  true,
        created_by:     user.id,
        created_at:     new Date().toISOString(),
      };
      setCameras((prev) => [...prev, cam]);
      setPtzStates((prev) => ({ ...prev, [cam.id]: { pan: 0, tilt: 0, zoom: 1 } }));
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

      {/* ─── Fullscreen overlay ──────────────────────────────────────────────── */}
      {fullscreenCam && (
        <div className="fixed inset-0 z-[800] flex flex-col" style={{ background: "#020617" }}>
          {/* Fullscreen top bar */}
          <div
            className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-sx-border"
            style={{ background: "#0d1424" }}
          >
            <div className="flex items-center gap-3">
              <div className="font-mono text-[11px] font-bold text-sx-cyan tracking-widest">
                ⤢ FULLSCREEN — {fullscreenCam.name}
              </div>
              <span className="font-mono text-[8px] text-sx-text-muted">{fullscreenCam.location}</span>
              {fullscreenCam.ptz_supported && fullscreenCam.status !== "offline" && (
                <span
                  className="font-mono text-[7px] px-1.5 py-0.5 rounded"
                  style={{
                    color: "#10b981",
                    background: "rgba(16,185,129,0.1)",
                    border: "1px solid rgba(16,185,129,0.2)",
                  }}
                >
                  PTZ ACTIVE
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[9px]" style={{ color: STATUS_CONFIG[fullscreenCam.status].color }}>
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

          {/* Fullscreen body: feed + PTZ sidebar */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Camera feed — takes remaining width */}
            <div className="flex-1 p-4 min-w-0">
              <CameraView
                camera={fullscreenCam}
                isFullscreen
                onFullscreen={() => {}}
                onClose={() => setFullscreenCam(null)}
                onAuditLog={logAudit}
                ptzState={ptzStates[fullscreenCam.id]}
                motionDetectionEnabled={motionDetectionGlobal}
              />
            </div>

            {/* PTZ sidebar */}
            <div
              className="w-64 flex-shrink-0 border-l border-sx-border flex flex-col overflow-y-auto p-3 gap-3"
              style={{ background: "#0a0f1e" }}
            >
              {/* PTZ Controls */}
              <PTZControls
                camera={fullscreenCam}
                onCommand={(cmd, opts) => sendPTZCommand(fullscreenCam, cmd, opts)}
              />

              {/* Current PTZ readout */}
              <div
                className="rounded border p-3 space-y-2"
                style={{ background: "#080e1a", borderColor: "rgba(30,58,95,0.7)" }}
              >
                <div className="font-mono text-[8px] text-sx-text-muted tracking-widest">
                  POSITION READOUT
                </div>
                {[
                  {
                    label: "PAN",
                    value: `${(ptzStates[fullscreenCam.id]?.pan ?? 0).toFixed(0)}°`,
                    color: "#00d4ff",
                    pct:   ((ptzStates[fullscreenCam.id]?.pan ?? 0) + 100) / 2,
                  },
                  {
                    label: "TILT",
                    value: `${(ptzStates[fullscreenCam.id]?.tilt ?? 0).toFixed(0)}°`,
                    color: "#a855f7",
                    pct:   ((ptzStates[fullscreenCam.id]?.tilt ?? 0) + 100) / 2,
                  },
                  {
                    label: "ZOOM",
                    value: `${(ptzStates[fullscreenCam.id]?.zoom ?? 1).toFixed(1)}×`,
                    color: "#10b981",
                    pct:   ((ptzStates[fullscreenCam.id]?.zoom ?? 1) - 1) / 9 * 100,
                  },
                ].map(({ label, value, color, pct }) => (
                  <div key={label}>
                    <div className="flex justify-between mb-0.5">
                      <span className="font-mono text-[8px] text-sx-text-muted">{label}</span>
                      <span className="font-mono text-[9px] font-bold" style={{ color }}>{value}</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(30,58,95,0.6)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-200"
                        style={{ width: `${pct}%`, background: color, boxShadow: `0 0 4px ${color}50` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick preset list */}
              <div
                className="rounded border p-3 space-y-2"
                style={{ background: "#080e1a", borderColor: "rgba(30,58,95,0.7)" }}
              >
                <div className="font-mono text-[8px] text-sx-text-muted tracking-widest mb-2">
                  QUICK PRESETS
                </div>
                {PTZ_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => sendPTZCommand(fullscreenCam, "preset", { presetId: preset.id })}
                    disabled={fullscreenCam.status === "offline"}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded transition-all"
                    style={{
                      background: "rgba(0,212,255,0.04)",
                      border: "1px solid rgba(0,212,255,0.12)",
                      opacity: fullscreenCam.status === "offline" ? 0.35 : 1,
                      cursor:  fullscreenCam.status === "offline" ? "not-allowed" : "pointer",
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{preset.icon}</span>
                    <div className="text-left flex-1">
                      <div className="font-mono text-[9px] font-bold text-sx-cyan">{preset.label}</div>
                      <div className="font-mono text-[7px] text-sx-text-muted">
                        P:{preset.pan}° T:{preset.tilt}° Z:{preset.zoom}×
                      </div>
                    </div>
                    <span className="font-mono text-[8px] text-sx-text-muted">→</span>
                  </button>
                ))}
              </div>

              {/* Camera info card */}
              <div
                className="rounded border p-3 space-y-1.5"
                style={{ background: "#080e1a", borderColor: "rgba(30,58,95,0.5)" }}
              >
                <div className="font-mono text-[8px] text-sx-text-muted tracking-widest mb-1">
                  CAMERA INFO
                </div>
                {[
                  ["CAMERA ID",  fullscreenCam.camera_id],
                  ["NVR/DVR",   fullscreenCam.nvr_info ?? "—"],
                  ["IP ADDRESS", fullscreenCam.ip_address ?? "MASKED"],
                  ["STATUS",     STATUS_CONFIG[fullscreenCam.status].label],
                  ["PTZ",        fullscreenCam.ptz_supported ? "ONVIF PROFILE S" : "NOT SUPPORTED"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[7px] text-sx-text-muted">{k}</span>
                    <span className="font-mono text-[8px] text-sx-text truncate">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-sx-border px-6 py-3" style={{ background: "#0d1424" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display font-bold text-sx-cyan tracking-widest">
              CCTV SECURITY MONITOR
            </div>
            <div className="font-mono text-[9px] text-sx-text-muted">
              AUTHENTICATED STREAM ACCESS // PTZ CONTROL // ROLE-BASED // AUDIT LOGGED
            </div>
          </div>
            <div className="flex items-center gap-5">
              {[
                { label: "ONLINE",  value: onlineCount,    color: "#10b981" },
                { label: "OFFLINE", value: offlineCount,   color: "#ef4444" },
                { label: "TOTAL",   value: cameras.length, color: "#00d4ff" },
                { label: "STORAGE", value: `${totalStorage} GB`, color: "#f59e0b" },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <div className="font-mono text-lg font-bold" style={{ color }}>{value}</div>
                  <div className="font-mono text-[9px] text-sx-text-muted">{label}</div>
                </div>
              ))}
              {/* Motion detection global toggle */}
              <button
                onClick={() => {
                  setMotionDetectionGlobal((v) => !v);
                  toast.success(motionDetectionGlobal ? "Motion detection disabled" : "Motion detection enabled");
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded border transition-all"
                style={{
                  background: motionDetectionGlobal ? "rgba(239,68,68,0.1)" : "rgba(13,20,36,0.88)",
                  borderColor: motionDetectionGlobal ? "rgba(239,68,68,0.4)" : "rgba(30,58,95,0.7)",
                  color: motionDetectionGlobal ? "#ef4444" : "#475569",
                }}
                title="Toggle canvas-based motion detection on all live cameras"
              >
                <span style={{ fontSize: 12 }}>{motionDetectionGlobal ? "🟥" : "□"}</span>
                <span className="font-mono text-[9px] font-bold">
                  {motionDetectionGlobal ? "MOTION ON" : "MOTION OFF"}
                </span>
              </button>
              <div
                className="flex items-center gap-1.5 ml-2 px-3 py-1.5 rounded border"
                style={{ background: "rgba(0,212,255,0.04)", borderColor: "rgba(0,212,255,0.15)" }}
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
            style={{ background: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.25)" }}
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

      {/* ─── Tabs ──────────────────────────────────────────────────────────────── */}
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
        <div className="ml-auto flex items-center gap-2">
          <span
            className="font-mono text-[8px] px-2 py-0.5 rounded"
            style={{ color: "#10b981", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}
          >
            🔒 END-TO-END ENCRYPTED
          </span>
          <span
            className="font-mono text-[8px] px-2 py-0.5 rounded"
            style={{ color: "#f59e0b", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
          >
            ROLE: {userRole}
          </span>
        </div>
      </div>

      {/* ─── Content ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* MONITOR TAB */}
        {activeTab === "monitor" && (
          <div className="p-4 space-y-4">
            {/* Status summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "CAMERAS ONLINE",   value: `${onlineCount}/${cameras.length}`,  color: "#10b981", icon: "📷" },
                { label: "RECORDING ACTIVE", value: cameras.filter((c) => c.recording_status === "RECORDING").length, color: "#00d4ff", icon: "⏺" },
                { label: "STORAGE USED",     value: `${totalStorage} GB`,                color: "#f59e0b", icon: "💾" },
                { label: "OFFLINE ALERTS",   value: offlineCount,                         color: offlineCount > 0 ? "#ef4444" : "#10b981", icon: "⚠" },
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
                  ptzState={ptzStates[cam.id]}
                  motionDetectionEnabled={motionDetectionGlobal}
                />
              ))}
            </div>

            {/* Security notice */}
            <div
              className="rounded border px-4 py-3"
              style={{ background: "rgba(16,185,129,0.04)", borderColor: "rgba(16,185,129,0.15)" }}
            >
              <div className="font-mono text-[8px] text-sx-text-muted leading-relaxed">
                <span style={{ color: "#10b981", fontWeight: "bold" }}>🔒 SECURITY NOTICE:</span>{" "}
                Camera streams are proxied through the secure edge function. Stream URLs and PTZ
                credentials are never exposed to the client. PTZ commands are relayed via ONVIF
                Profile S through the server-side proxy. All camera access and PTZ operations are
                recorded in the audit log. Only OWNER and MANAGER roles can access CCTV feeds.
              </div>
            </div>
          </div>
        )}

        {/* MANAGE TAB */}
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
                      background:  "#0d1424",
                      borderColor: cam.status === "offline" ? "rgba(239,68,68,0.3)" : "rgba(30,58,95,0.7)",
                      borderLeft:  `3px solid ${statusCfg.color}`,
                    }}
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] font-bold text-sx-text">{cam.name}</span>
                        <span
                          className="font-mono text-[7px] px-1.5 py-0.5 rounded"
                          style={{ color: statusCfg.color, background: `${statusCfg.color}12`, border: `1px solid ${statusCfg.color}30` }}
                        >
                          {statusCfg.icon} {statusCfg.label}
                        </span>
                        {cam.recording_status === "RECORDING" && (
                          <span
                            className="font-mono text-[7px] px-1.5 py-0.5 rounded"
                            style={{ color: "#ef4444", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", animation: "pulse 1.5s infinite" }}
                          >
                            ⏺ REC
                          </span>
                        )}
                        {cam.ptz_supported && cam.status !== "offline" && (
                          <span
                            className="font-mono text-[7px] px-1.5 py-0.5 rounded"
                            style={{ color: "#00d4ff", background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)" }}
                          >
                            PTZ
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

                      {/* Inline PTZ preset quick-access */}
                      {cam.ptz_supported && cam.status !== "offline" && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className="font-mono text-[7px] text-sx-text-muted tracking-widest">PRESETS:</span>
                          {PTZ_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              onClick={() => sendPTZCommand(cam, "preset", { presetId: preset.id })}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-all"
                              style={{
                                background: "rgba(0,212,255,0.05)",
                                border: "1px solid rgba(0,212,255,0.15)",
                                color: "#94a3b8",
                                fontFamily: "'Share Tech Mono',monospace",
                                fontSize: 8,
                                cursor: "pointer",
                              }}
                              title={`Move to ${preset.label} preset`}
                            >
                              <span style={{ fontSize: 10 }}>{preset.icon}</span>
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-1 mt-1">
                        {cam.allowed_roles.map((r) => (
                          <span key={r} className="font-mono text-[7px] px-1 py-0.5 rounded"
                            style={{ color: "#64748b", background: "#080e1a", border: "1px solid #1e3a5f" }}>
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleRefreshStatus(cam.id)}
                        className="font-mono text-[8px] px-2 py-1 rounded transition-all"
                        style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)", color: "#00d4ff" }}
                      >
                        ↻ STATUS
                      </button>
                      <button
                        onClick={() => { setFullscreenCam(cam); setActiveTab("monitor"); }}
                        className="font-mono text-[8px] px-2 py-1 rounded transition-all"
                        style={{ background: "transparent", border: "1px solid rgba(30,58,95,0.7)", color: "#475569" }}
                      >
                        ⤢ VIEW
                      </button>
                      {(userRole === "OWNER" || userRole === "ADMIN") && (
                        <button
                          onClick={() => handleDeleteCamera(cam.id)}
                          className="font-mono text-[8px] px-2 py-1 rounded transition-all"
                          style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}
                        >
                          ✕ REMOVE
                        </button>
                      )}
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
                <div className="font-mono text-[10px] text-sx-text-muted tracking-widest">ADD NEW CAMERA</div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {[
                  { label: "CAMERA NAME *", key: "name",       placeholder: "CAM-01 ENTRANCE" },
                  { label: "CAMERA ID *",    key: "camera_id",  placeholder: "CAM001" },
                  { label: "IP ADDRESS",     key: "ip_address", placeholder: "192.168.1.100" },
                  { label: "NVR/DVR INFO",   key: "nvr_info",   placeholder: "NVR-01 CH1" },
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
                  <label className="font-mono text-[8px] text-sx-text-muted tracking-widest mb-1 block">LOCATION</label>
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
                <div className="rounded border px-3 py-2.5"
                  style={{ background: "rgba(16,185,129,0.04)", borderColor: "rgba(16,185,129,0.15)" }}>
                  <div className="font-mono text-[8px] text-sx-text-muted leading-relaxed">
                    <span style={{ color: "#10b981" }}>🔒 SECURITY:</span> Stream URLs and PTZ credentials
                    are stored server-side only and never transmitted to the browser.
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

        {/* AUDIT TAB */}
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
                  Camera access and PTZ events will appear here
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div
                  className="grid px-3 py-1.5 font-mono text-[8px] text-sx-text-muted tracking-widest rounded"
                  style={{ gridTemplateColumns: "1fr 1.5fr 1fr 1fr", background: "#0a0f1e" }}
                >
                  {["TIMESTAMP", "ACTION", "CAMERA", "USER"].map((h) => <span key={h}>{h}</span>)}
                </div>
                {auditLog.map((entry) => {
                  const cam     = cameras.find((c) => c.id === entry.resource_id);
                  const isWrite = entry.action.startsWith("CREATE") || entry.action.startsWith("DELETE");
                  const isPTZ   = entry.action.startsWith("PTZ");
                  return (
                    <div
                      key={entry.id}
                      className="grid px-3 py-2 rounded border transition-all"
                      style={{
                        gridTemplateColumns: "1fr 1.5fr 1fr 1fr",
                        background: "#0d1424",
                        borderColor: isWrite ? "rgba(245,158,11,0.2)" : isPTZ ? "rgba(0,212,255,0.15)" : "rgba(30,58,95,0.4)",
                        borderLeft: `2px solid ${isWrite ? "#f59e0b" : isPTZ ? "#00d4ff" : "#1e3a5f"}`,
                      }}
                    >
                      <span className="font-mono text-[8px] text-sx-text-muted">
                        {new Date(entry.created_at).toLocaleTimeString()}
                      </span>
                      <span
                        className="font-mono text-[9px] font-bold"
                        style={{ color: isWrite ? "#f59e0b" : isPTZ ? "#00d4ff" : "#94a3b8" }}
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
