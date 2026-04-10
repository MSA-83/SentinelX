// src/components/features/StatusBar.tsx
// Bottom status bar — system telemetry, data source status, operator controls

import { useState, useEffect } from "react";
import type { DomainKey, LayerState } from "@/types/entities";
import { DOMAIN_CONFIGS } from "@/constants/domains";

interface StatusBarProps {
  layerStates: Record<DomainKey, LayerState>;
  lastSync: string;
  isConnected: boolean;
  showHotspots: boolean;
  showTrails: boolean;
  onToggleHotspots: () => void;
  onToggleTrails: () => void;
}

export function StatusBar({
  layerStates,
  lastSync,
  isConnected,
  showHotspots,
  showTrails,
  onToggleHotspots,
  onToggleTrails,
}: StatusBarProps) {
  const [frameCount, setFrameCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setFrameCount((c) => c + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const syncTime = lastSync ? new Date(lastSync).toUTCString().split(" ")[4] + "Z" : "--:--:--Z";

  return (
    <div
      className="flex-shrink-0 h-8 bg-sx-surface border-t border-sx-border flex items-center px-3 gap-4 overflow-hidden"
      style={{ boxShadow: "0 -2px 8px rgba(0,0,0,0.4)" }}
    >
      {/* Left: Data source status indicators */}
      <div className="flex items-center gap-3 flex-1 overflow-hidden">
        <span className="font-mono text-[9px] text-sx-text-muted tracking-widest flex-shrink-0">SOURCES:</span>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {Object.entries(layerStates).map(([domain, layer]) => {
            const config = DOMAIN_CONFIGS[domain as DomainKey];
            const statusColor = {
              live: "#10b981",
              degraded: "#f59e0b",
              offline: "#ef4444",
            }[layer.status];

            return (
              <div key={domain} className="flex items-center gap-1 flex-shrink-0">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: layer.enabled ? statusColor : "#1e3a5f",
                    boxShadow: layer.enabled && layer.status === "live" ? `0 0 3px ${statusColor}` : "none",
                  }}
                />
                <span
                  className="font-mono text-[9px]"
                  style={{ color: layer.enabled ? statusColor : "#1e3a5f" }}
                >
                  {config?.shortLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Center: Toggles */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <ToggleButton label="HOTSPOTS" active={showHotspots} onClick={onToggleHotspots} />
        <ToggleButton label="TRAILS" active={showTrails} onClick={onToggleTrails} />
      </div>

      {/* Right: System telemetry */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="font-mono text-[9px] text-sx-text-muted">
          SYNC: <span className="text-sx-cyan">{syncTime}</span>
        </div>
        <div className="font-mono text-[9px] text-sx-text-muted">
          FRAME: <span className="text-sx-cyan">{frameCount.toString().padStart(6, "0")}</span>
        </div>
        <div className="flex items-center gap-1">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: isConnected ? "#10b981" : "#ef4444",
              boxShadow: isConnected ? "0 0 4px #10b981" : "none",
            }}
          />
          <span className="font-mono text-[9px] text-sx-text-muted">
            {isConnected ? "STREAM: ACTIVE" : "STREAM: OFFLINE"}
          </span>
        </div>
        <div className="font-mono text-[9px] text-sx-text-muted">
          SENTCOM // OPERATOR: <span className="text-sx-cyan">SX-ANALYST-7</span>
        </div>
      </div>
    </div>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider transition-all ${
        active
          ? "bg-sx-cyan/15 text-sx-cyan border border-sx-cyan/30"
          : "text-sx-text-muted border border-sx-border-dim hover:text-sx-text"
      }`}
    >
      <div
        className={`w-1.5 h-1.5 rounded-full ${active ? "bg-sx-cyan" : "bg-sx-text-muted"}`}
        style={active ? { boxShadow: "0 0 4px #00d4ff" } : {}}
      />
      {label}
    </button>
  );
}
