// src/components/layout/RightPanel.tsx
import { useState } from "react";
import type { StreamEvent, SentinelEntity, ThreatAssessment } from "@/types/entities";
import { severityToColor, severityToBgColor } from "@/lib/threatAssessor";
import { DOMAIN_CONFIGS } from "@/constants/domains";

interface RightPanelProps {
  events: StreamEvent[];
  onAcknowledge: (id: string) => void;
  selectedEntity: SentinelEntity | null;
  onClearSelection: () => void;
  threatAssessment: ThreatAssessment;
  visible: boolean;
}

export function RightPanel({
  events,
  onAcknowledge,
  selectedEntity,
  onClearSelection,
  threatAssessment,
  visible,
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<"events" | "entity" | "intel">("events");

  // Auto-switch to entity tab when entity selected
  const currentTab = selectedEntity ? "entity" : activeTab;

  if (!visible) return null;

  return (
    <div
      className="w-80 flex-shrink-0 flex flex-col bg-sx-panel border-l border-sx-border overflow-hidden animate-slide-in-right"
      style={{ boxShadow: "-2px 0 16px rgba(0,0,0,0.5)" }}
    >
      {/* Panel header tabs */}
      <div className="border-b border-sx-border px-3 py-2 flex items-center gap-1">
        {(["events", "entity", "intel"] as const).map((tab) => {
          const unreadCount = tab === "events" ? events.filter((e) => !e.acknowledged).length : 0;
          return (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab !== "entity") onClearSelection();
              }}
              className={`flex-1 py-1.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase transition-all relative ${
                currentTab === tab
                  ? "bg-sx-cyan/20 text-sx-cyan border border-sx-cyan/30"
                  : "text-sx-text-muted hover:text-sx-text border border-transparent"
              }`}
            >
              {tab === "events" ? "ALERTS" : tab === "entity" ? "ENTITY" : "INTEL"}
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-sx-red text-white text-[8px] flex items-center justify-center font-bold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {currentTab === "events" && (
          <EventFeedTab events={events} onAcknowledge={onAcknowledge} />
        )}
        {currentTab === "entity" && (
          <EntityDetailTab entity={selectedEntity} onClose={onClearSelection} />
        )}
        {currentTab === "intel" && (
          <IntelTab threatAssessment={threatAssessment} />
        )}
      </div>
    </div>
  );
}

// ─── Event Feed Tab ───────────────────────────────────────────────────────────

function EventFeedTab({
  events,
  onAcknowledge,
}: {
  events: StreamEvent[];
  onAcknowledge: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"ALL" | "UNREAD" | "CRITICAL">("ALL");

  const filtered = events.filter((e) => {
    if (filter === "UNREAD") return !e.acknowledged;
    if (filter === "CRITICAL") return e.severity === "CRITICAL" || e.severity === "HIGH";
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex gap-1 px-2 py-1.5 border-b border-sx-border-dim">
        {(["ALL", "UNREAD", "CRITICAL"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase transition-all ${
              filter === f ? "bg-sx-cyan/20 text-sx-cyan" : "text-sx-text-muted hover:text-sx-text"
            }`}
          >
            {f}
            {f === "UNREAD" && (
              <span className="ml-1 text-sx-red">{events.filter((e) => !e.acknowledged).length}</span>
            )}
          </button>
        ))}
        <span className="ml-auto font-mono text-[9px] text-sx-text-muted self-center">
          {filtered.length}/{events.length}
        </span>
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto divide-y divide-sx-border-dim">
        {filtered.map((event) => (
          <EventItem key={event.id} event={event} onAcknowledge={onAcknowledge} />
        ))}
        {filtered.length === 0 && (
          <div className="p-8 text-center">
            <div className="font-mono text-sx-text-muted text-xs">NO EVENTS MATCH FILTER</div>
          </div>
        )}
      </div>
    </div>
  );
}

function EventItem({
  event,
  onAcknowledge,
}: {
  event: StreamEvent;
  onAcknowledge: (id: string) => void;
}) {
  const color = severityToColor(event.severity);
  const bg = severityToBgColor(event.severity);
  const config = DOMAIN_CONFIGS[event.domain];
  const ts = new Date(event.ts);
  const timeStr = ts.toUTCString().split(" ")[4] + "Z";

  return (
    <div
      className={`px-3 py-2.5 transition-all group ${
        event.acknowledged ? "opacity-40" : "hover:bg-sx-surface/60"
      } animate-fade-in`}
      style={{ borderLeft: `2px solid ${event.acknowledged ? "#1e3a5f" : color}` }}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs flex-shrink-0">{config?.icon}</span>
          <span
            className="font-mono text-[10px] font-bold leading-tight"
            style={{ color }}
          >
            {event.title}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span
            className="font-mono text-[8px] px-1 py-0.5 rounded"
            style={{ color, background: bg, border: `1px solid ${color}40` }}
          >
            {event.severity}
          </span>
          {!event.acknowledged && (
            <button
              onClick={() => onAcknowledge(event.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-[8px] font-mono text-sx-text-muted hover:text-sx-cyan px-1"
              title="Acknowledge"
            >
              ACK
            </button>
          )}
        </div>
      </div>
      <p className="font-mono text-[9px] text-sx-text-dim leading-relaxed mb-1.5 line-clamp-2">
        {event.description}
      </p>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[8px] text-sx-text-muted">{timeStr}</span>
        <span className="font-mono text-[8px] text-sx-text-muted uppercase">{config?.shortLabel ?? event.domain}</span>
      </div>
    </div>
  );
}

// ─── Entity Detail Tab ────────────────────────────────────────────────────────

function EntityDetailTab({
  entity,
  onClose,
}: {
  entity: SentinelEntity | null;
  onClose: () => void;
}) {
  if (!entity) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="text-4xl mb-4 opacity-30">⊕</div>
        <div className="font-mono text-xs text-sx-text-muted">SELECT AN ENTITY ON MAP</div>
        <div className="font-mono text-[9px] text-sx-text-muted/60 mt-1">
          Click any marker to inspect entity data
        </div>
      </div>
    );
  }

  const config = DOMAIN_CONFIGS[entity.domain];
  const color = severityToColor(entity.severity);

  const formatCoord = (lat: number, lon: number) => {
    const latStr = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
    const lonStr = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
    return `${latStr} ${lonStr}`;
  };

  const tsFormatted = new Date(entity.ts).toUTCString();

  return (
    <div className="p-3 space-y-3 animate-fade-in">
      {/* Entity header */}
      <div
        className="rounded p-3 border"
        style={{ background: `${color}08`, borderColor: `${color}30` }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{config?.icon}</span>
            <div>
              <div className="font-display font-bold text-sm text-sx-text">{entity.label}</div>
              <div className="font-mono text-[9px] text-sx-text-muted">{entity.id}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-sx-text-muted hover:text-sx-text text-xs px-1">✕</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-mono text-[9px] px-2 py-0.5 rounded"
            style={{ color, background: `${color}15`, border: `1px solid ${color}40` }}
          >
            {entity.severity}
          </span>
          <span className="font-mono text-[9px] text-sx-text-muted px-2 py-0.5 rounded bg-sx-surface border border-sx-border-dim">
            {entity.type.replace(/_/g, " ")}
          </span>
          {entity.anomalyFlag && (
            <span className="font-mono text-[9px] text-sx-amber px-2 py-0.5 rounded bg-sx-amber/10 border border-sx-amber/30">
              ⚠ ANOMALY
            </span>
          )}
        </div>
      </div>

      {/* Position & Kinematic data */}
      <DataSection title="POSITION & KINEMATICS">
        <DataRow label="COORDINATES" value={formatCoord(entity.position.lat, entity.position.lon)} />
        {entity.position.alt !== undefined && (
          <DataRow label="ALTITUDE" value={`${(entity.position.alt / 1000).toFixed(0)} km`} />
        )}
        {entity.altitude !== undefined && (
          <DataRow label="ALT / FL" value={`${entity.altitude.toLocaleString()} ft`} />
        )}
        {entity.heading !== undefined && (
          <DataRow label="HEADING" value={`${entity.heading.toFixed(0)}°`} />
        )}
        {entity.speed !== undefined && (
          <DataRow label="SPEED" value={`${entity.speed} kt`} />
        )}
      </DataSection>

      {/* Intelligence */}
      <DataSection title="INTELLIGENCE">
        <DataRow label="SOURCE" value={entity.source} />
        <DataRow label="CLASSIFICATION" value={entity.classification.replace("_", " ")} />
        <DataRow label="CONFIDENCE" value={`${(entity.confidence * 100).toFixed(0)}%`} />
        <DataRow label="DOMAIN" value={config?.label ?? entity.domain} />
        <DataRow label="TIMESTAMP" value={tsFormatted} mono />
      </DataSection>

      {/* Metadata */}
      {Object.keys(entity.meta).length > 0 && (
        <DataSection title="METADATA">
          {Object.entries(entity.meta)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([key, value]) => (
              <DataRow
                key={key}
                label={key.replace(/_/g, " ").toUpperCase()}
                value={String(value)}
              />
            ))}
        </DataSection>
      )}
    </div>
  );
}

function DataSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-sx-border-dim bg-sx-surface overflow-hidden">
      <div className="px-3 py-1.5 border-b border-sx-border-dim bg-sx-panel">
        <span className="font-mono text-[9px] text-sx-text-muted tracking-widest">{title}</span>
      </div>
      <div className="divide-y divide-sx-border-dim">{children}</div>
    </div>
  );
}

function DataRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="px-3 py-1.5 flex items-start justify-between gap-3">
      <span className="font-mono text-[9px] text-sx-text-muted tracking-wider flex-shrink-0">{label}</span>
      <span className={`${mono ? "font-mono" : "font-sans"} text-[10px] text-sx-text text-right break-all`}>
        {value}
      </span>
    </div>
  );
}

// ─── Intel Tab ────────────────────────────────────────────────────────────────

function IntelTab({ threatAssessment }: { threatAssessment: ThreatAssessment }) {
  return (
    <div className="p-3 space-y-3">
      <div className="font-mono text-[9px] text-sx-text-muted tracking-widest px-1">
        MULTI-DOMAIN THREAT ASSESSMENT
      </div>

      {/* Threat index visualization */}
      <div className="rounded border border-sx-border-dim bg-sx-surface p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[9px] text-sx-text-muted">COMPOSITE THREAT INDEX</span>
          <span
            className="font-mono text-xl font-bold"
            style={{ color: severityToColor(threatAssessment.globalThreatLevel) }}
          >
            {threatAssessment.threatIndex}
          </span>
        </div>
        <div className="h-2 rounded-full bg-sx-border-dim overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${threatAssessment.threatIndex}%`,
              background: `linear-gradient(90deg, #10b981, #f59e0b, ${severityToColor(threatAssessment.globalThreatLevel)})`,
              boxShadow: `0 0 8px ${severityToColor(threatAssessment.globalThreatLevel)}`,
            }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="font-mono text-[8px] text-sx-text-muted">MINIMAL</span>
          <span className="font-mono text-[8px] text-sx-text-muted">CRITICAL</span>
        </div>
      </div>

      {/* Domain threat matrix */}
      <div className="rounded border border-sx-border-dim bg-sx-surface overflow-hidden">
        <div className="px-3 py-1.5 border-b border-sx-border-dim bg-sx-panel">
          <span className="font-mono text-[9px] text-sx-text-muted">DOMAIN THREAT MATRIX</span>
        </div>
        <div className="divide-y divide-sx-border-dim">
          {Object.entries(threatAssessment.domainThreatLevels ?? {}).map(([domain, level]) => {
            const config = DOMAIN_CONFIGS[domain as keyof typeof DOMAIN_CONFIGS];
            const color = severityToColor(level as any);
            return (
              <div key={domain} className="px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs">{config?.icon}</span>
                  <span className="font-mono text-[10px] text-sx-text-dim">{config?.shortLabel ?? domain}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1 rounded-full bg-sx-border-dim overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${({ CRITICAL: 100, HIGH: 75, MEDIUM: 50, LOW: 25, INFO: 5 } as Record<string, number>)[level as string] ?? 0}%`,
                        background: color,
                      }}
                    />
                  </div>
                  <span className="font-mono text-[9px] w-16 text-right" style={{ color }}>
                    {level as string}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active crisis zones */}
      {threatAssessment.activeCrisisZones.length > 0 && (
        <div className="rounded border border-sx-red/30 bg-sx-red/5 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-sx-red/20">
            <span className="font-mono text-[9px] text-sx-red tracking-widest">
              ⚡ ACTIVE CRISIS ZONES ({threatAssessment.activeCrisisZones.length})
            </span>
          </div>
          {threatAssessment.activeCrisisZones.map((zone) => (
            <div key={zone} className="px-3 py-1.5 font-mono text-[10px] text-sx-red/80 border-b border-sx-red/10 last:border-0">
              ▸ {zone}
            </div>
          ))}
        </div>
      )}

      {/* Classification */}
      <div className="rounded border border-sx-border-dim bg-sx-surface p-2.5">
        <div className="font-mono text-[8px] text-sx-text-muted leading-relaxed">
          <div className="text-sx-red font-bold tracking-widest mb-1">⚠ CLASSIFICATION NOTICE</div>
          This intelligence assessment is classified TOP SECRET // SENTINEL // NOFORN. Distribution
          restricted to personnel holding valid SCI clearances and signed NDA on file with SENTCOM.
          Unauthorized disclosure is a violation of 18 U.S.C. § 793.
        </div>
      </div>
    </div>
  );
}
