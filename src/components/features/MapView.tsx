// src/components/features/MapView.tsx
// Tactical Leaflet map with custom SVG entity markers, heading vectors,
// trail rendering, threat zone overlays, anomaly pulse rings,
// AIS vessel layer, and Planet Labs satellite imagery overlay.

import { useEffect, useRef, useState, useCallback } from "react";
import type { Map as LeafletMap, TileLayer, LayerGroup, Marker, Polyline, Polygon } from "leaflet";
import type { SentinelEntity, DomainKey, StreamEvent } from "@/types/entities";
import { DOMAIN_CONFIGS, HOTSPOT_ZONES } from "@/constants/domains";
import { severityToColor } from "@/lib/threatAssessor";
import { supabase } from "@/lib/supabase";
import {
  type GeofenceRecord,
  isInsideFence,
  fenceClassificationColor,
} from "@/hooks/useGeofences";

export type MapOverlayMode = "normal" | "flir" | "nightvision";

interface MapViewProps {
  entities: SentinelEntity[];
  enabledDomains: Set<DomainKey>;
  onEntitySelect: (entity: SentinelEntity) => void;
  selectedEntityId: string | null;
  showHotspots: boolean;
  showTrails: boolean;
  overlayMode?: MapOverlayMode;
  // AIS layer props
  aisEntities?: SentinelEntity[];
  aisConnected?: boolean;
  aisMessageCount?: number;
  // Geofence overlay props
  geofences?: GeofenceRecord[];
  onGeofenceBreach?: (event: StreamEvent) => void;
}

type MapMode = "dark" | "satellite" | "planet";

const MAP_TILES = {
  dark:      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  // Planet tile URL is dynamically set after fetching token
  planet:    "",
};

// SVG path shapes per domain
const DOMAIN_SHAPES: Record<string, string> = {
  aviation: "M 0,-11 L 10,4 L 0,1 L -10,4 Z",
  maritime: "M 0,-10 L 7,8 L 0,5 L -7,8 Z",
  orbital:  "M -7,-4 L 0,-10 L 7,-4 L 10,0 L 7,4 L 0,10 L -7,4 L -10,0 Z",
  seismic:  "M 0,-10 L 3,-3 L 10,0 L 3,3 L 0,10 L -3,3 L -10,0 L -3,-3 Z",
  conflict: "M -2,-10 L 2,-10 L 2,-2 L 10,-2 L 10,2 L 2,2 L 2,10 L -2,10 L -2,2 L -10,2 L -10,-2 L -2,-2 Z",
  weather:  "M 0,-9 C 5,-9 9,-5 7,0 C 9,0 9,7 4,7 L -7,7 C -11,4 -9,-2 -4,-3 C -5,-9 0,-9 0,-9 Z",
  cyber:    "M -9,-9 L 9,-9 L 9,9 L -9,9 Z M -5,-5 L 5,-5 L 5,5 L -5,5 Z",
  nuclear:  "M 0,-10 L 3,-3 L 10,-5 L 5,2 L 10,8 L 0,5 L -10,8 L -5,2 L -10,-5 L -3,-3 Z",
  sigint:   "M -3,-10 L 3,-10 L 3,0 L 7,0 L 0,10 L -7,0 L -3,0 Z",
};

// ─── Icon builder ──────────────────────────────────────────────────────────────

function buildEntityIcon(
  L: typeof import("leaflet"),
  entity: SentinelEntity,
  isSelected: boolean
): ReturnType<typeof L.divIcon> {
  const color    = severityToColor(entity.severity);
  const heading  = entity.heading ?? 0;
  const SIZE     = 52;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R  = entity.anomalyFlag ? 11 : isSelected ? 10 : 8;

  const shape  = DOMAIN_SHAPES[entity.domain] ?? "M 0,-8 L 8,8 L -8,8 Z";
  const scale  = (R / 12).toFixed(3);
  const filterId = `gf${entity.id.slice(-5)}`;

  const showVector = entity.heading !== undefined &&
    (entity.domain === "aviation" || entity.domain === "maritime");
  let vectorSvg = "";
  if (showVector) {
    const rad = ((heading - 90) * Math.PI) / 180;
    const vx2 = cx + Math.cos(rad) * 20;
    const vy2 = cy + Math.sin(rad) * 20;
    vectorSvg = `<line x1="${cx}" y1="${cy}" x2="${vx2.toFixed(1)}" y2="${vy2.toFixed(1)}"
      stroke="${color}" stroke-width="1.5" stroke-linecap="round" opacity="0.75"/>`;
  }

  const pulseRings = entity.anomalyFlag ? `
    <circle cx="${cx}" cy="${cy}" r="${R + 4}" fill="none" stroke="${color}" stroke-width="1" opacity="0">
      <animate attributeName="r"       from="${R + 2}" to="${R + 18}" dur="2.2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.5"      to="0"         dur="2.2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="${cx}" cy="${cy}" r="${R + 2}" fill="none" stroke="${color}" stroke-width="0.6" opacity="0">
      <animate attributeName="r"       from="${R}"     to="${R + 12}" dur="2.2s" begin="0.8s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.3"      to="0"         dur="2.2s" begin="0.8s" repeatCount="indefinite"/>
    </circle>` : "";

  const selRing = isSelected ? `
    <circle cx="${cx}" cy="${cy}" r="${R + 7}" fill="none" stroke="#00d4ff"
      stroke-width="1.5" stroke-dasharray="4 3" opacity="0.9">
      <animateTransform attributeName="transform" type="rotate"
        from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="5s" repeatCount="indefinite"/>
    </circle>` : "";

  const svg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"
    xmlns="http://www.w3.org/2000/svg" style="overflow:visible;display:block">
    <defs>
      <filter id="${filterId}" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    ${pulseRings}
    ${selRing}
    ${vectorSvg}
    <g transform="translate(${cx},${cy})" filter="url(#${filterId})">
      <circle r="${R + 1}" fill="${color}" opacity="0.12"/>
      <circle r="${R}"     fill="${color}20" stroke="${color}" stroke-width="${isSelected ? 2 : 1.5}"/>
      <path   d="${shape}" fill="${color}" transform="scale(${scale})"/>
    </g>
  </svg>`;

  return L.divIcon({
    className:   "entity-marker",
    html:        svg,
    iconSize:    [SIZE, SIZE],
    iconAnchor:  [cx, cy],
    popupAnchor: [0, -(R + 10)],
  });
}

// ─── AIS Vessel icon (distinct triangle shape, cyan/blue themed) ───────────────

function buildAISIcon(
  L: typeof import("leaflet"),
  entity: SentinelEntity,
  isSelected: boolean
): ReturnType<typeof L.divIcon> {
  const isMilitary = entity.type === "VESSEL_WARSHIP";
  const isTanker   = entity.type === "VESSEL_TANKER";
  const color = isMilitary ? "#ef4444" : isTanker ? "#f59e0b" : "#22d3ee";
  const SIZE  = 36;
  const cx    = SIZE / 2;
  const cy    = SIZE / 2;
  const heading = entity.heading ?? 0;

  const svg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"
    xmlns="http://www.w3.org/2000/svg" style="overflow:visible;display:block">
    <g transform="translate(${cx},${cy}) rotate(${heading})">
      <polygon points="0,-10 6,7 0,4 -6,7"
        fill="${color}30" stroke="${color}" stroke-width="${isSelected ? 2 : 1.2}"/>
      ${isSelected ? `<circle r="14" fill="none" stroke="${color}" stroke-width="1"
        stroke-dasharray="3 3" opacity="0.6">
        <animateTransform attributeName="transform" type="rotate"
          from="0" to="360" dur="8s" repeatCount="indefinite"/>
      </circle>` : ""}
    </g>
  </svg>`;

  return L.divIcon({
    className:   "ais-marker",
    html:        svg,
    iconSize:    [SIZE, SIZE],
    iconAnchor:  [cx, cy],
    popupAnchor: [0, -14],
  });
}

// ─── Popup HTML builder ────────────────────────────────────────────────────────

function buildPopupHtml(entity: SentinelEntity): string {
  const cfg   = DOMAIN_CONFIGS[entity.domain];
  const color = severityToColor(entity.severity);
  const lat   = `${Math.abs(entity.position.lat).toFixed(4)}°${entity.position.lat >= 0 ? "N" : "S"}`;
  const lon   = `${Math.abs(entity.position.lon).toFixed(4)}°${entity.position.lon >= 0 ? "E" : "W"}`;

  const rows: [string, string, string?][] = [
    ["ID",         entity.id.slice(0, 20),             "#94a3b8"],
    ["TYPE",       entity.type.replace(/_/g, " "),     "#94a3b8"],
    ["SEVERITY",   entity.severity,                    color],
    ["SOURCE",     entity.source.slice(0, 24),         "#94a3b8"],
    ["POS",        `${lat} ${lon}`,                    "#00d4ff"],
    ["CONFIDENCE", `${(entity.confidence * 100).toFixed(0)}%`, "#94a3b8"],
  ];
  if (entity.heading !== undefined)
    rows.push(["HDG / SPD", `${entity.heading.toFixed(0)}° / ${entity.speed ?? "—"} kt`, "#94a3b8"]);
  if (entity.altitude !== undefined)
    rows.push(["ALT", `${entity.altitude.toLocaleString()} ft`, "#94a3b8"]);

  // AIS-specific fields
  if (entity.meta?.mmsi) rows.push(["MMSI", String(entity.meta.mmsi), "#22d3ee"]);
  if (entity.meta?.destination) rows.push(["DEST", String(entity.meta.destination).slice(0, 20), "#94a3b8"]);
  if (entity.meta?.navStatus) rows.push(["STATUS", String(entity.meta.navStatus), "#94a3b8"]);

  const rowsHtml = rows.map(([k, v, c]) =>
    `<span style="color:#475569;font-size:9px">${k}</span>
     <span style="color:${c ?? "#94a3b8"};font-size:9px;${k === "SEVERITY" ? "font-weight:bold" : ""}">${v}</span>`
  ).join("");

  const anomalyBanner = entity.anomalyFlag
    ? `<div style="color:#f59e0b;font-size:9px;margin-top:5px;border-top:1px solid rgba(245,158,11,0.2);padding-top:4px">
        ⚠ ANOMALY FLAG — ELEVATED MONITORING PRIORITY
       </div>` : "";

  const isLive = entity.meta?.isLive;
  const liveBadge = isLive
    ? `<div style="color:#22d3ee;font-size:8px;margin-top:4px">● AIS LIVE STREAM</div>` : "";

  return `
    <div style="font-family:'Share Tech Mono',monospace;min-width:210px">
      <div style="color:${color};font-size:11px;font-weight:bold;margin-bottom:5px;
        padding-bottom:4px;border-bottom:1px solid rgba(30,58,95,0.9);
        text-shadow:0 0 6px ${color}66">
        ${cfg?.icon ?? "○"} ${entity.label}
      </div>
      <div style="display:grid;grid-template-columns:80px 1fr;gap:3px 8px">
        ${rowsHtml}
      </div>
      ${anomalyBanner}
      ${liveBadge}
      <div style="margin-top:6px;font-size:8px;color:#1e3a5f;letter-spacing:0.08em">
        CLICK ENTITY TO OPEN FULL INTELLIGENCE RECORD
      </div>
    </div>`;
}

// ─── Compass Bearing Rose widget ────────────────────────────────────────────────

const CARDINALS = [
  { angle: 0,   label: "N",  primary: true  },
  { angle: 45,  label: "NE", primary: false },
  { angle: 90,  label: "E",  primary: true  },
  { angle: 135, label: "SE", primary: false },
  { angle: 180, label: "S",  primary: true  },
  { angle: 225, label: "SW", primary: false },
  { angle: 270, label: "W",  primary: true  },
  { angle: 315, label: "NW", primary: false },
] as const;

const TICK_ANGLES = Array.from({ length: 36 }, (_, i) => i * 10);

function CompassRose({
  entityCount,
  aisCount,
  measureBearing,
  measureMode,
}: {
  entityCount: number;
  aisCount: number;
  measureBearing: number | null;
  measureMode: boolean;
}) {
  const [sweepAngle, setSweepAngle] = useState(0);

  useEffect(() => {
    let raf: number;
    let last = 0;
    const tick = (ts: number) => {
      if (ts - last > 16) { setSweepAngle((a) => (a + 1.1) % 360); last = ts; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const SIZE = 120;
  const cx   = SIZE / 2;
  const cy   = SIZE / 2;
  const R    = 42;      // inner ring radius
  const LR   = R + 9;  // label radius

  // Rose rotates so measured bearing aligns to 12-o'clock position
  const roseRotation = measureMode && measureBearing !== null ? -measureBearing : 0;

  const toRad = (deg: number) => (deg - 90) * Math.PI / 180;

  return (
    <div
      className="absolute z-[402] pointer-events-none select-none"
      style={{ bottom: 32, right: 56 }}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="compassSweep" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.28"/>
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0"/>
          </radialGradient>
          <filter id="compassGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* ── Background disc ── */}
        <circle cx={cx} cy={cy} r={LR + 4}
          fill="rgba(8,14,26,0.82)" stroke="rgba(0,212,255,0.14)" strokeWidth="0.8"/>

        {/* ── Rotating rose group ── */}
        <g
          transform={`rotate(${roseRotation}, ${cx}, ${cy})`}
          style={{ transition: "transform 1s cubic-bezier(0.4,0,0.2,1)" }}
        >
          {/* Concentric guide rings */}
          {[R, R * 0.55].map((r, i) => (
            <circle key={i} cx={cx} cy={cy} r={r}
              fill="none" stroke="rgba(0,212,255,0.12)" strokeWidth="0.6"/>
          ))}

          {/* Tick marks */}
          {TICK_ANGLES.map((a) => {
            const isCard  = a % 45 === 0;
            const isPrim  = a % 90 === 0;
            const innerR  = isPrim ? R - 9 : isCard ? R - 6 : R - 3.5;
            const rad     = toRad(a);
            return (
              <line key={a}
                x1={(cx + Math.cos(rad) * innerR).toFixed(2)}
                y1={(cy + Math.sin(rad) * innerR).toFixed(2)}
                x2={(cx + Math.cos(rad) * R).toFixed(2)}
                y2={(cy + Math.sin(rad) * R).toFixed(2)}
                stroke={isPrim ? "rgba(0,212,255,0.55)" : isCard ? "rgba(0,212,255,0.3)" : "rgba(0,212,255,0.14)"}
                strokeWidth={isPrim ? 1.2 : isCard ? 0.8 : 0.5}
              />
            );
          })}

          {/* Cardinal / intercardinal labels */}
          {CARDINALS.map(({ angle, label, primary }) => {
            const rad  = toRad(angle);
            const isN  = label === "N";
            const x    = cx + Math.cos(rad) * LR;
            const y    = cy + Math.sin(rad) * LR;
            return (
              <text key={label}
                x={x.toFixed(2)} y={y.toFixed(2)}
                textAnchor="middle" dominantBaseline="middle"
                fill={isN ? "#ef4444" : primary ? "rgba(0,212,255,0.85)" : "rgba(0,212,255,0.42)"}
                fontSize={isN ? 8.5 : primary ? 7 : 5.5}
                fontFamily="'Share Tech Mono',monospace"
                fontWeight={isN || primary ? "bold" : "normal"}
                filter={isN ? "url(#compassGlow)" : undefined}
              >
                {label}
              </text>
            );
          })}

          {/* North arrow — filled teardrop pointing up */}
          <path
            d={`M ${cx} ${cy - R + 2} L ${cx - 3.5} ${cy - R + 12} L ${cx} ${cy - R + 9} L ${cx + 3.5} ${cy - R + 12} Z`}
            fill="#ef4444" opacity="0.92"
            filter="url(#compassGlow)"
          />
          <path
            d={`M ${cx} ${cy - R * 0.55} L ${cx - 3.5} ${cy - R + 12} L ${cx} ${cy - R + 9} L ${cx + 3.5} ${cy - R + 12} Z`}
            fill="rgba(0,0,0,0.3)"
          />

          {/* South stub of needle */}
          <path
            d={`M ${cx} ${cy + R - 2} L ${cx - 2.5} ${cy + R - 10} L ${cx} ${cy + R - 8} L ${cx + 2.5} ${cy + R - 10} Z`}
            fill="rgba(0,212,255,0.4)"
          />

          {/* Radar sweep (rotates independently — counter-rotated so it stays absolute) */}
          <g transform={`rotate(${sweepAngle - roseRotation}, ${cx}, ${cy})`}>
            <path
              d={[
                `M ${cx} ${cy}`,
                `L ${(cx + (R - 4) * Math.cos(toRad(sweepAngle))).toFixed(2)} ${(cy + (R - 4) * Math.sin(toRad(sweepAngle))).toFixed(2)}`,
                `A ${R - 4} ${R - 4} 0 0 1`,
                `${(cx + (R - 4) * Math.cos(toRad(sweepAngle - 55))).toFixed(2)} ${(cy + (R - 4) * Math.sin(toRad(sweepAngle - 55))).toFixed(2)}`,
                `Z`,
              ].join(" ")}
              fill="url(#compassSweep)" opacity="0.55"
            />
            <line
              x1={cx} y1={cy}
              x2={(cx + (R - 4) * Math.cos(toRad(sweepAngle))).toFixed(2)}
              y2={(cy + (R - 4) * Math.sin(toRad(sweepAngle))).toFixed(2)}
              stroke="#00d4ff" strokeWidth="0.9" opacity="0.8"
            />
          </g>

          {/* Measurement bearing needle — amber, only when active */}
          {measureMode && measureBearing !== null && (
            <>
              {/* Needle line */}
              <line
                x1={cx} y1={cy}
                x2={(cx + (R - 3) * Math.cos(toRad(measureBearing))).toFixed(2)}
                y2={(cy + (R - 3) * Math.sin(toRad(measureBearing))).toFixed(2)}
                stroke="#facc15" strokeWidth="1.8" opacity="0.95"
                strokeLinecap="round"
              />
              {/* Arrowhead at tip */}
              <circle
                cx={(cx + (R - 3) * Math.cos(toRad(measureBearing))).toFixed(2)}
                cy={(cy + (R - 3) * Math.sin(toRad(measureBearing))).toFixed(2)}
                r="2.8" fill="#facc15" opacity="0.95"
                filter="url(#compassGlow)"
              />
              {/* Back tail */}
              <line
                x1={cx} y1={cy}
                x2={(cx + (R * 0.3) * Math.cos(toRad(measureBearing + 180))).toFixed(2)}
                y2={(cy + (R * 0.3) * Math.sin(toRad(measureBearing + 180))).toFixed(2)}
                stroke="rgba(250,204,21,0.35)" strokeWidth="1.2"
                strokeLinecap="round"
              />
            </>
          )}
        </g>

        {/* ── Fixed center hub (doesn't rotate with rose) ── */}
        <circle cx={cx} cy={cy} r={11}
          fill="rgba(8,14,26,0.94)" stroke="rgba(0,212,255,0.28)" strokeWidth="0.9"/>
        <text x={cx} y={cy + 1}
          textAnchor="middle" dominantBaseline="middle"
          fill="#00d4ff" fontSize="9"
          fontFamily="'Share Tech Mono',monospace" fontWeight="bold"
        >
          {entityCount}
        </text>

        {/* ── Fixed AIS count ── */}
        {aisCount > 0 && (
          <text
            x={cx} y={SIZE - 6}
            textAnchor="middle"
            fill="rgba(34,211,238,0.6)" fontSize="5.5"
            fontFamily="'Share Tech Mono',monospace"
          >
            AIS:{aisCount}
          </text>
        )}

        {/* ── Measured bearing readout (fixed, top of widget) ── */}
        {measureMode && measureBearing !== null ? (
          <text x={cx} y={7}
            textAnchor="middle"
            fill="rgba(250,204,21,0.9)" fontSize="6.5"
            fontFamily="'Share Tech Mono',monospace" fontWeight="bold"
          >
            {measureBearing.toFixed(1)}°T
          </text>
        ) : (
          <text x={cx} y={7}
            textAnchor="middle"
            fill="rgba(0,212,255,0.3)" fontSize="5.5"
            fontFamily="'Share Tech Mono',monospace" letterSpacing="1"
          >
            COMPASS
          </text>
        )}
      </svg>
    </div>
  );
}

// ─── Heatmap Legend Overlay ──────────────────────────────────────────────────

const SEVERITY_TIERS = [
  { key: "CRITICAL", label: "CRITICAL", weight: 5, color: "#ef4444" },
  { key: "HIGH",     label: "HIGH",     weight: 3, color: "#f97316" },
  { key: "MEDIUM",   label: "MEDIUM",   weight: 1, color: "#f59e0b" },
  { key: "LOW",      label: "LOW",      weight: 0.4, color: "#84cc16" },
  { key: "INFO",     label: "INFO",     weight: 0.15, color: "#10b981" },
] as const;

function HeatmapLegend({
  entities,
  open,
  onToggle,
}: {
  entities: SentinelEntity[];
  open: boolean;
  onToggle: () => void;
}) {
  const counts = SEVERITY_TIERS.map((t) => ({
    ...t,
    count: entities.filter((e) => e.severity === t.key).length,
  }));
  const total = entities.length;

  return (
    <div
      className="absolute z-[402] pointer-events-auto"
      style={{
        bottom: 44,
        left: "50%",
        transform: "translateX(-50%)",
        minWidth: 240,
      }}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-1.5 rounded-t"
        style={{
          background: "rgba(13,20,36,0.94)",
          border:     "1px solid rgba(239,68,68,0.3)",
          borderBottom: open ? "none" : "1px solid rgba(239,68,68,0.3)",
          backdropFilter: "blur(8px)",
          fontFamily:  "'Share Tech Mono',monospace",
          fontSize:    9,
          color:       "#ef4444",
          letterSpacing: "0.12em",
          cursor: "pointer",
        }}
      >
        <span>🔥 THREAT DENSITY HEATMAP</span>
        <span style={{ color: "rgba(239,68,68,0.5)" }}>{open ? "▴" : "▾"}</span>
      </button>

      {/* Legend body */}
      {open && (
        <div
          className="px-3 pb-3 pt-2 rounded-b space-y-2"
          style={{
            background: "rgba(8,14,26,0.96)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderTop: "none",
            backdropFilter: "blur(8px)",
          }}
        >
          {/* Gradient bar */}
          <div>
            <div
              className="rounded-sm mb-1"
              style={{
                height: 8,
                background:
                  "linear-gradient(90deg, #10b981 0%, #84cc16 20%, #f59e0b 50%, #f97316 75%, #ef4444 100%)",
                boxShadow: "0 0 6px rgba(239,68,68,0.25)",
              }}
            />
            <div className="flex justify-between">
              <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 7, color: "#10b981" }}>LOW</span>
              <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 7, color: "#f59e0b" }}>MEDIUM</span>
              <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 7, color: "#ef4444" }}>CRITICAL</span>
            </div>
          </div>

          {/* Severity tier counts */}
          <div className="space-y-1">
            {counts.map(({ key, label, color, count, weight }) => (
              <div key={key} className="flex items-center gap-2">
                <div
                  className="flex-shrink-0 rounded-sm"
                  style={{ width: 8, height: 8, background: color, boxShadow: `0 0 4px ${color}60` }}
                />
                <div
                  className="flex-1 h-1 rounded-full overflow-hidden"
                  style={{ background: "rgba(30,58,95,0.5)" }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: total > 0 ? `${(count / total) * 100}%` : "0%",
                      background: color,
                      transition: "width 0.6s ease",
                      boxShadow: `0 0 3px ${color}50`,
                    }}
                  />
                </div>
                <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color, minWidth: 14, textAlign: "right" }}>
                  {count}
                </span>
                <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 7, color: "rgba(71,85,105,0.8)", minWidth: 50 }}>
                  {label} ×{weight}
                </span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div
            className="flex items-center justify-between pt-1"
            style={{ borderTop: "1px solid rgba(30,58,95,0.6)" }}
          >
            <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color: "rgba(71,85,105,0.9)" }}>
              TOTAL ENTITIES
            </span>
            <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#00d4ff", fontWeight: "bold" }}>
              {total}
            </span>
          </div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 7, color: "rgba(71,85,105,0.6)", textAlign: "center" }}>
            WEIGHT = HEAT INTENSITY MULTIPLIER
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

const OVERLAY_FILTERS: Record<MapOverlayMode, string> = {
  normal:      "none",
  flir:        "sepia(1) saturate(3) hue-rotate(330deg) brightness(0.8) contrast(1.4)",
  nightvision: "sepia(1) saturate(4) hue-rotate(80deg) brightness(0.75) contrast(1.5)",
};

const OVERLAY_VIGNETTE: Record<MapOverlayMode, string> = {
  normal:      "transparent",
  flir:        "rgba(80,10,0,0.45)",
  nightvision: "rgba(0,40,0,0.5)",
};

export function MapView({
  entities,
  enabledDomains,
  onEntitySelect,
  selectedEntityId,
  showHotspots,
  showTrails,
  overlayMode = "normal",
  aisEntities = [],
  aisConnected = false,
  aisMessageCount = 0,
  geofences = [],
  onGeofenceBreach,
}: MapViewProps) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<LeafletMap | null>(null);
  const tileRef         = useRef<TileLayer | null>(null);
  const planetTileRef   = useRef<TileLayer | null>(null);
  const hotspotRef      = useRef<LayerGroup | null>(null);
  const clusterRef      = useRef<LayerGroup | null>(null);
  const aisLayerRef     = useRef<LayerGroup | null>(null);
  const markersRef      = useRef<Map<string, Marker>>(new Map());
  const aisMarkersRef   = useRef<Map<string, Marker>>(new Map());
  const trailsRef       = useRef<Map<string, Polyline>>(new Map());
  const LRef            = useRef<typeof import("leaflet") | null>(null);
  const clusterModeRef  = useRef(true);
  const planetTokenRef    = useRef<string | null>(null);
  const geofenceLayerRef  = useRef<LayerGroup | null>(null);
  const geofencePolyRef   = useRef<Map<string, Polygon>>(new Map());
  const breachCooldownRef = useRef<Map<string, number>>(new Map()); // fenceId:entityId → expiry ts
  const measureLayerRef   = useRef<LayerGroup | null>(null);
  const measurePtsRef     = useRef<[number, number][]>([]); // [start?, end?]

  const [mapMode,        setMapMode]        = useState<MapMode>("dark");
  const [leafletReady,   setLeafletReady]   = useState(false);
  const [entityCount,    setEntityCount]    = useState(0);
  const [mapZoom,        setMapZoom]        = useState(3);
  const [clusterMode,    setClusterMode]    = useState(true);
  const [cursorPos,      setCursorPos]      = useState<{ lat: number; lon: number } | null>(null);
  const [showAISLayer,   setShowAISLayer]   = useState(true);
  const [planetLoading,  setPlanetLoading]  = useState(false);
  const [planetActive,   setPlanetActive]   = useState(false);
  const [planetError,    setPlanetError]    = useState<string | null>(null);
  const [aisVesselCount, setAisVesselCount] = useState(0);
  const [radarActive,    setRadarActive]    = useState(false);
  const [radarLoading,   setRadarLoading]   = useState(false);
  const [heatActive,     setHeatActive]     = useState(false);
  const [geofenceCount,  setGeofenceCount]  = useState(0);
  const [breachCount,    setBreachCount]    = useState(0);
  const [heatLegendOpen, setHeatLegendOpen] = useState(true);
  const [cableActive,    setCableActive]    = useState(false);
  const [cableLoading,   setCableLoading]   = useState(false);
  const cableLayerRef    = useRef<LayerGroup | null>(null);
  const [measureMode,   setMeasureMode]   = useState(false);
  const [measureResult, setMeasureResult] = useState<{
    distKm: number; distNm: number; bearing: number;
    start: [number, number]; end: [number, number];
  } | null>(null);
  const radarTileRef     = useRef<TileLayer | null>(null);
  const heatLayerRef     = useRef<any>(null);
  const aisProjectionsRef = useRef<Map<string, Polyline>>(new Map());

  const overlayLabel: Record<MapOverlayMode, string> = {
    normal: "",
    flir: "FLIR // THERMAL",
    nightvision: "NV // GEN-III",
  };

  // ─── Great-circle helpers ────────────────────────────────────────────────────
  function gcDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function gcBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  // ─── Measurement map-click handler ──────────────────────────────────────────
  useEffect(() => {
    const L   = LRef.current;
    const map = mapRef.current;
    const ml  = measureLayerRef.current;
    if (!L || !map || !ml) return;

    if (!measureMode) {
      ml.clearLayers();
      measurePtsRef.current = [];
      setMeasureResult(null);
      return;
    }

    const buildCrossIcon = (color: string) => L.divIcon({
      className: "",
      html: `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <line x1="8" y1="0" x2="8" y2="16" stroke="${color}" stroke-width="1.8"/>
        <line x1="0" y1="8" x2="16" y2="8" stroke="${color}" stroke-width="1.8"/>
        <circle cx="8" cy="8" r="3" fill="none" stroke="${color}" stroke-width="1.5"/>
      </svg>`,
      iconSize:   [16, 16],
      iconAnchor: [8, 8],
    });

    const buildMidLabel = (distKm: number, distNm: number, bearing: number) => L.divIcon({
      className: "",
      html: `<div style="
        background: rgba(8,14,26,0.94);
        border: 1px solid rgba(0,212,255,0.45);
        border-radius: 3px;
        padding: 4px 8px;
        font-family: 'Share Tech Mono',monospace;
        white-space: nowrap;
        pointer-events: none;
        transform: translate(-50%,-120%);
        backdrop-filter: blur(6px);
      ">
        <div style="color:#00d4ff;font-size:11px;font-weight:bold">${distKm.toFixed(1)} km &nbsp; ${distNm.toFixed(1)} nm</div>
        <div style="color:#94a3b8;font-size:9px;margin-top:2px">BRG: ${bearing.toFixed(1)}°T</div>
      </div>`,
      iconSize:   [0, 0],
      iconAnchor: [0, 0],
    });

    const renderMeasure = (pts: [number, number][]) => {
      ml.clearLayers();
      if (pts.length === 0) return;

      // Start marker — cyan cross
      L.marker(pts[0], { icon: buildCrossIcon("#00d4ff"), interactive: false }).addTo(ml);

      if (pts.length === 2) {
        // End marker — amber cross
        L.marker(pts[1], { icon: buildCrossIcon("#f59e0b"), interactive: false }).addTo(ml);

        // Great-circle polyline (approximate with 32 intermediate points)
        const gcPts: [number, number][] = [];
        for (let i = 0; i <= 32; i++) {
          const t   = i / 32;
          const lat = pts[0][0] + (pts[1][0] - pts[0][0]) * t;
          const lon = pts[0][1] + (pts[1][1] - pts[0][1]) * t;
          gcPts.push([lat, lon]);
        }
        L.polyline(gcPts, {
          color:       "#00d4ff",
          weight:      1.8,
          opacity:     0.85,
          dashArray:   "6 5",
          interactive: false,
        }).addTo(ml);

        // Mid-point label
        const midLat = (pts[0][0] + pts[1][0]) / 2;
        const midLon = (pts[0][1] + pts[1][1]) / 2;
        const distKm = gcDistanceKm(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
        const distNm = distKm / 1.852;
        const brg    = gcBearing(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
        L.marker([midLat, midLon], { icon: buildMidLabel(distKm, distNm, brg), interactive: false }).addTo(ml);
        setMeasureResult({ distKm, distNm, bearing: brg, start: pts[0], end: pts[1] });
      } else {
        setMeasureResult(null);
      }
    };

    const handleClick = (e: import("leaflet").LeafletMouseEvent) => {
      const pt: [number, number] = [e.latlng.lat, e.latlng.lng];
      const pts = measurePtsRef.current;
      let newPts: [number, number][];
      if (pts.length >= 2) {
        // Third click — reset, start new
        newPts = [pt];
      } else {
        newPts = [...pts, pt];
      }
      measurePtsRef.current = newPts;
      renderMeasure(newPts);
    };

    map.on("click", handleClick);
    // Change cursor to crosshair when measuring
    (map.getContainer() as HTMLDivElement).style.cursor = "crosshair";
    return () => {
      map.off("click", handleClick);
      (map.getContainer() as HTMLDivElement).style.cursor = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureMode]);

  // Toggle submarine cable overlay
  const toggleCables = useCallback(async () => {
    const L   = LRef.current;
    const map = mapRef.current;
    const cl  = cableLayerRef.current;
    if (!L || !map || !cl) return;

    if (cableActive) {
      cl.clearLayers();
      setCableActive(false);
      return;
    }

    setCableLoading(true);
    try {
      const res = await fetch("/data/submarine-cables-filtered.json");
      const geojson = await res.json();
      const features: any[] = geojson?.features ?? geojson ?? [];

      cl.clearLayers();
      for (const feature of features) {
        const coords: [number, number][][] = feature.geometry?.type === "MultiLineString"
          ? feature.geometry.coordinates
          : [feature.geometry?.coordinates ?? []];
        const name = feature.properties?.name ?? feature.properties?.cable_name ?? "Submarine Cable";
        const color = feature.properties?.color ?? "#00d4ff";

        for (const line of coords) {
          if (!line || line.length < 2) continue;
          const latlngs: [number, number][] = line.map(([lon, lat]: [number, number]) => [lat, lon]);
          L.polyline(latlngs, {
            color,
            weight: 1.5,
            opacity: 0.55,
            dashArray: "none",
            interactive: true,
            className: "cable-line",
          })
          .bindTooltip(
            `<div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:#00d4ff">⚡ ${name}</div>`,
            { sticky: true, className: "sx-popup", opacity: 0.9 }
          )
          .addTo(cl);
        }
      }
      setCableActive(true);
      console.log(`[Cables] ${features.length} submarine cables rendered`);
    } catch (err: unknown) {
      console.error("[Cables] Failed:", (err as Error).message);
      // Fallback: draw known major cables as hardcoded polylines
      const MAJOR_CABLES: { name: string; color: string; path: [number, number][] }[] = [
        { name: "SEA-ME-WE 4",    color: "#f59e0b", path: [[1.3,103.8],[5.5,80.5],[12.8,44.9],[30.0,32.6],[37.0,14.5],[43.3,-5.0]] },
        { name: "FLAG Atlantic",  color: "#ef4444", path: [[51.5,-0.1],[40.7,-74.0]] },
        { name: "TAT-14",         color: "#a855f7", path: [[53.3,-6.3],[48.4,-4.5],[40.7,-74.0]] },
        { name: "EASSy",          color: "#10b981", path: [[-34.0,18.5],[-11.7,43.3],[2.0,41.6],[15.3,39.5],[21.8,38.4]] },
        { name: "JUPITER",        color: "#22d3ee", path: [[35.7,139.7],[21.3,-157.8],[37.8,-122.4]] },
      ];
      for (const cable of MAJOR_CABLES) {
        L.polyline(cable.path, { color: cable.color, weight: 1.5, opacity: 0.5, dashArray: "6 4" })
          .bindTooltip(`<div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${cable.color}">⚡ ${cable.name}</div>`, { sticky: true, className: "sx-popup" })
          .addTo(cl);
      }
      setCableActive(true);
    } finally {
      setCableLoading(false);
    }
  }, [cableActive]);

  // Toggle threat density heatmap overlay
  const toggleHeatmap = useCallback(async () => {
    const L   = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (heatActive) {
      heatLayerRef.current?.remove();
      heatLayerRef.current = null;
      setHeatActive(false);
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      await import(/* @vite-ignore */ "leaflet.heat");
    } catch {
      // leaflet.heat may not be installed — continue without it
    }

    const severityWeight: Record<string, number> = {
      CRITICAL: 5, HIGH: 3, MEDIUM: 1, LOW: 0.4, INFO: 0.15,
    };

    const allEntities = [...entities, ...aisEntities];
    const heatData = allEntities.map((e) => [
      e.position.lat,
      e.position.lon,
      severityWeight[e.severity] ?? 0.5,
    ] as [number, number, number]);

    if (heatData.length === 0) return;

    const HeatLayer = (L as any).heatLayer;
    if (!HeatLayer) {
      console.warn("[Heatmap] leaflet.heat not available");
      return;
    }

    const layer = HeatLayer(heatData, {
      radius: 32,
      blur: 22,
      maxZoom: 10,
      max: 5,
      gradient: { 0.0: "#10b981", 0.35: "#fde047", 0.65: "#f59e0b", 1.0: "#ef4444" },
    });
    layer.addTo(map);
    heatLayerRef.current = layer;
    setHeatActive(true);
  }, [heatActive, entities, aisEntities]);

  // Update heatmap data when entities change
  useEffect(() => {
    if (!heatActive || !heatLayerRef.current) return;
    const severityWeight: Record<string, number> = {
      CRITICAL: 5, HIGH: 3, MEDIUM: 1, LOW: 0.4, INFO: 0.15,
    };
    const allEntities = [...entities, ...aisEntities];
    const heatData = allEntities.map((e) => [
      e.position.lat,
      e.position.lon,
      severityWeight[e.severity] ?? 0.5,
    ] as [number, number, number]);
    heatLayerRef.current.setLatLngs(heatData);
  }, [entities, aisEntities, heatActive]);

  // Toggle RainViewer precipitation radar overlay
  const toggleRadar = useCallback(async () => {
    const L   = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (radarActive) {
      radarTileRef.current?.remove();
      radarTileRef.current = null;
      setRadarActive(false);
      return;
    }

    setRadarLoading(true);
    try {
      const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      const json = await res.json();
      // Get the latest radar frame path
      const frames: { path: string; time: number }[] = json?.radar?.past ?? [];
      if (!frames.length) throw new Error("No radar frames available");
      const latest = frames[frames.length - 1];
      const tileUrl = `https://tilecache.rainviewer.com${latest.path}/256/{z}/{x}/{y}/2/1_1.png`;
      const layer = L.tileLayer(tileUrl, {
        attribution: "&copy; <a href='https://rainviewer.com/'>RainViewer</a>",
        opacity: 0.65,
        maxZoom: 18,
        tileSize: 256,
        zIndex: 5,
      });
      layer.addTo(map);
      radarTileRef.current = layer;
      setRadarActive(true);
      console.log("[Radar] RainViewer tile layer activated. Frame:", new Date(latest.time * 1000).toUTCString());
    } catch (err: unknown) {
      console.error("[Radar] Failed to load:", (err as Error).message);
    } finally {
      setRadarLoading(false);
    }
  }, [radarActive]);

  // Dynamic import of Leaflet
  useEffect(() => {
    import("leaflet").then((L) => {
      delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      LRef.current = L;
      setLeafletReady(true);
    });
  }, []);

  // Initialize map
  useEffect(() => {
    const L = LRef.current;
    if (!leafletReady || !L || !containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [20, 15], zoom: 3, minZoom: 2, maxZoom: 16,
      zoomControl: false, attributionControl: true, preferCanvas: true,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    tileRef.current = L.tileLayer(MAP_TILES.dark, {
      attribution: "&copy; <a href='https://carto.com/'>CARTO</a>",
      maxZoom: 18, subdomains: "abcd",
    }).addTo(map);

    hotspotRef.current = L.layerGroup().addTo(map);

    // AIS vessel layer (separate from clustered entities)
    aisLayerRef.current = L.layerGroup().addTo(map);

    // Geofence overlay layer (below entity markers)
    geofenceLayerRef.current = L.layerGroup().addTo(map);

    // Submarine cable layer (below entities)
    cableLayerRef.current = L.layerGroup().addTo(map);

    // Measurement layer (topmost interactive layer)
    measureLayerRef.current = L.layerGroup().addTo(map);

    const makeClusterGroup = () => {
      const MCG = (L as any).markerClusterGroup;
      if (MCG) {
        return MCG({
          chunkedLoading: true, maxClusterRadius: 55,
          spiderfyOnMaxZoom: true, showCoverageOnHover: false,
          iconCreateFunction: (cluster: any) => {
            const n   = cluster.getChildCount();
            const col = n >= 20 ? "#ef4444" : n >= 10 ? "#f59e0b" : "#00d4ff";
            const sz  = n >= 20 ? 44 : n >= 10 ? 38 : 32;
            const rgb = n >= 20 ? "239,68,68" : n >= 10 ? "245,158,11" : "0,212,255";
            return (L as any).divIcon({
              className: "",
              html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:rgba(${rgb},0.14);border:1.5px solid ${col};display:flex;align-items:center;justify-content:center;font-family:'Share Tech Mono',monospace;font-size:10px;font-weight:bold;color:${col};box-shadow:0 0 10px ${col}35">${n}</div>`,
              iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
            });
          },
        });
      }
      return L.layerGroup();
    };
    clusterRef.current = makeClusterGroup();
    clusterRef.current.addTo(map);

    map.on("zoomend",   () => setMapZoom(map.getZoom()));
    map.on("mousemove", (e) => setCursorPos({ lat: e.latlng.lat, lon: e.latlng.lng }));
    map.on("mouseout",  () => setCursorPos(null));

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current           = null;
      tileRef.current          = null;
      clusterRef.current       = null;
      aisLayerRef.current      = null;
      geofenceLayerRef.current = null;
      cableLayerRef.current    = null;
      measureLayerRef.current  = null;
    };
  }, [leafletReady]);

  // Switch tile provider
  useEffect(() => {
    const L   = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !tileRef.current) return;

    if (mapMode === "planet") {
      // Planet mode is handled separately via planetTileRef
      tileRef.current.remove();
      tileRef.current = L.tileLayer(MAP_TILES.satellite, {
        attribution: "&copy; Esri — Planet Labs", maxZoom: 18,
      }).addTo(map);
      return;
    }

    tileRef.current.remove();
    tileRef.current = L.tileLayer(MAP_TILES[mapMode], {
      attribution: mapMode === "satellite" ? "&copy; Esri — USGS / NOAA" : "&copy; <a href='https://carto.com/'>CARTO</a>",
      maxZoom: 18,
      ...(mapMode !== "satellite" ? { subdomains: "abcd" } : {}),
    }).addTo(map);

    // Remove planet overlay when switching away
    if (planetTileRef.current) {
      planetTileRef.current.remove();
      planetTileRef.current = null;
      setPlanetActive(false);
    }
  }, [mapMode]);

  // Fetch Planet Labs token and activate Planet tile layer
  const activatePlanetLayer = useCallback(async () => {
    const L   = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (planetActive) {
      // Toggle off
      if (planetTileRef.current) {
        planetTileRef.current.remove();
        planetTileRef.current = null;
      }
      setPlanetActive(false);
      setPlanetError(null);
      return;
    }

    setPlanetLoading(true);
    setPlanetError(null);

    try {
      // Get Planet token from edge function
      let token = planetTokenRef.current;
      if (!token) {
        const { data, error } = await supabase.functions.invoke("sentinel-feeds", {
          body: { action: "get_planet_token" },
        });
        if (error) throw new Error(error.message);
        token = data?.token ?? null;
        planetTokenRef.current = token;
      }

      if (!token) throw new Error("No Planet token received");

      // Planet Basemaps tile URL — uses nicfi-composite for global recent imagery
      // Format: https://tiles.planet.com/basemaps/v1/planet-tiles/{basemap_name}/gmap/{z}/{x}/{y}.png?api_key={key}
      const basemapName = "planet_medres_visual_2024-01_mosaic";
      const tileUrl = `https://tiles.planet.com/basemaps/v1/planet-tiles/${basemapName}/gmap/{z}/{x}/{y}.png?api_key=${token}`;

      // Add as overlay on top of existing tile layer
      const planetLayer = L.tileLayer(tileUrl, {
        attribution: "&copy; Planet Labs PBC",
        maxZoom: 15,
        maxNativeZoom: 15,
        opacity: 0.85,
        errorTileUrl: "",
      });

      // Test if tiles load (optional graceful fallback)
      planetLayer.addTo(map);
      planetTileRef.current = planetLayer;
      setPlanetActive(true);
      console.log("[Planet] Tile layer activated with basemap:", basemapName);
    } catch (err: unknown) {
      const msg = (err as Error).message;
      console.warn("[Planet] Failed to activate:", msg);
      setPlanetError(msg.includes("Planet credentials") ? "Planet API key not configured" : "Planet tile layer unavailable");
      setPlanetActive(false);
    } finally {
      setPlanetLoading(false);
    }
  }, [planetActive]);

  // Render hotspot zones
  useEffect(() => {
    const L  = LRef.current;
    const hg = hotspotRef.current;
    if (!L || !hg) return;
    hg.clearLayers();
    if (!showHotspots) return;

    HOTSPOT_ZONES.forEach((zone) => {
      L.circle([zone.lat, zone.lon], {
        radius: zone.radius * 1000,
        color: "rgba(239,68,68,0.55)", fillColor: "rgba(239,68,68,0.04)", fillOpacity: 1,
        weight: 1, dashArray: "6 4", interactive: false,
      }).addTo(hg);

      L.marker([zone.lat, zone.lon], {
        icon: L.divIcon({
          className: "",
          html: `<div style="background:rgba(13,20,36,0.92);border:1px solid rgba(239,68,68,0.45);
            color:rgba(239,68,68,0.9);font-family:'Share Tech Mono',monospace;
            font-size:9px;font-weight:bold;letter-spacing:.12em;padding:2px 7px;
            white-space:nowrap;border-radius:2px;transform:translateX(-50%);
            pointer-events:none;box-shadow:0 0 8px rgba(239,68,68,0.25)">
            ${zone.name.toUpperCase()}
          </div>`,
          iconSize: [0, 0], iconAnchor: [0, 0],
        }),
        interactive: false, zIndexOffset: -100,
      }).addTo(hg);
    });
  }, [showHotspots, leafletReady]);

  useEffect(() => { clusterModeRef.current = clusterMode; }, [clusterMode]);

  // ─── Render geofence polygons ────────────────────────────────────────────────
  useEffect(() => {
    const L   = LRef.current;
    const map = mapRef.current;
    const gl  = geofenceLayerRef.current;
    if (!L || !map || !gl) return;

    const fenceIds = new Set(geofences.map((f) => f.id));

    // Remove polygons for fences no longer in list
    for (const [id, poly] of geofencePolyRef.current) {
      if (!fenceIds.has(id)) {
        (gl as any).removeLayer(poly);
        geofencePolyRef.current.delete(id);
      }
    }

    // Add / update polygons
    for (const fence of geofences) {
      const classColor = fenceClassificationColor(fence.classification);
      // Determine if any entity is breaching this fence right now
      const allEntities = [...entities, ...aisEntities];
      const isBreached = allEntities.some((e) => {
        if (fence.trigger_domains.length > 0 && !fence.trigger_domains.includes(e.domain)) return false;
        return isInsideFence(e.position.lat, e.position.lon, fence);
      });

      const fillOpacity = isBreached ? 0.18 : 0.07;
      const weight      = isBreached ? 2.5  : 1.2;
      const dashArray   = isBreached ? undefined : "8 5";

      // Build Leaflet LatLngs
      let latlngs: [number, number][];
      if (fence.fence_type === "CIRCLE" && fence.coordinates[0]) {
        // Approximate circle as 36-point polygon
        const c   = fence.coordinates[0];
        const r   = (fence.radius_km ?? 50) / 111.32; // deg approx
        latlngs = Array.from({ length: 36 }, (_, i) => {
          const a = (i * 10 * Math.PI) / 180;
          return [c.lat + r * Math.cos(a), c.lon + r * Math.sin(a)] as [number, number];
        });
      } else {
        latlngs = fence.coordinates.map((p) => [p.lat, p.lon] as [number, number]);
      }

      if (latlngs.length < 3) continue;

      const existing = geofencePolyRef.current.get(fence.id);
      if (existing) {
        existing.setLatLngs(latlngs);
        existing.setStyle({
          color:       classColor,
          fillColor:   classColor,
          fillOpacity,
          weight,
          dashArray,
          opacity: isBreached ? 1 : 0.7,
        });
        // Toggle pulse animation class on the underlying SVG path element
        const el = (existing as any)._path as SVGPathElement | undefined;
        if (el) {
          if (isBreached) el.classList.add("geofence-breach");
          else el.classList.remove("geofence-breach");
        }
      } else {
        const poly = L.polygon(latlngs, {
          color:       classColor,
          fillColor:   classColor,
          fillOpacity,
          weight,
          dashArray,
          opacity: isBreached ? 1 : 0.7,
          interactive: true,
          className: isBreached ? "geofence-breach" : "",
        });

        // Tooltip with fence metadata
        const ttipHtml = `
          <div style="font-family:'Share Tech Mono',monospace;padding:2px">
            <div style="color:${classColor};font-size:10px;font-weight:bold;margin-bottom:3px">${fence.name}</div>
            <div style="color:#475569;font-size:8px">${fence.fence_type} // ${fence.classification.replace("_"," ")}</div>
            ${fence.trigger_domains.length ? `<div style="color:#64748b;font-size:8px;margin-top:2px">DOMAINS: ${fence.trigger_domains.join(", ")}</div>` : ""}
            ${isBreached ? `<div style="color:#ef4444;font-size:9px;margin-top:3px;font-weight:bold">⚠ ACTIVE BREACH DETECTED</div>` : ""}
          </div>`;
        poly.bindTooltip(ttipHtml, { sticky: true, className: "sx-popup", opacity: 0.95 });
        poly.addTo(gl);
        geofencePolyRef.current.set(fence.id, poly);
      }
    }

    setGeofenceCount(geofences.length);
  }, [geofences, entities, aisEntities]);

  // ─── Breach detection → emit StreamEvents ────────────────────────────────────
  useEffect(() => {
    if (!onGeofenceBreach || geofences.length === 0) return;

    const allEntities = [...entities, ...aisEntities];
    let breachesThisCycle = 0;

    for (const fence of geofences) {
      for (const entity of allEntities) {
        // Domain filter
        if (
          fence.trigger_domains.length > 0 &&
          !fence.trigger_domains.includes(entity.domain)
        ) continue;

        const key = `${fence.id}:${entity.id}`;
        const now = Date.now();

        // Cooldown check (60s per fence+entity pair)
        const expiry = breachCooldownRef.current.get(key);
        if (expiry && now < expiry) continue;

        if (isInsideFence(entity.position.lat, entity.position.lon, fence)) {
          breachCooldownRef.current.set(key, now + 60_000);
          breachesThisCycle++;

          const classColor = fenceClassificationColor(fence.classification);
          const eventId = `breach-${fence.id}-${entity.id}-${now}`;

          onGeofenceBreach({
            id:          eventId,
            entityId:    entity.id,
            domain:      entity.domain,
            severity:    entity.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
            title:       `⚠ GEOFENCE BREACH: ${fence.name}`,
            description: `${entity.label} (${entity.type.replace(/_/g, " ")}) entered restricted zone "${fence.name}" [${fence.classification.replace("_", " ")}]`,
            ts:          new Date().toISOString(),
            position:    entity.position,
            acknowledged: false,
          });

          console.log(`[GeoFence] BREACH — ${entity.label} in ${fence.name} (${classColor})`);
        }
      }
    }

    if (breachesThisCycle > 0) {
      setBreachCount((n) => n + breachesThisCycle);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, aisEntities, geofences]);

  // ─── Render / update entity markers
  const renderEntities = useCallback(() => {
    const L      = LRef.current;
    const map    = mapRef.current;
    const group  = clusterRef.current;
    if (!L || !map || !group) return;

    const useClusters = clusterModeRef.current && !!(L as any).markerClusterGroup;
    const visible = entities.filter((e) => enabledDomains.has(e.domain));
    const visSet  = new Set(visible.map((e) => e.id));

    for (const [id, marker] of markersRef.current) {
      if (!visSet.has(id)) {
        (group as any).removeLayer ? (group as any).removeLayer(marker) : marker.remove();
        markersRef.current.delete(id);
      }
    }
    for (const [id, trail] of trailsRef.current) {
      if (!visSet.has(id)) { trail.remove(); trailsRef.current.delete(id); }
    }

    for (const entity of visible) {
      const isSelected = entity.id === selectedEntityId;
      const icon       = buildEntityIcon(L, entity, isSelected);
      const latlng: [number, number] = [entity.position.lat, entity.position.lon];

      const existing = markersRef.current.get(entity.id);
      if (existing) {
        existing.setLatLng(latlng);
        existing.setIcon(icon);
        existing.setPopupContent(buildPopupHtml(entity));
      } else {
        const marker = L.marker(latlng, { icon, riseOnHover: true })
          .bindPopup(buildPopupHtml(entity), {
            maxWidth: 280, className: "sx-popup",
            closeButton: true, autoPanPadding: [40, 40],
          })
          .on("click", () => onEntitySelect(entity));

        if (useClusters) {
          (group as any).addLayer(marker);
        } else {
          marker.addTo(map);
        }
        markersRef.current.set(entity.id, marker);
      }

      if (showTrails && entity.track && entity.track.length >= 1) {
        const pts = [...entity.track.map((p) => [p.lat, p.lon] as [number, number]), latlng];
        const col = severityToColor(entity.severity);
        const exT = trailsRef.current.get(entity.id);
        if (exT) {
          exT.setLatLngs(pts);
        } else {
          const trail = L.polyline(pts, {
            color: col, weight: 1.5, opacity: 0.4, dashArray: "4 5", interactive: false,
          }).addTo(map);
          trailsRef.current.set(entity.id, trail);
        }
      } else {
        const t = trailsRef.current.get(entity.id);
        if (t) { t.remove(); trailsRef.current.delete(entity.id); }
      }
    }

    setEntityCount(visible.length);
  }, [entities, enabledDomains, selectedEntityId, showTrails, onEntitySelect]);

  // Compute projected course point 30 minutes ahead
  function projectPosition(
    lat: number, lon: number, headingDeg: number, speedKnots: number, minutes: number
  ): [number, number] {
    const distNm = (speedKnots * minutes) / 60;
    const distDeg = distNm / 60; // 1 degree lat ≈ 60 nm
    const rad = (headingDeg * Math.PI) / 180;
    const dLat = distDeg * Math.cos(rad);
    const dLon = distDeg * Math.sin(rad) / Math.cos((lat * Math.PI) / 180);
    return [lat + dLat, lon + dLon];
  }

  // Render AIS vessel markers + course projection polylines
  const renderAISVessels = useCallback(() => {
    const L        = LRef.current;
    const map      = mapRef.current;
    const aisLayer = aisLayerRef.current;
    if (!L || !map || !aisLayer) return;

    if (!showAISLayer) {
      // Clear all AIS markers and projections
      for (const marker of aisMarkersRef.current.values()) marker.remove();
      aisMarkersRef.current.clear();
      for (const line of aisProjectionsRef.current.values()) line.remove();
      aisProjectionsRef.current.clear();
      setAisVesselCount(0);
      return;
    }

    const visSet = new Set(aisEntities.map((e) => e.id));

    // Remove stale AIS markers and projections
    for (const [id, marker] of aisMarkersRef.current) {
      if (!visSet.has(id)) { marker.remove(); aisMarkersRef.current.delete(id); }
    }
    for (const [id, line] of aisProjectionsRef.current) {
      if (!visSet.has(id)) { line.remove(); aisProjectionsRef.current.delete(id); }
    }

    // Add/update AIS markers
    for (const entity of aisEntities) {
      const isSelected = entity.id === selectedEntityId;
      const icon       = buildAISIcon(L, entity, isSelected);
      const latlng: [number, number] = [entity.position.lat, entity.position.lon];

      const existing = aisMarkersRef.current.get(entity.id);
      if (existing) {
        existing.setLatLng(latlng);
        existing.setIcon(icon);
        existing.setPopupContent(buildPopupHtml(entity));
      } else {
        const marker = L.marker(latlng, { icon, riseOnHover: true, zIndexOffset: 10 })
          .bindPopup(buildPopupHtml(entity), { maxWidth: 280, className: "sx-popup", closeButton: true })
          .on("click", () => onEntitySelect(entity))
          .addTo(aisLayer);
        aisMarkersRef.current.set(entity.id, marker);
      }

      // Course projection line: vessels with speed > 0 get a 30-min projection
      const speed = entity.speed ?? 0;
      const heading = entity.heading ?? 0;
      if (speed > 0) {
        const projected = projectPosition(
          entity.position.lat, entity.position.lon, heading, speed, 30
        );
        const pts: [number, number][] = [latlng, projected];
        const existingLine = aisProjectionsRef.current.get(entity.id);
        if (existingLine) {
          existingLine.setLatLngs(pts);
        } else {
          const isMilitary = entity.type === "VESSEL_WARSHIP";
          const isTanker   = entity.type === "VESSEL_TANKER";
          const projColor  = isMilitary ? "rgba(239,68,68,0.55)" : isTanker ? "rgba(245,158,11,0.55)" : "rgba(34,211,238,0.55)";
          const line = L.polyline(pts, {
            color: projColor,
            weight: 1.2,
            opacity: 0.7,
            dashArray: "5 5",
            interactive: false,
          }).addTo(aisLayer);
          aisProjectionsRef.current.set(entity.id, line);
        }
      } else {
        // Remove projection if vessel stopped
        const line = aisProjectionsRef.current.get(entity.id);
        if (line) { line.remove(); aisProjectionsRef.current.delete(entity.id); }
      }
    }

    setAisVesselCount(aisEntities.length);
  }, [aisEntities, selectedEntityId, showAISLayer, onEntitySelect]);

  useEffect(() => {
    const group = clusterRef.current;
    if (!group) return;
    if ((group as any).clearLayers) (group as any).clearLayers();
    markersRef.current.clear();
  }, [clusterMode]);

  useEffect(() => { renderEntities(); }, [renderEntities]);
  useEffect(() => { renderAISVessels(); }, [renderAISVessels]);

  // Pan + open popup for selected entity
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedEntityId) return;
    const allEntities = [...entities, ...aisEntities];
    const entity = allEntities.find((e) => e.id === selectedEntityId);
    if (!entity) return;
    map.panTo([entity.position.lat, entity.position.lon], { animate: true, duration: 0.8 });
    const marker = markersRef.current.get(selectedEntityId) ?? aisMarkersRef.current.get(selectedEntityId);
    marker?.openPopup();
  }, [selectedEntityId, entities, aisEntities]);

  const tileFilter  = OVERLAY_FILTERS[overlayMode];
  const vignetteClr = OVERLAY_VIGNETTE[overlayMode];

  return (
    <div className="relative flex-1 min-h-0 w-full h-full overflow-hidden">
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ background: "#020617", filter: tileFilter, transition: "filter 0.4s ease" }}
      />

      {overlayMode !== "normal" && (
        <div
          className="absolute inset-0 pointer-events-none z-[399]"
          style={{
            background: `radial-gradient(ellipse at center, transparent 55%, ${vignetteClr} 100%)`,
            transition: "background 0.4s ease",
          }}
        />
      )}

      <div
        className="absolute inset-0 pointer-events-none z-[400]"
        style={{
          background: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.065) 2px,rgba(0,0,0,0.065) 4px)",
        }}
      />

      {(["top-0 left-0 border-t-2 border-l-2",
         "top-0 right-0 border-t-2 border-r-2",
         "bottom-0 left-0 border-b-2 border-l-2",
         "bottom-0 right-0 border-b-2 border-r-2"] as const).map((cls, i) => (
        <div key={i} className={`absolute w-6 h-6 ${cls} border-sx-cyan/25 pointer-events-none z-[401]`} />
      ))}

      {/* TL — Tactical readouts */}
      <div className="absolute top-3 left-4 z-[402] pointer-events-none select-none space-y-0.5">
        <div className="font-mono" style={{ fontSize: 9, color: "rgba(0,212,255,0.65)" }}>
          SENTINEL-X // TACTICAL DISPLAY v6.3
        </div>
        <div className="font-mono" style={{ fontSize: 9, color: "rgba(0,212,255,0.4)" }}>
          PROJ: WEB MERCATOR // WGS-84 // ZOOM: {mapZoom}
        </div>
        <div className="font-mono" style={{ fontSize: 9, color: "rgba(0,212,255,0.5)" }}>
          ENTITIES: <span style={{ color: "#00d4ff", fontWeight: "bold" }}>{entityCount}</span>&nbsp;ACTIVE
          {aisVesselCount > 0 && (
            <span style={{ color: "#22d3ee", marginLeft: 6 }}>
              // AIS: <span style={{ fontWeight: "bold" }}>{aisVesselCount}</span> VESSELS
            </span>
          )}
        </div>
        {cursorPos && (
          <div className="font-mono" style={{ fontSize: 9, color: "rgba(0,212,255,0.7)" }}>
            {Math.abs(cursorPos.lat).toFixed(4)}°{cursorPos.lat >= 0 ? "N" : "S"}&nbsp;
            {Math.abs(cursorPos.lon).toFixed(4)}°{cursorPos.lon >= 0 ? "E" : "W"}
          </div>
        )}
        {overlayMode !== "normal" && (
          <div className="font-mono font-bold" style={{ fontSize: 9, color: overlayMode === "flir" ? "#f97316" : "#10b981", letterSpacing: "0.12em" }}>
            ● {overlayLabel[overlayMode]}
          </div>
        )}
        {geofenceCount > 0 && (
          <div className="font-mono" style={{ fontSize: 9, color: "rgba(239,68,68,0.65)", letterSpacing: "0.1em" }}>
            ◻ GEOFENCES: {geofenceCount} ACTIVE{breachCount > 0 ? ` // ${breachCount} BREACH${breachCount > 1 ? "ES" : ""}` : ""}
          </div>
        )}
        {planetActive && (
          <div className="font-mono" style={{ fontSize: 9, color: "rgba(34,211,238,0.7)", letterSpacing: "0.1em" }}>
            ⊙ PLANET LABS IMAGERY ACTIVE
          </div>
        )}
        {heatActive && (
          <div className="font-mono" style={{ fontSize: 9, color: "rgba(239,68,68,0.65)", letterSpacing: "0.1em" }}>
            🔥 THREAT HEATMAP ACTIVE // CRITICAL=RED
          </div>
        )}
        {heatActive && (
          <div className="font-mono" style={{ fontSize: 9, color: "rgba(239,68,68,0.5)", letterSpacing: "0.08em", cursor: "pointer" }}
            onClick={() => setHeatLegendOpen((v) => !v)}>
            {heatLegendOpen ? "▾ HIDE LEGEND" : "▸ SHOW LEGEND"}
          </div>
        )}
        {cableActive && (
          <div className="font-mono" style={{ fontSize: 9, color: "rgba(0,212,255,0.65)", letterSpacing: "0.1em" }}>
            ⚡ SUBMARINE CABLES ACTIVE
          </div>
        )}
        {measureMode && (
          <div className="font-mono" style={{ fontSize: 9, color: "rgba(250,204,21,0.85)", letterSpacing: "0.1em" }}>
            ⊢ MEASURE ACTIVE — {measurePtsRef.current.length === 0 ? "CLICK START POINT" : measurePtsRef.current.length === 1 ? "CLICK END POINT" : "CLICK TO RESET"}
          </div>
        )}
        {measureMode && measureResult && (
          <div className="font-mono" style={{ fontSize: 9, color: "rgba(250,204,21,0.7)", letterSpacing: "0.08em" }}>
            ⊢ {measureResult.distKm.toFixed(1)} km · {measureResult.distNm.toFixed(1)} nm · {measureResult.bearing.toFixed(1)}°T
          </div>
        )}
        {radarActive && (
          <div className="font-mono" style={{ fontSize: 9, color: "rgba(99,179,237,0.75)", letterSpacing: "0.1em" }}>
            ⛈ PRECIP RADAR ACTIVE // RAINVIEWER
          </div>
        )}
      </div>

      {/* TR — Classification */}
      <div className="absolute top-3 right-4 z-[402] pointer-events-none select-none text-right space-y-0.5">
        <div className="font-mono" style={{ fontSize: 9, color: "rgba(239,68,68,0.75)" }}>
          ⚠ TS // SENTINEL // NOFORN
        </div>
        <div className="font-mono" style={{ fontSize: 9, color: "rgba(0,212,255,0.4)" }}>
          SOURCES: 16 OSINT FEEDS // 9 DOMAINS
        </div>
        <div className="font-mono" style={{ fontSize: 9, color: "rgba(0,212,255,0.4)" }}>
          STREAM: LIVE // Δt: 3s
        </div>
        {aisConnected && (
          <div className="font-mono" style={{ fontSize: 9, color: "rgba(34,211,238,0.6)" }}>
            AIS WS: LIVE // MSG: {aisMessageCount}
          </div>
        )}
      </div>

      {/* BL — Map mode + cluster + AIS + Planet toggles */}
      <div className="absolute z-[402] flex flex-col gap-1" style={{ bottom: 44, left: 12 }}>
        {/* Submarine cable toggle */}
        <button
          onClick={toggleCables}
          disabled={cableLoading}
          style={{
            background:     cableActive ? "rgba(0,212,255,0.15)" : "rgba(13,20,36,0.88)",
            color:          cableLoading ? "#475569" : cableActive ? "#00d4ff" : "#475569",
            border:         cableActive ? "1px solid rgba(0,212,255,0.35)" : "1px solid rgba(30,58,95,0.7)",
            backdropFilter: "blur(6px)",
            fontFamily:     "'Share Tech Mono',monospace", fontSize: 9,
            letterSpacing:  "0.1em", padding: "3px 8px", borderRadius: 2,
            cursor: cableLoading ? "default" : "pointer", textTransform: "uppercase", transition: "all 0.15s",
          }}
          title="Toggle submarine cable infrastructure overlay"
        >
          {cableLoading ? "⚡ CABLES…" : cableActive ? "⚡ CABLES ON" : "⚡ CABLES"}
        </button>

        <button
          onClick={() => setClusterMode((v) => !v)}
          style={{
            background:     clusterMode ? "rgba(168,85,247,0.18)" : "rgba(13,20,36,0.88)",
            color:          clusterMode ? "#a855f7" : "#475569",
            border:         clusterMode ? "1px solid rgba(168,85,247,0.4)" : "1px solid rgba(30,58,95,0.7)",
            backdropFilter: "blur(6px)",
            fontFamily:     "'Share Tech Mono',monospace", fontSize: 9,
            letterSpacing:  "0.1em", padding: "3px 8px", borderRadius: 2,
            cursor: "pointer", textTransform: "uppercase", transition: "all 0.15s",
          }}
        >
          {clusterMode ? "⬡ CLUSTER" : "○ SCATTER"}
        </button>

        {/* AIS toggle */}
        <button
          onClick={() => setShowAISLayer((v) => !v)}
          style={{
            background:     showAISLayer && aisConnected ? "rgba(34,211,238,0.15)" : "rgba(13,20,36,0.88)",
            color:          showAISLayer && aisConnected ? "#22d3ee" : aisConnected ? "#22d3ee60" : "#475569",
            border:         showAISLayer && aisConnected ? "1px solid rgba(34,211,238,0.35)" : "1px solid rgba(30,58,95,0.7)",
            backdropFilter: "blur(6px)",
            fontFamily:     "'Share Tech Mono',monospace", fontSize: 9,
            letterSpacing:  "0.1em", padding: "3px 8px", borderRadius: 2,
            cursor: "pointer", textTransform: "uppercase", transition: "all 0.15s",
          }}
        >
          {aisConnected ? (showAISLayer ? `⛵ AIS ${aisVesselCount}` : "⛵ AIS OFF") : "⛵ AIS —"}
        </button>

        {/* Threat Heatmap toggle */}
        <button
          onClick={toggleHeatmap}
          style={{
            background:     heatActive ? "rgba(239,68,68,0.15)" : "rgba(13,20,36,0.88)",
            color:          heatActive ? "#ef4444" : "#475569",
            border:         heatActive ? "1px solid rgba(239,68,68,0.35)" : "1px solid rgba(30,58,95,0.7)",
            backdropFilter: "blur(6px)",
            fontFamily:     "'Share Tech Mono',monospace", fontSize: 9,
            letterSpacing:  "0.1em", padding: "3px 8px", borderRadius: 2,
            cursor: "pointer", textTransform: "uppercase", transition: "all 0.15s",
          }}
          title="Toggle threat density heatmap (CRITICAL=red, LOW=green)"
        >
          {heatActive ? "🔥 HEAT ON" : "🔥 HEAT"}
        </button>

        {/* RainViewer Radar toggle */}
        <button
          onClick={toggleRadar}
          disabled={radarLoading}
          style={{
            background:     radarActive ? "rgba(99,179,237,0.15)" : "rgba(13,20,36,0.88)",
            color:          radarLoading ? "#475569" : radarActive ? "#63b3ed" : "#475569",
            border:         radarActive ? "1px solid rgba(99,179,237,0.35)" : "1px solid rgba(30,58,95,0.7)",
            backdropFilter: "blur(6px)",
            fontFamily:     "'Share Tech Mono',monospace", fontSize: 9,
            letterSpacing:  "0.1em", padding: "3px 8px", borderRadius: 2,
            cursor: radarLoading ? "default" : "pointer", textTransform: "uppercase", transition: "all 0.15s",
          }}
          title="Toggle live precipitation radar (RainViewer)"
        >
          {radarLoading ? "⟳ RADAR…" : radarActive ? "⛈ RADAR ON" : "⛈ RADAR"}
        </button>

        {/* Measurement tool toggle */}
        <button
          onClick={() => setMeasureMode((v) => !v)}
          style={{
            background:     measureMode ? "rgba(250,204,21,0.15)" : "rgba(13,20,36,0.88)",
            color:          measureMode ? "#facc15" : "#475569",
            border:         measureMode ? "1px solid rgba(250,204,21,0.4)" : "1px solid rgba(30,58,95,0.7)",
            backdropFilter: "blur(6px)",
            fontFamily:     "'Share Tech Mono',monospace", fontSize: 9,
            letterSpacing:  "0.1em", padding: "3px 8px", borderRadius: 2,
            cursor: "pointer", textTransform: "uppercase", transition: "all 0.15s",
          }}
          title={measureMode ? "Exit measurement mode (click map to clear)" : "Measure great-circle distance & bearing (click two points)"}
        >
          {measureMode ? "✕ MEASURE" : "⊢ MEASURE"}
        </button>

        {/* Planet Labs toggle */}
        <button
          onClick={activatePlanetLayer}
          disabled={planetLoading}
          style={{
            background:     planetActive ? "rgba(34,211,238,0.12)" : "rgba(13,20,36,0.88)",
            color:          planetLoading ? "#475569" : planetActive ? "#22d3ee" : planetError ? "#ef4444" : "#475569",
            border:         planetActive ? "1px solid rgba(34,211,238,0.3)" : planetError ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(30,58,95,0.7)",
            backdropFilter: "blur(6px)",
            fontFamily:     "'Share Tech Mono',monospace", fontSize: 9,
            letterSpacing:  "0.1em", padding: "3px 8px", borderRadius: 2,
            cursor: planetLoading ? "default" : "pointer", textTransform: "uppercase", transition: "all 0.15s",
          }}
          title={planetError ?? "Toggle Planet Labs satellite imagery overlay"}
        >
          {planetLoading ? "⊙ PLANET…" : planetActive ? "⊙ PLANET ON" : "⊙ PLANET"}
        </button>

        {/* Map base tiles */}
        {(["dark", "satellite"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setMapMode(mode)}
            style={{
              background:     mapMode === mode ? "rgba(0,212,255,0.18)" : "rgba(13,20,36,0.88)",
              color:          mapMode === mode ? "#00d4ff" : "#475569",
              border:         mapMode === mode ? "1px solid rgba(0,212,255,0.4)" : "1px solid rgba(30,58,95,0.7)",
              backdropFilter: "blur(6px)",
              fontFamily:     "'Share Tech Mono',monospace", fontSize: 9,
              letterSpacing:  "0.1em", padding: "3px 8px", borderRadius: 2,
              cursor: "pointer", textTransform: "uppercase", transition: "all 0.15s",
            }}
          >
            {mode === "dark" ? "TACTICAL" : "SAT VIEW"}
          </button>
        ))}
      </div>

      {/* BC — Heatmap legend overlay */}
      {heatActive && (
        <HeatmapLegend
          entities={[...entities, ...aisEntities]}
          open={heatLegendOpen}
          onToggle={() => setHeatLegendOpen((v) => !v)}
        />
      )}

      {/* BR — Compass Rose */}
      <CompassRose
        entityCount={entityCount}
        aisCount={aisVesselCount}
        measureBearing={measureResult?.bearing ?? null}
        measureMode={measureMode}
      />

      {/* Planet error tooltip */}
      {planetError && (
        <div
          className="absolute z-[402] font-mono text-[8px] px-2 py-1 rounded"
          style={{
            bottom: 44, left: 12 + 90,
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "#ef4444",
          }}
        >
          {planetError}
        </div>
      )}

      {/* Loading overlay */}
      {!leafletReady && (
        <div className="absolute inset-0 z-[410] flex items-center justify-center" style={{ background: "#020617" }}>
          <div className="text-center space-y-4">
            <div className="font-mono text-sx-cyan text-sm tracking-[0.3em]">INITIALIZING TACTICAL DISPLAY</div>
            <div className="font-mono text-sx-text-muted text-xs tracking-widest">LOADING GEOSPATIAL ENGINE…</div>
            <div className="flex justify-center gap-1">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="w-1 rounded-full bg-sx-cyan/40" style={{
                  height: `${12 + (i % 3) * 6}px`,
                  animation: `pulse ${0.6 + i * 0.1}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.08}s`,
                }} />
              ))}
            </div>
            <div className="font-mono text-[9px] text-sx-text-muted tracking-widest">CONNECTING TO SENTINEL STREAM…</div>
          </div>
        </div>
      )}
    </div>
  );
}
