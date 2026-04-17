// src/pages/AssetTrackingPage.tsx
import { useState, useMemo } from "react";
import { useEntityStream } from "@/hooks/useEntityStream";
import { DOMAIN_CONFIGS, DOMAIN_ORDER } from "@/constants/domains";
import { severityToColor } from "@/lib/threatAssessor";
import type { SentinelEntity, DomainKey, SeverityLevel } from "@/types/entities";

const SEVERITY_ORDER_MAP: Record<SeverityLevel, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };

export function AssetTrackingPage() {
  const { entities } = useEntityStream();
  const [search, setSearch] = useState("");
  const [filterDomain, setFilterDomain] = useState<DomainKey | "ALL">("ALL");
  const [filterSev, setFilterSev] = useState<SeverityLevel | "ALL">("ALL");
  const [filterAnom, setFilterAnom] = useState(false);
  const [sortBy, setSortBy] = useState<"severity" | "domain" | "ts" | "label">("severity");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return entities
      .filter((e) => {
        if (filterDomain !== "ALL" && e.domain !== filterDomain) return false;
        if (filterSev !== "ALL" && e.severity !== filterSev) return false;
        if (filterAnom && !e.anomalyFlag) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          return e.label.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || e.type.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "severity") return (SEVERITY_ORDER_MAP[b.severity] ?? 0) - (SEVERITY_ORDER_MAP[a.severity] ?? 0);
        if (sortBy === "domain") return a.domain.localeCompare(b.domain);
        if (sortBy === "ts") return new Date(b.ts).getTime() - new Date(a.ts).getTime();
        return a.label.localeCompare(b.label);
      });
  }, [entities, filterDomain, filterSev, filterAnom, search, sortBy]);

  const selected = selectedId ? entities.find((e) => e.id === selectedId) : null;

  const formatCoord = (lat: number, lon: number) =>
    `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? "E" : "W"}`;

  return (
    <div className="flex h-full bg-sx-bg overflow-hidden">
      {/* Left: table */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-sx-border">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-sx-border px-4 py-3" style={{ background: "#0d1424" }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-display font-bold text-sx-cyan tracking-widest">ASSET TRACKING</div>
              <div className="font-mono text-[9px] text-sx-text-muted">
                {filtered.length} / {entities.length} ENTITIES · {Object.keys(DOMAIN_CONFIGS).length} DOMAINS
              </div>
            </div>
          </div>
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="SEARCH CALLSIGN / ID / TYPE..."
              className="flex-1 min-w-[180px] px-3 py-1.5 rounded font-mono text-[10px] outline-none"
              style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
            />
            <select
              value={filterDomain}
              onChange={(e) => setFilterDomain(e.target.value as DomainKey | "ALL")}
              className="px-2 py-1.5 rounded font-mono text-[10px] outline-none"
              style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#94a3b8" }}
            >
              <option value="ALL">ALL DOMAINS</option>
              {DOMAIN_ORDER.map((d) => (
                <option key={d} value={d}>{DOMAIN_CONFIGS[d].label.toUpperCase()}</option>
              ))}
            </select>
            <select
              value={filterSev}
              onChange={(e) => setFilterSev(e.target.value as SeverityLevel | "ALL")}
              className="px-2 py-1.5 rounded font-mono text-[10px] outline-none"
              style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#94a3b8" }}
            >
              <option value="ALL">ALL SEVERITY</option>
              {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={() => setFilterAnom((v) => !v)}
              className="px-2 py-1.5 rounded font-mono text-[10px] transition-all"
              style={{
                background: filterAnom ? "rgba(236,72,153,0.12)" : "#080e1a",
                border: filterAnom ? "1px solid rgba(236,72,153,0.35)" : "1px solid #1e3a5f",
                color: filterAnom ? "#ec4899" : "#475569",
              }}
            >
              ⚠ ANOMALY
            </button>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-2 py-1.5 rounded font-mono text-[10px] outline-none"
              style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#94a3b8" }}
            >
              <option value="severity">SORT: SEVERITY</option>
              <option value="domain">SORT: DOMAIN</option>
              <option value="ts">SORT: TIMESTAMP</option>
              <option value="label">SORT: LABEL</option>
            </select>
          </div>
        </div>

        {/* Table header */}
        <div
          className="flex-shrink-0 grid font-mono text-[9px] text-sx-text-muted tracking-wider border-b border-sx-border px-4 py-1.5"
          style={{ background: "#0a0f1e", gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1.5fr 1fr" }}
        >
          {["ENTITY", "TYPE", "DOMAIN", "SEVERITY", "POSITION", "TIMESTAMP"].map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>

        {/* Table rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-sx-border-dim">
          {filtered.map((entity) => {
            const cfg = DOMAIN_CONFIGS[entity.domain];
            const color = severityToColor(entity.severity);
            const ts = new Date(entity.ts).toUTCString().split(" ")[4] + "Z";
            const isSelected = entity.id === selectedId;
            return (
              <button
                key={entity.id}
                onClick={() => setSelectedId(isSelected ? null : entity.id)}
                className="w-full grid px-4 py-2 text-left hover:bg-sx-surface/60 transition-all"
                style={{
                  gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1.5fr 1fr",
                  background: isSelected ? "rgba(0,212,255,0.05)" : "transparent",
                  borderLeft: isSelected ? "2px solid #00d4ff" : "2px solid transparent",
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {entity.anomalyFlag && <span className="font-mono text-[8px] text-sx-amber flex-shrink-0">⚠</span>}
                  <span className="font-mono text-[10px] text-sx-text font-bold truncate">{entity.label}</span>
                </div>
                <span className="font-mono text-[9px] text-sx-text-muted truncate self-center">
                  {entity.type.replace(/_/g, " ")}
                </span>
                <div className="flex items-center gap-1 self-center">
                  <span className="text-xs">{cfg?.icon}</span>
                  <span className="font-mono text-[9px]" style={{ color: cfg?.color }}>{cfg?.shortLabel}</span>
                </div>
                <span
                  className="font-mono text-[9px] font-bold self-center"
                  style={{ color }}
                >
                  {entity.severity}
                </span>
                <span className="font-mono text-[9px] text-sx-cyan/70 self-center truncate">
                  {formatCoord(entity.position.lat, entity.position.lon)}
                </span>
                <span className="font-mono text-[9px] text-sx-text-muted self-center">{ts}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="p-12 text-center font-mono text-[10px] text-sx-text-muted">
              NO ENTITIES MATCH CURRENT FILTERS
            </div>
          )}
        </div>
      </div>

      {/* Right: Entity detail */}
      <div className="w-80 flex-shrink-0 overflow-y-auto" style={{ background: "#0d1424" }}>
        {selected ? (
          <EntityDetail entity={selected} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="text-4xl opacity-20 mb-4">⊕</div>
            <div className="font-mono text-[10px] text-sx-text-muted">SELECT ENTITY TO INSPECT</div>
            <div className="font-mono text-[9px] text-sx-text-muted/60 mt-1">Click any row for full intelligence record</div>
          </div>
        )}
      </div>
    </div>
  );
}

function EntityDetail({ entity }: { entity: SentinelEntity }) {
  const cfg = DOMAIN_CONFIGS[entity.domain];
  const color = severityToColor(entity.severity);

  return (
    <div className="p-4 space-y-3 animate-fade-in">
      <div className="rounded border p-3" style={{ borderColor: `${color}30`, background: `${color}06` }}>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">{cfg?.icon}</span>
          <div>
            <div className="font-display font-bold text-sx-text">{entity.label}</div>
            <div className="font-mono text-[9px] text-sx-text-muted">{entity.id}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="font-mono text-[9px] px-2 py-0.5 rounded" style={{ color, background: `${color}12`, border: `1px solid ${color}30` }}>{entity.severity}</span>
          <span className="font-mono text-[9px] px-2 py-0.5 rounded bg-sx-surface border border-sx-border-dim text-sx-text-muted">{entity.classification.replace("_", " ")}</span>
          {entity.anomalyFlag && (
            <span className="font-mono text-[9px] px-2 py-0.5 rounded text-sx-amber bg-sx-amber/10 border border-sx-amber/30">⚠ ANOMALY</span>
          )}
        </div>
      </div>

      {[
        {
          title: "KINEMATICS",
          rows: [
            ["LAT/LON", `${Math.abs(entity.position.lat).toFixed(4)}°${entity.position.lat >= 0 ? "N" : "S"} ${Math.abs(entity.position.lon).toFixed(4)}°${entity.position.lon >= 0 ? "E" : "W"}`],
            entity.heading !== undefined ? ["HEADING", `${entity.heading.toFixed(0)}°`] : null,
            entity.speed !== undefined ? ["SPEED", `${entity.speed} kt`] : null,
            entity.altitude !== undefined ? ["ALTITUDE", `${entity.altitude.toLocaleString()} ft`] : null,
          ].filter(Boolean) as [string, string][],
        },
        {
          title: "INTELLIGENCE",
          rows: [
            ["SOURCE", entity.source],
            ["CONFIDENCE", `${(entity.confidence * 100).toFixed(0)}%`],
            ["DOMAIN", cfg?.label ?? entity.domain],
            ["LAST UPDATE", new Date(entity.ts).toUTCString()],
          ],
        },
      ].map((section) => (
        <div key={section.title} className="rounded border border-sx-border-dim bg-sx-surface overflow-hidden">
          <div className="px-3 py-1.5 border-b border-sx-border-dim bg-sx-panel">
            <span className="font-mono text-[9px] text-sx-text-muted tracking-widest">{section.title}</span>
          </div>
          <div className="divide-y divide-sx-border-dim">
            {section.rows.map(([k, v]) => (
              <div key={k} className="px-3 py-1.5 flex items-start justify-between gap-3">
                <span className="font-mono text-[9px] text-sx-text-muted">{k}</span>
                <span className="font-mono text-[9px] text-sx-text text-right break-all">{v}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {Object.keys(entity.meta).length > 0 && (
        <div className="rounded border border-sx-border-dim bg-sx-surface overflow-hidden">
          <div className="px-3 py-1.5 border-b border-sx-border-dim bg-sx-panel">
            <span className="font-mono text-[9px] text-sx-text-muted tracking-widest">METADATA</span>
          </div>
          <div className="divide-y divide-sx-border-dim">
            {Object.entries(entity.meta).filter(([, v]) => v != null).map(([k, v]) => (
              <div key={k} className="px-3 py-1.5 flex items-start justify-between gap-3">
                <span className="font-mono text-[8px] text-sx-text-muted truncate">{k.replace(/_/g, " ").toUpperCase()}</span>
                <span className="font-mono text-[9px] text-sx-text text-right break-all">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
