// src/components/features/AISVesselSidebar.tsx
// AIS Vessel Intelligence Record — full detail panel for a clicked AIS vessel
import { useState, useCallback } from "react";
import type { SentinelEntity } from "@/types/entities";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface AISVesselSidebarProps {
  entity: SentinelEntity;
  onClose: () => void;
}

// ─── Ship type category ────────────────────────────────────────────────────────

function vesselCategory(type: string | undefined): { label: string; color: string } {
  const t = (type ?? "").toLowerCase();
  if (t.includes("military") || t.includes("warship")) return { label: "MILITARY", color: "#ef4444" };
  if (t.includes("tanker"))    return { label: "TANKER",   color: "#f59e0b" };
  if (t.includes("cargo"))     return { label: "CARGO",    color: "#22d3ee" };
  if (t.includes("passenger")) return { label: "PASSENGER",color: "#a855f7" };
  if (t.includes("fishing"))   return { label: "FISHING",  color: "#10b981" };
  if (t.includes("tug"))       return { label: "TUG",      color: "#64748b" };
  if (t.includes("pilot") || t.includes("law") || t.includes("sar")) return { label: "SPECIAL", color: "#ec4899" };
  return { label: "VESSEL", color: "#94a3b8" };
}

// ─── Directional compass dial ─────────────────────────────────────────────────

function CompassDial({ heading, speed }: { heading: number; speed: number }) {
  const r = 36;
  const cx = r + 4;
  const cy = r + 4;
  const SIZE = (r + 4) * 2;

  const needleRad = ((heading - 90) * Math.PI) / 180;
  const nx = cx + r * 0.62 * Math.cos(needleRad);
  const ny = cy + r * 0.62 * Math.sin(needleRad);

  const cardinals = [
    { label: "N", deg: 0 },
    { label: "E", deg: 90 },
    { label: "S", deg: 180 },
    { label: "W", deg: 270 },
  ];

  const tickMarks = Array.from({ length: 36 }, (_, i) => i * 10);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={r} fill="rgba(0,0,0,0.6)" stroke="rgba(0,212,255,0.2)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={r - 8} fill="none" stroke="rgba(0,212,255,0.08)" strokeWidth="0.5" />

        {/* Tick marks */}
        {tickMarks.map((deg) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const major = deg % 90 === 0;
          const medium = deg % 30 === 0;
          const len = major ? 8 : medium ? 5 : 3;
          const x1 = cx + (r - 1) * Math.cos(rad);
          const y1 = cy + (r - 1) * Math.sin(rad);
          const x2 = cx + (r - len) * Math.cos(rad);
          const y2 = cy + (r - len) * Math.sin(rad);
          return (
            <line
              key={deg}
              x1={x1.toFixed(2)} y1={y1.toFixed(2)}
              x2={x2.toFixed(2)} y2={y2.toFixed(2)}
              stroke={major ? "rgba(0,212,255,0.5)" : "rgba(0,212,255,0.2)"}
              strokeWidth={major ? "1.2" : "0.6"}
            />
          );
        })}

        {/* Cardinal labels */}
        {cardinals.map(({ label, deg }) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const lx = cx + (r - 13) * Math.cos(rad);
          const ly = cy + (r - 13) * Math.sin(rad);
          return (
            <text
              key={label}
              x={lx.toFixed(2)} y={ly.toFixed(2)}
              textAnchor="middle" dominantBaseline="central"
              fill={label === "N" ? "#ef4444" : "rgba(0,212,255,0.6)"}
              fontSize="7"
              fontFamily="'Share Tech Mono', monospace"
              fontWeight={label === "N" ? "bold" : "normal"}
            >
              {label}
            </text>
          );
        })}

        {/* Heading needle */}
        <line
          x1={cx.toFixed(2)} y1={cy.toFixed(2)}
          x2={nx.toFixed(2)} y2={ny.toFixed(2)}
          stroke="#22d3ee" strokeWidth="2" strokeLinecap="round"
        />
        {/* Tail */}
        <line
          x1={cx.toFixed(2)} y1={cy.toFixed(2)}
          x2={(cx - (r * 0.2) * Math.cos(needleRad)).toFixed(2)}
          y2={(cy - (r * 0.2) * Math.sin(needleRad)).toFixed(2)}
          stroke="rgba(34,211,238,0.4)" strokeWidth="1.2" strokeLinecap="round"
        />

        {/* Center dot */}
        <circle cx={cx} cy={cy} r="3" fill="#22d3ee" />

        {/* Speed arc */}
        {speed > 0 && (() => {
          const maxSpeed = 30;
          const pct = Math.min(speed / maxSpeed, 1);
          const arcRad = (r - 3);
          const startAngle = -90;
          const endAngle = startAngle + pct * 360;
          const startRad = (startAngle * Math.PI) / 180;
          const endRad   = (endAngle   * Math.PI) / 180;
          const x1s = (cx + arcRad * Math.cos(startRad)).toFixed(2);
          const y1s = (cy + arcRad * Math.sin(startRad)).toFixed(2);
          const x2s = (cx + arcRad * Math.cos(endRad)).toFixed(2);
          const y2s = (cy + arcRad * Math.sin(endRad)).toFixed(2);
          const largeArc = pct > 0.5 ? 1 : 0;
          return (
            <path
              d={`M ${x1s} ${y1s} A ${arcRad} ${arcRad} 0 ${largeArc} 1 ${x2s} ${y2s}`}
              fill="none"
              stroke="rgba(34,211,238,0.3)"
              strokeWidth="2.5"
            />
          );
        })()}
      </svg>

      <div className="text-center">
        <div className="font-mono text-base font-bold" style={{ color: "#22d3ee" }}>
          {heading.toFixed(0).padStart(3, "0")}°
        </div>
        <div className="font-mono text-[8px] text-sx-text-muted">{speed.toFixed(1)} kt</div>
      </div>
    </div>
  );
}

// ─── Row component ─────────────────────────────────────────────────────────────

function InfoRow({ label, value, color }: { label: string; value: string | undefined | null; color?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2 px-3 py-1.5 border-b border-sx-border-dim last:border-0">
      <span className="font-mono text-[8px] text-sx-text-muted tracking-wider flex-shrink-0 uppercase">{label}</span>
      <span className="font-mono text-[9px] text-right break-all" style={{ color: color ?? "#94a3b8" }}>
        {value}
      </span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AISVesselSidebar({ entity, onClose }: AISVesselSidebarProps) {
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [onWatchlist,      setOnWatchlist]      = useState(false);

  const meta = entity.meta ?? {};
  const mmsi       = String(meta.mmsi ?? "");
  const callsign   = String(meta.callsign ?? "");
  const destination= String(meta.destination ?? "");
  const shipType   = String(meta.shipType ?? "");
  const navStatus  = String(meta.navStatus ?? "");
  const draught    = meta.draught != null ? `${meta.draught} m` : undefined;
  const length     = meta.length  != null ? `${meta.length} m` : undefined;
  const flag       = String(meta.flag ?? "");

  const category   = vesselCategory(shipType);
  const heading    = entity.heading ?? 0;
  const speed      = entity.speed   ?? 0;

  const lat   = `${Math.abs(entity.position.lat).toFixed(4)}° ${entity.position.lat >= 0 ? "N" : "S"}`;
  const lon   = `${Math.abs(entity.position.lon).toFixed(4)}° ${entity.position.lon >= 0 ? "E" : "W"}`;

  const handleAddToWatchlist = useCallback(async () => {
    if (watchlistLoading || onWatchlist) return;
    setWatchlistLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error("Login required to add to watchlist");
        return;
      }

      // Upsert watchlist entry for this vessel MMSI
      const { error } = await supabase
        .from("watchlists")
        .insert({
          name: `AIS: ${entity.label} (MMSI ${mmsi})`,
          entity_ids: [entity.id],
          criteria: {
            mmsi,
            shipType,
            flag,
            addedAt: new Date().toISOString(),
          },
          notify_on: ["position_update", "status_change", "anomaly"],
          owner_id: session.user.id,
        });

      if (error) throw new Error(error.message);

      setOnWatchlist(true);
      toast.success(`${entity.label} added to watchlist — MMSI ${mmsi}`);
    } catch (err: unknown) {
      toast.error(`Watchlist error: ${(err as Error).message}`);
    } finally {
      setWatchlistLoading(false);
    }
  }, [entity, mmsi, shipType, flag, watchlistLoading, onWatchlist]);

  return (
    <div className="flex flex-col h-full bg-sx-panel animate-fade-in overflow-y-auto">
      {/* Header */}
      <div
        className="flex-shrink-0 px-3 py-3 border-b border-sx-border-dim"
        style={{ background: "rgba(34,211,238,0.04)" }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚢</span>
            <div>
              <div className="font-display font-bold text-sm text-sx-text leading-tight">{entity.label}</div>
              <div className="font-mono text-[9px] text-sx-text-muted">MMSI: {mmsi || "—"}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-sx-text-muted hover:text-sx-text text-xs flex-shrink-0 px-1">✕</button>
        </div>

        {/* Type badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="font-mono text-[8px] px-2 py-0.5 rounded font-bold"
            style={{ color: category.color, background: `${category.color}15`, border: `1px solid ${category.color}35` }}
          >
            {category.label}
          </span>
          {navStatus && (
            <span
              className="font-mono text-[8px] px-2 py-0.5 rounded"
              style={{
                color: navStatus.includes("UNDERWAY") ? "#22d3ee" : navStatus.includes("ANCHOR") ? "#f59e0b" : "#94a3b8",
                background: "rgba(0,0,0,0.4)", border: "1px solid rgba(30,58,95,0.7)",
              }}
            >
              {navStatus}
            </span>
          )}
          {entity.anomalyFlag && (
            <span className="font-mono text-[8px] px-2 py-0.5 rounded font-bold" style={{ color: "#f59e0b", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
              ⚠ ANOMALY
            </span>
          )}
          <span className="font-mono text-[8px] ml-auto" style={{ color: "#22d3ee40" }}>
            ● AIS LIVE
          </span>
        </div>
      </div>

      {/* Compass + speed widget */}
      <div className="flex-shrink-0 py-3 flex items-center justify-center gap-6 border-b border-sx-border-dim" style={{ background: "rgba(0,0,0,0.3)" }}>
        <CompassDial heading={heading} speed={speed} />
        <div className="space-y-2">
          <div className="text-center">
            <div className="font-mono text-[8px] text-sx-text-muted mb-0.5">POSITION</div>
            <div className="font-mono text-[9px]" style={{ color: "#22d3ee" }}>{lat}</div>
            <div className="font-mono text-[9px]" style={{ color: "#22d3ee" }}>{lon}</div>
          </div>
          <div className="text-center">
            <div className="font-mono text-[8px] text-sx-text-muted mb-0.5">LAST UPDATE</div>
            <div className="font-mono text-[8px]" style={{ color: "#475569" }}>
              {new Date(entity.ts).toUTCString().split(" ").slice(0, 5).join(" ")}
            </div>
          </div>
        </div>
      </div>

      {/* Info rows */}
      <div className="flex-1 divide-y divide-sx-border-dim overflow-y-auto">
        <div className="rounded-none bg-sx-surface/60">
          <div className="px-3 py-1.5 bg-sx-surface border-b border-sx-border-dim">
            <span className="font-mono text-[8px] text-sx-text-muted tracking-widest">VESSEL IDENTIFICATION</span>
          </div>
          <InfoRow label="MMSI"        value={mmsi}      color="#22d3ee" />
          <InfoRow label="NAME"        value={entity.label} color="#e2e8f0" />
          <InfoRow label="CALLSIGN"    value={callsign}  color="#94a3b8" />
          <InfoRow label="FLAG"        value={flag}      color="#94a3b8" />
          <InfoRow label="SHIP TYPE"   value={shipType}  color={category.color} />
          <InfoRow label="DESTINATION" value={destination || "UNKNOWN"} color="#a855f7" />
        </div>

        <div className="bg-sx-surface/40">
          <div className="px-3 py-1.5 bg-sx-surface border-b border-sx-border-dim">
            <span className="font-mono text-[8px] text-sx-text-muted tracking-widest">KINEMATIC STATE</span>
          </div>
          <InfoRow label="SPEED"        value={`${speed.toFixed(1)} kt`}        color="#10b981" />
          <InfoRow label="COURSE"       value={`${heading.toFixed(0)}°`}         color="#94a3b8" />
          <InfoRow label="NAV STATUS"   value={navStatus}                         color={navStatus.includes("UNDERWAY") ? "#22d3ee" : "#f59e0b"} />
          <InfoRow label="DRAUGHT"      value={draught}                           color="#94a3b8" />
          <InfoRow label="LENGTH"       value={length}                            color="#94a3b8" />
        </div>

        <div className="bg-sx-surface/20">
          <div className="px-3 py-1.5 bg-sx-surface border-b border-sx-border-dim">
            <span className="font-mono text-[8px] text-sx-text-muted tracking-widest">CLASSIFICATION</span>
          </div>
          <InfoRow label="CONFIDENCE"      value={`${(entity.confidence * 100).toFixed(0)}%`}   color="#10b981" />
          <InfoRow label="CLASSIFICATION"  value={entity.classification.replace("_", " ")}       color="#94a3b8" />
          <InfoRow label="SOURCE"          value={entity.source}                                   color="#475569" />
          <InfoRow label="SEVERITY"        value={entity.severity}
            color={entity.severity === "CRITICAL" ? "#ef4444" : entity.severity === "HIGH" ? "#f59e0b" : "#22d3ee"}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 p-3 border-t border-sx-border-dim space-y-2" style={{ background: "rgba(0,0,0,0.3)" }}>
        <button
          onClick={handleAddToWatchlist}
          disabled={watchlistLoading || onWatchlist}
          className="w-full py-2 rounded font-mono text-[9px] font-bold tracking-wider transition-all flex items-center justify-center gap-2"
          style={{
            background: onWatchlist ? "rgba(16,185,129,0.1)" : watchlistLoading ? "rgba(34,211,238,0.06)" : "rgba(34,211,238,0.1)",
            border: onWatchlist ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(34,211,238,0.3)",
            color: onWatchlist ? "#10b981" : watchlistLoading ? "#22d3ee60" : "#22d3ee",
          }}
        >
          {onWatchlist ? "✓ ON WATCHLIST" : watchlistLoading ? "⟳ ADDING..." : "+ ADD TO WATCHLIST"}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="py-1.5 rounded font-mono text-[8px] transition-all"
            style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)", color: "#a855f7" }}
            onClick={() => toast.info(`Tracking entity ${mmsi}`)}
          >
            ◎ TRACK
          </button>
          <button
            className="py-1.5 rounded font-mono text-[8px] transition-all"
            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(30,58,95,0.6)", color: "#475569" }}
            onClick={() => {
              const txt = `VESSEL: ${entity.label}\nMMSI: ${mmsi}\nPOS: ${lat} ${lon}\nSPEED: ${speed.toFixed(1)}kt HDG: ${heading.toFixed(0)}°\nTYPE: ${shipType}\nDEST: ${destination || "UNKNOWN"}`;
              navigator.clipboard?.writeText(txt);
              toast.success("Vessel data copied to clipboard");
            }}
          >
            ↗ COPY
          </button>
        </div>
      </div>
    </div>
  );
}
