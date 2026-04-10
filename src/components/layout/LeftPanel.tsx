// src/components/layout/LeftPanel.tsx
import { useState } from "react";
import type { DomainKey, LayerState, ThreatAssessment, MissionWorkspace } from "@/types/entities";
import { DOMAIN_CONFIGS, DOMAIN_ORDER } from "@/constants/domains";
import { severityToColor } from "@/lib/threatAssessor";

interface LeftPanelProps {
  layerStates: Record<DomainKey, LayerState>;
  onToggleLayer: (domain: DomainKey) => void;
  threatAssessment: ThreatAssessment;
  activeWorkspace: MissionWorkspace | null;
  workspaces: MissionWorkspace[];
  onSelectWorkspace: (ws: MissionWorkspace) => void;
  visible: boolean;
}

const STATUS_COLORS = {
  live: "#10b981",
  degraded: "#f59e0b",
  offline: "#ef4444",
};

const WORKSPACE_CLASSIFICATION_COLORS = {
  UNCLASSIFIED: "#10b981",
  CONFIDENTIAL: "#3b82f6",
  SECRET: "#f59e0b",
  TOP_SECRET: "#ef4444",
};

export function LeftPanel({
  layerStates,
  onToggleLayer,
  threatAssessment,
  activeWorkspace,
  workspaces,
  onSelectWorkspace,
  visible,
}: LeftPanelProps) {
  const [activeTab, setActiveTab] = useState<"layers" | "workspaces" | "aoi">("layers");

  if (!visible) return null;

  return (
    <div
      className="w-72 flex-shrink-0 flex flex-col bg-sx-panel border-r border-sx-border overflow-hidden animate-slide-in-left"
      style={{ boxShadow: "2px 0 16px rgba(0,0,0,0.5)" }}
    >
      {/* Panel header */}
      <div className="border-b border-sx-border px-3 py-2 flex items-center justify-between">
        <span className="sx-label text-[10px]">TACTICAL CONTROL</span>
        <div className="flex gap-1">
          {(["layers", "workspaces", "aoi"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider uppercase transition-all ${
                activeTab === tab
                  ? "bg-sx-cyan/20 text-sx-cyan border border-sx-cyan/30"
                  : "text-sx-text-muted hover:text-sx-text border border-transparent"
              }`}
            >
              {tab === "layers" ? "LYR" : tab === "workspaces" ? "WS" : "AOI"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "layers" && (
          <LayersTab
            layerStates={layerStates}
            onToggleLayer={onToggleLayer}
            threatAssessment={threatAssessment}
          />
        )}
        {activeTab === "workspaces" && (
          <WorkspacesTab
            workspaces={workspaces}
            activeWorkspace={activeWorkspace}
            onSelectWorkspace={onSelectWorkspace}
          />
        )}
        {activeTab === "aoi" && <AoiTab threatAssessment={threatAssessment} />}
      </div>

      {/* Bottom stats */}
      <div className="border-t border-sx-border p-3 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "CRITICAL", value: threatAssessment.criticalEntityCount, color: "#ef4444" },
            { label: "HIGH", value: threatAssessment.highEntityCount, color: "#f59e0b" },
            { label: "ANOMALY", value: threatAssessment.anomalyCount, color: "#ec4899" },
          ].map((stat) => (
            <div key={stat.label} className="text-center p-2 rounded bg-sx-surface border border-sx-border-dim">
              <div className="font-mono text-lg font-bold leading-none" style={{ color: stat.color }}>
                {stat.value}
              </div>
              <div className="font-mono text-[8px] text-sx-text-muted mt-1 tracking-wider">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[9px] font-mono text-sx-text-muted">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: severityToColor(threatAssessment.globalThreatLevel), boxShadow: `0 0 4px ${severityToColor(threatAssessment.globalThreatLevel)}` }}
          />
          <span className="truncate">
            {threatAssessment.activeCrisisZones.length > 0
              ? `AO: ${threatAssessment.activeCrisisZones[0]}${threatAssessment.activeCrisisZones.length > 1 ? ` +${threatAssessment.activeCrisisZones.length - 1}` : ""}`
              : "No active crisis zones"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Layers Tab ───────────────────────────────────────────────────────────────

function LayersTab({
  layerStates,
  onToggleLayer,
  threatAssessment,
}: Pick<LeftPanelProps, "layerStates" | "onToggleLayer" | "threatAssessment">) {
  return (
    <div className="p-2 space-y-1">
      <div className="px-2 py-1 text-[9px] font-mono text-sx-text-muted tracking-widest">
        INTELLIGENCE DOMAINS ({DOMAIN_ORDER.length})
      </div>
      {DOMAIN_ORDER.map((domain) => {
        const config = DOMAIN_CONFIGS[domain];
        const layer = layerStates[domain];
        const domainThreat = threatAssessment.domainThreatLevels?.[domain];

        if (!layer) return null;

        return (
          <button
            key={domain}
            onClick={() => onToggleLayer(domain)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-all group ${
              layer.enabled
                ? "bg-sx-surface hover:bg-sx-border/30 border border-sx-border-dim"
                : "bg-transparent hover:bg-sx-surface/50 border border-transparent opacity-50"
            }`}
          >
            {/* Toggle indicator */}
            <div
              className={`w-0.5 h-6 rounded-full flex-shrink-0 transition-all ${
                layer.enabled ? "opacity-100" : "opacity-20"
              }`}
              style={{ background: layer.enabled ? config.color : "#475569" }}
            />

            {/* Domain icon */}
            <span className="text-base flex-shrink-0" style={{ filter: layer.enabled ? "none" : "grayscale(1)" }}>
              {config.icon}
            </span>

            {/* Info */}
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between gap-1">
                <span
                  className="font-display font-semibold text-xs truncate"
                  style={{ color: layer.enabled ? config.color : "#475569" }}
                >
                  {config.label}
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Threat level dot */}
                  {domainThreat && domainThreat !== "INFO" && (
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: severityToColor(domainThreat) }}
                    />
                  )}
                  {/* Entity count */}
                  <span className="font-mono text-[9px] text-sx-text-muted">{layer.entityCount}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {/* Status indicator */}
                <span
                  className="w-1 h-1 rounded-full flex-shrink-0"
                  style={{
                    background: STATUS_COLORS[layer.status],
                    boxShadow: layer.status === "live" ? `0 0 3px ${STATUS_COLORS[layer.status]}` : "none",
                  }}
                />
                <span className="font-mono text-[9px] text-sx-text-muted tracking-wider">
                  {layer.status.toUpperCase()}
                </span>
                <span className="font-mono text-[8px] text-sx-text-muted/60 ml-auto">
                  {config.shortLabel}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Workspaces Tab ───────────────────────────────────────────────────────────

function WorkspacesTab({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
}: Pick<LeftPanelProps, "workspaces" | "activeWorkspace" | "onSelectWorkspace">) {
  return (
    <div className="p-2 space-y-1">
      <div className="px-2 py-1 text-[9px] font-mono text-sx-text-muted tracking-widest">
        MISSION WORKSPACES ({workspaces.length})
      </div>
      {workspaces.map((ws) => (
        <button
          key={ws.id}
          onClick={() => onSelectWorkspace(ws)}
          className={`w-full text-left px-3 py-2.5 rounded border transition-all ${
            activeWorkspace?.id === ws.id
              ? "bg-sx-cyan/10 border-sx-cyan/40"
              : "bg-sx-surface border-sx-border-dim hover:border-sx-border"
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-display font-semibold text-xs text-sx-text truncate">{ws.name}</span>
            <span
              className="font-mono text-[8px] px-1.5 py-0.5 rounded flex-shrink-0"
              style={{
                color: WORKSPACE_CLASSIFICATION_COLORS[ws.classification],
                background: `${WORKSPACE_CLASSIFICATION_COLORS[ws.classification]}15`,
                border: `1px solid ${WORKSPACE_CLASSIFICATION_COLORS[ws.classification]}40`,
              }}
            >
              {ws.classification.replace("_", " ")}
            </span>
          </div>
          <div className="font-mono text-[9px] text-sx-text-muted">
            {ws.activeDomains.length} domains · {ws.operator}
          </div>
          {ws.aoi && (
            <div className="font-mono text-[9px] text-sx-cyan/70 mt-0.5">
              AOI: {ws.aoi.name}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── AOI Tab ──────────────────────────────────────────────────────────────────

function AoiTab({ threatAssessment }: { threatAssessment: ThreatAssessment }) {
  return (
    <div className="p-3 space-y-3">
      <div className="text-[9px] font-mono text-sx-text-muted tracking-widest px-1">
        AREAS OF INTEREST
      </div>

      {[
        { name: "Eastern Ukraine", status: "ACTIVE", threat: "CRITICAL" as const, entities: 23 },
        { name: "Taiwan Strait", status: "MONITOR", threat: "HIGH" as const, entities: 18 },
        { name: "Red Sea (Bab-el-Mandeb)", status: "ACTIVE", threat: "HIGH" as const, entities: 14 },
        { name: "Korean Peninsula", status: "MONITOR", threat: "MEDIUM" as const, entities: 9 },
        { name: "South China Sea", status: "MONITOR", threat: "HIGH" as const, entities: 22 },
        { name: "Persian Gulf", status: "WATCH", threat: "MEDIUM" as const, entities: 11 },
        { name: "Sahel Region", status: "WATCH", threat: "MEDIUM" as const, entities: 7 },
        { name: "Myanmar", status: "MONITOR", threat: "MEDIUM" as const, entities: 5 },
      ].map((zone) => (
        <div key={zone.name} className="rounded border border-sx-border-dim bg-sx-surface p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="font-display font-semibold text-[11px] text-sx-text">{zone.name}</span>
            <span
              className="font-mono text-[8px] px-1.5 py-0.5 rounded"
              style={{
                color: severityToColor(zone.threat),
                background: `${severityToColor(zone.threat)}15`,
                border: `1px solid ${severityToColor(zone.threat)}40`,
              }}
            >
              {zone.threat}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] text-sx-text-muted">{zone.entities} tracked entities</span>
            <span
              className="font-mono text-[9px]"
              style={{
                color: zone.status === "ACTIVE" ? "#ef4444" : zone.status === "MONITOR" ? "#f59e0b" : "#0ea5e9",
              }}
            >
              ● {zone.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
