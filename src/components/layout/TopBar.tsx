// src/components/layout/TopBar.tsx
import { useState, useEffect } from "react";
import type { ThreatAssessment } from "@/types/entities";
import { severityToColor } from "@/lib/threatAssessor";

interface TopBarProps {
  threatAssessment: ThreatAssessment;
  isConnected: boolean;
  latencyMs: number;
  messageRate: number;
  totalEntityCount: number;
  lastSync: string;
  onToggleSidebar: () => void;
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
}: TopBarProps) {
  const [time, setTime] = useState(() => new Date());
  const [blinkState, setBlinkState] = useState(true);

  useEffect(() => {
    const tick = setInterval(() => setTime(new Date()), 1000);
    const blink = setInterval(() => setBlinkState((v) => !v), 800);
    return () => { clearInterval(tick); clearInterval(blink); };
  }, []);

  const utcTime = time.toUTCString().split(" ")[4];
  const utcDate = time.toISOString().split("T")[0];
  const threatColor = severityToColor(threatAssessment.globalThreatLevel);
  const isCritical = threatAssessment.globalThreatLevel === "CRITICAL";

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
        <div className="flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-3">
            {/* Threat Index Arc */}
            <div className="relative flex items-center justify-center w-10 h-10">
              <svg viewBox="0 0 40 40" className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx="20" cy="20" r="16" fill="none" stroke="#1e3a5f" strokeWidth="3" />
                <circle
                  cx="20" cy="20" r="16"
                  fill="none"
                  stroke={threatColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${(threatAssessment.threatIndex / 100) * 100.5} 100.5`}
                  style={{ filter: `drop-shadow(0 0 4px ${threatColor})`, transition: "stroke-dasharray 1s ease" }}
                />
              </svg>
              <span className="font-mono text-[10px] font-bold relative z-10" style={{ color: threatColor }}>
                {threatAssessment.threatIndex}
              </span>
            </div>

            <div>
              <div className="font-mono text-[9px] text-sx-text-muted tracking-widest uppercase">
                THREAT INDEX
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
              <div className="font-mono text-[9px] text-sx-amber border border-sx-amber/30 bg-sx-amber/10 px-2 py-0.5 rounded">
                {threatAssessment.activeCrisisZones.length} ACTIVE AO{threatAssessment.activeCrisisZones.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>

        {/* Right: System Status + Time */}
        <div className="flex items-center gap-5 text-right">
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

          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-sx-green" : "bg-sx-red"}`}
              style={{
                boxShadow: isConnected ? "0 0 6px #10b981" : "0 0 6px #ef4444",
                animation: isConnected ? "pulse 2s infinite" : "none",
              }}
            />
            <span className="font-mono text-[9px] text-sx-text-muted hidden md:block">
              {isConnected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
        </div>
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
