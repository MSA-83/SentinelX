
// src/components/layout/TopBar.tsx
import { useState, useEffect } from "react";
import type { ThreatAssessment } from "@/types/entities";
import { severityToColor } from "@/lib/threatAssessor";
import { ThreatMeter } from "@/components/features/ThreatMeter";

export type MapOverlayMode = "normal" | "flir" | "nightvision";

interface TopBarProps {
  threatAssessment: ThreatAssessment;
  isConnected: boolean;
  latencyMs: number;
  messageRate: number;
  totalEntityCount: number;
  lastSync: string;
  onToggleSidebar: () => void;
  onOpenCommandBar: () => void;
  overlayMode: MapOverlayMode;
  onOverlayModeChange: (mode: MapOverlayMode) => void;
  onOpenCopilot?: () => void;
  copilotOpen?: boolean;
}

const THREAT_LEVEL_LABELS: Record<string, string> = {
  CRITICAL: "CRITICAL — IMMEDIATE ACTION REQUIRED",
  HIGH: "HIGH — ELEVATED THREAT POSTURE",
  MEDIUM: "MEDIUM — MONITOR SITUATION",
  LOW: "LOW — NORMAL OPERATIONS",
  INFO: "MINIMAL — ROUTINE MONITORING",
};

export function TopBar({
  threatAssessment,
  isConnected,
  latencyMs,
  messageRate,
  totalEntityCount,
  lastSync,
  onToggleSidebar,
  onOpenCommandBar,
  overlayMode,
  onOverlayModeChange,
  onOpenCopilot,
  copilotOpen,
}: TopBarProps) {
  const [time, setTime] = useState(() => new Date());
  const [blinkState, setBlinkState] = useState(true);

  useEffect(() => {
    const tick = setInterval(() => setTime(new Date()), 1000);
    const blink = setInterval(() => setBlinkState((v) => !v), 800);
    return () => { clearInterval(tick); clearInterval(blink); };
  }, []);

  const utcTime    = time.toUTCString().split(" ")[4];
  const utcDate    = time.toISOString().split("T")[0];
  const threatColor = severityToColor(threatAssessment.globalThreatLevel);
  const isCritical  = threatAssessment.globalThreatLevel === "CRITICAL";

  // Keyboard shortcut for command bar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        onOpenCommandBar();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenCommandBar]);

  return (
    <div className="flex-shrink-0 z-50">
      {/* Classification Banner */}
      <div className="bg-sx-red/20 border-b border-sx-red/40 px-4 py-1 text-center">
        <span className="sx-classification text-sx-red text-[10px]">
          ⚠ TOP SECRET // SENTINEL // NOFORN // REL TO USA, FVEY ⚠
        </span>
      </div>

      {/* Main Top Bar */}
      <div
        className="bg-sx-surface border-b border-sx-border flex items-center justify-between px-4 h-12"
        style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.06)" }}
      >
        {/* Left: Logo + System ID */}
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={onToggleSidebar}
            className="text-sx-text-dim hover:text-sx-cyan transition-colors p-1 rounded"
            title="Toggle navigation"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect y="2" width="16" height="1.5" rx="1" />
              <rect y="7.25" width="16" height="1.5" rx="1" />
              <rect y="12.5" width="16" height="1.5" rx="1" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <div className="relative">
              <div
                className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold"
                style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.4)", color: "#00d4ff" }}
              >
                SX
              </div>
              {isConnected && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-sx-green"
                  style={{ boxShadow: "0 0 4px #10b981" }} />
              )}
            </div>
            <div>
              <div className="font-display font-bold text-sx-cyan tracking-widest text-sm leading-none">
                SENTINEL-X
              </div>
              <div className="font-mono text-[9px] text-sx-text-muted leading-none mt-0.5">
                GLOBAL SITUATIONAL AWARENESS v6.3 // CLEARANCE: TS/SCI
              </div>
            </div>
          </div>
        </div>

        {/* Center: Threat Level */}
        <div className="flex items-center gap-4 absolute left-1/2 -translate-x-1/2">
          <ThreatMeter assessment={threatAssessment} size={48} />
          <div>
            <div className="font-mono text-[9px] text-sx-text-muted tracking-widest">
              THREAT LEVEL
            </div>
            <div
              className="font-display font-bold text-xs tracking-wider"
              style={{
                color: threatColor,
                textShadow: isCritical && blinkState ? `0 0 12px ${threatColor}` : "none",
              }}
            >
              {threatAssessment.globalThreatLevel}
            </div>
          </div>
          {threatAssessment.activeCrisisZones.length > 0 && (
            <div className="hidden xl:block font-mono text-[9px] text-sx-amber border border-sx-amber/30 bg-sx-amber/10 px-2 py-0.5 rounded">
              {threatAssessment.activeCrisisZones.length} ACTIVE AO{threatAssessment.activeCrisisZones.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Right: Overlay modes + Search + Status + Time */}
        <div className="flex items-center gap-3 text-right">
          {/* Map overlay mode */}
          <div className="hidden lg:flex items-center gap-1 rounded p-0.5" style={{ background: "#0a0f1e", border: "1px solid #0f2040" }}>
            {(["normal", "flir", "nightvision"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onOverlayModeChange(mode)}
                className="px-2 py-1 rounded font-mono text-[8px] uppercase tracking-wider transition-all"
                style={{
                  background: overlayMode === mode ? (mode === "flir" ? "rgba(249,115,22,0.2)" : mode === "nightvision" ? "rgba(16,185,129,0.15)" : "rgba(0,212,255,0.12)") : "transparent",
                  color: overlayMode === mode ? (mode === "flir" ? "#f97316" : mode === "nightvision" ? "#10b981" : "#00d4ff") : "#334155",
                  border: overlayMode === mode ? `1px solid ${mode === "flir" ? "#f9731630" : mode === "nightvision" ? "#10b98130" : "#00d4ff30"}` : "1px solid transparent",
                }}
              >
                {mode === "normal" ? "TACT" : mode === "flir" ? "FLIR" : "NV"}
              </button>
            ))}
          </div>

          {/* Command bar trigger */}
          <button
            onClick={onOpenCommandBar}
            className="hidden md:flex items-center gap-2 px-2 py-1 rounded font-mono text-[9px] transition-all"
            style={{
              background: "#0a0f1e",
              border: "1px solid #0f2040",
              color: "#334155",
            }}
            title="Open command bar (Ctrl+K)"
          >
            <span>⌕</span>
            <span>SEARCH</span>
            <kbd className="px-1 py-0.5 rounded text-[8px]" style={{ background: "#1e3a5f", color: "#475569" }}>⌃K</kbd>
          </button>

          {/* AI Copilot toggle */}
          {onOpenCopilot && (
            <button
              onClick={onOpenCopilot}
              className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[9px] transition-all"
              style={{
                background: copilotOpen ? "rgba(168,85,247,0.15)" : "#0a0f1e",
                border: copilotOpen ? "1px solid rgba(168,85,247,0.35)" : "1px solid #0f2040",
                color: copilotOpen ? "#a855f7" : "#334155",
              }}
              title="AI Analyst (Ctrl+I)"
            >
              <span>✦</span>
              <span>AI</span>
            </button>
          )}
          {/* Metrics */}
          <div className="hidden lg:flex items-center gap-4">
            <div className="text-center">
              <div className="font-mono text-sx-cyan text-sm font-bold leading-none">{totalEntityCount}</div>
              <div className="font-mono text-[9px] text-sx-text-muted">ENTITIES</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-sx-green text-sm font-bold leading-none">{messageRate}/s</div>
              <div className="font-mono text-[9px] text-sx-text-muted">MSG RATE</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-sx-amber text-sm font-bold leading-none">{latencyMs}ms</div>
              <div className="font-mono text-[9px] text-sx-text-muted">LATENCY</div>
            </div>
          </div>

          <div className="w-px h-7 bg-sx-border hidden lg:block" />

          {/* Clock */}
          <div className="text-right">
            <div className="font-mono text-sx-cyan text-sm font-bold leading-none tracking-widest">
              {utcTime}Z
            </div>
            <div className="font-mono text-[9px] text-sx-text-muted">{utcDate} UTC</div>
          </div>
        </div> {/* This closing div tag was missing */}
      </div>

      {/* Crisis alert strip */}
      {isCritical && threatAssessment.activeCrisisZones.length > 0 && (
        <div
          className="bg-sx-red/10 border-b border-sx-red/30 px-4 py-1 flex items-center gap-3"
          style={{ animation: "pulse 2s infinite" }}
        >
          <span className="font-mono text-sx-red text-[10px] font-bold tracking-widest">⚡ FLASH ALERT</span>
          <span className="font-mono text-sx-red/80 text-[10px]">
            CRITICAL ACTIVITY DETECTED IN: {threatAssessment.activeCrisisZones.join(" · ")}
          </span>
          <span className="ml-auto font-mono text-sx-red/60 text-[9px]">
            {threatAssessment.criticalEntityCount} CRITICAL ENTITIES · {threatAssessment.anomalyCount} ANOMALIES
          </span>
        </div>
      )}
    </div>
  );
}
