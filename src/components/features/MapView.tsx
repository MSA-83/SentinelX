// src/components/features/MapView.tsx
// Tactical Leaflet map with custom SVG entity markers, heading vectors,
// trail rendering, threat zone overlays, and anomaly pulse rings.
// Leaflet is dynamically imported (npm) to avoid CDN/SRI race conditions.

import { useEffect, useRef, useState, useCallback } from "react";
import type { Map as LeafletMap, TileLayer, LayerGroup, Marker, Polyline } from "leaflet";
import type { SentinelEntity, DomainKey } from "@/types/entities";
import { DOMAIN_CONFIGS, HOTSPOT_ZONES } from "@/constants/domains";
import { severityToColor } from "@/lib/threatAssessor";

export type MapOverlayMode = "normal" | "flir" | "nightvision";

interface MapViewProps {
  entities: SentinelEntity[];
  enabledDomains: Set<DomainKey>;
  onEntitySelect: (entity: SentinelEntity) => void;
  selectedEntityId: string | null;
  showHotspots: boolean;
  showTrails: boolean;
  overlayMode?: MapOverlayMode;
}

type MapMode = "dark" | "satellite";

const MAP_TILES = {
  dark:      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};

// SVG path shapes per domain — scaled to ±12 unit coordinate space
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

  // Heading vector for moving entities
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

  // Animated pulse rings for anomalies
  const pulseRings = entity.anomalyFlag ? `
    <circle cx="${cx}" cy="${cy}" r="${R + 4}" fill="none" stroke="${color}" stroke-width="1" opacity="0">
      <animate attributeName="r"       from="${R + 2}" to="${R + 18}" dur="2.2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.5"      to="0"         dur="2.2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="${cx}" cy="${cy}" r="${R + 2}" fill="none" stroke="${color}" stroke-width="0.6" opacity="0">
      <animate attributeName="r"       from="${R}"     to="${R + 12}" dur="2.2s" begin="0.8s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.3"      to="0"         dur="2.2s" begin="0.8s" repeatCount="indefinite"/>
    </circle>` : "";

  // Selection spinner ring
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

// ─── Popup HTML builder ────────────────────────────────────────────────────────

function buildPopupHtml(entity: SentinelEntity): string {
  const cfg   = DOMAIN_CONFIGS[entity.domain];
  const color = severityToColor(entity.severity);
  const lat   = `${Math.abs(entity.position.lat).toFixed(4)}°${entity.position.lat >= 0 ? "N" : "S"}`;
  const lon   = `${Math.abs(entity.position.lon).toFixed(4)}°${entity.position.lon >= 0 ? "E" : "W"}`;

  const rows: [string, string, string?][] = [
    ["ID",         entity.id,                          "#94a3b8"],
    ["TYPE",       entity.type.replace(/_/g, " "),     "#94a3b8"],
    ["SEVERITY",   entity.severity,                    color],
    ["SOURCE",     entity.source,                      "#94a3b8"],
    ["POS",        `${lat} ${lon}`,                    "#00d4ff"],
    ["CONFIDENCE", `${(entity.confidence * 100).toFixed(0)}%`, "#94a3b8"],
  ];
  if (entity.heading !== undefined)
    rows.push(["HDG / SPD", `${entity.heading.toFixed(0)}° / ${entity.speed ?? "—"} kt`, "#94a3b8"]);
  if (entity.altitude !== undefined)
    rows.push(["ALT", `${entity.altitude.toLocaleString()} ft`, "#94a3b8"]);

  const rowsHtml = rows.map(([k, v, c]) =>
    `<span style="color:#475569;font-size:9px">${k}</span>
     <span style="color:${c ?? "#94a3b8"};font-size:9px;${k === "SEVERITY" ? "font-weight:bold" : ""}">${v}</span>`
  ).join("");

  const anomalyBanner = entity.anomalyFlag
    ? `<div style="color:#f59e0b;font-size:9px;margin-top:5px;border-top:1px solid rgba(245,158,11,0.2);padding-top:4px">
        ⚠ ANOMALY FLAG — ELEVATED MONITORING PRIORITY
       </div>`
    : "";

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
      <div style="margin-top:6px;font-size:8px;color:#1e3a5f;letter-spacing:0.08em">
        CLICK ENTITY TO OPEN FULL INTELLIGENCE RECORD
      </div>
    </div>`;
}

// ─── Mini radar HUD widget ─────────────────────────────────────────────────────

function MiniRadar({ entityCount }: { entityCount: number }) {
  const [angle, setAngle] = useState(0);
  useEffect(() => {
    let raf: number;
    let last = 0;
    const tick = (ts: number) => {
      if (ts - last > 16) { setAngle((a) => (a + 1.2) % 360); last = ts; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const r = 38;
  const cx = 50;
  const cy = 50;

  return (
    <div
      className="absolute z-[402] pointer-events-none select-none"
      style={{ bottom: 36, right: 64 }}
    >
      <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        {/* Concentric rings */}
        {[r * 0.35, r * 0.65, r].map((rr, i) => (
          <circle key={i} cx={cx} cy={cy} r={rr} fill="none"
            stroke="rgba(0,212,255,0.18)" strokeWidth="0.75" />
        ))}
        {/* Cross-hairs */}
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="rgba(0,212,255,0.12)" strokeWidth="0.5"/>
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="rgba(0,212,255,0.12)" strokeWidth="0.5"/>
        {/* Sweep gradient */}
        <defs>
          <radialGradient id="sweepGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <path
          d={`M ${cx} ${cy} L ${(cx + r * Math.cos(((angle - 90) * Math.PI) / 180)).toFixed(2)} ${(cy + r * Math.sin(((angle - 90) * Math.PI) / 180)).toFixed(2)} A ${r} ${r} 0 0 1 ${(cx + r * Math.cos(((angle - 90 - 55) * Math.PI) / 180)).toFixed(2)} ${(cy + r * Math.sin(((angle - 90 - 55) * Math.PI) / 180)).toFixed(2)} Z`}
          fill="url(#sweepGrad)"
          opacity="0.6"
        />
        {/* Sweep line */}
        <line
          x1={cx} y1={cy}
          x2={(cx + r * Math.cos(((angle - 90) * Math.PI) / 180)).toFixed(2)}
          y2={(cy + r * Math.sin(((angle - 90) * Math.PI) / 180)).toFixed(2)}
          stroke="#00d4ff" strokeWidth="1" opacity="0.8"
        />
        {/* Entity count */}
        <text x={cx} y={cy + 2} textAnchor="middle" fill="#00d4ff"
          fontSize="9" fontFamily="'Share Tech Mono',monospace" fontWeight="bold">
          {entityCount}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="rgba(0,212,255,0.5)"
          fontSize="6" fontFamily="'Share Tech Mono',monospace" letterSpacing="1">
          TRK
        </text>
        {/* Outer label */}
        <text x={cx} y={cy - r - 4} textAnchor="middle" fill="rgba(0,212,255,0.4)"
          fontSize="6" fontFamily="'Share Tech Mono',monospace" letterSpacing="1">
          RADAR
        </text>
      </svg>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

// CSS filter presets for overlay modes
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
}: MapViewProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<LeafletMap | null>(null);
  const tileRef       = useRef<TileLayer | null>(null);
  const hotspotRef    = useRef<LayerGroup | null>(null);
  const markersRef    = useRef<Map<string, Marker>>(new Map());
  const trailsRef     = useRef<Map<string, Polyline>>(new Map());
  const LRef          = useRef<typeof import("leaflet") | null>(null);

  const [mapMode,      setMapMode]      = useState<MapMode>("dark");
  const [leafletReady, setLeafletReady] = useState(false);
  const [entityCount,  setEntityCount]  = useState(0);
  const [mapZoom,      setMapZoom]      = useState(3);
  const [cursorPos,    setCursorPos]    = useState<{ lat: number; lon: number } | null>(null);

  // Overlay mode label
  const overlayLabel: Record<MapOverlayMode, string> = {
    normal: "",
    flir: "FLIR // THERMAL",
    nightvision: "NV // GEN-III",
  };

  // Dynamic import of Leaflet (guarantees CSS + JS load correctly via bundler)
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

  // Initialize map once Leaflet is available
  useEffect(() => {
    const L = LRef.current;
    if (!leafletReady || !L || !containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center:           [20, 15],
      zoom:             3,
      minZoom:          2,
      maxZoom:          16,
      zoomControl:      false,
      attributionControl: true,
      preferCanvas:     true,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    tileRef.current = L.tileLayer(MAP_TILES.dark, {
      attribution: "&copy; <a href='https://carto.com/'>CARTO</a>",
      maxZoom:     18,
      subdomains:  "abcd",
    }).addTo(map);

    hotspotRef.current = L.layerGroup().addTo(map);

    map.on("zoomend",      () => setMapZoom(map.getZoom()));
    map.on("mousemove",    (e) => setCursorPos({ lat: e.latlng.lat, lon: e.latlng.lng }));
    map.on("mouseout",     () => setCursorPos(null));

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current  = null;
      tileRef.current = null;
    };
  }, [leafletReady]);

  // Switch tile provider
  useEffect(() => {
    const L   = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !tileRef.current) return;
    tileRef.current.remove();
    tileRef.current = L.tileLayer(MAP_TILES[mapMode], {
      attribution: mapMode === "satellite"
        ? "&copy; Esri &mdash; USGS / NOAA"
        : "&copy; <a href='https://carto.com/'>CARTO</a>",
      maxZoom: 18,
      ...(mapMode !== "satellite" ? { subdomains: "abcd" } : {}),
    }).addTo(map);
  }, [mapMode]);

  // Render hotspot zones
  useEffect(() => {
    const L  = LRef.current;
    const hg = hotspotRef.current;
    if (!L || !hg) return;
    hg.clearLayers();
    if (!showHotspots) return;

    HOTSPOT_ZONES.forEach((zone) => {
      L.circle([zone.lat, zone.lon], {
        radius:      zone.radius * 1000,
        color:       "rgba(239,68,68,0.55)",
        fillColor:   "rgba(239,68,68,0.04)",
        fillOpacity: 1,
        weight:      1,
        dashArray:   "6 4",
        interactive: false,
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
          iconSize:   [0, 0],
          iconAnchor: [0, 0],
        }),
        interactive:  false,
        zIndexOffset: -100,
      }).addTo(hg);
    });
  }, [showHotspots, leafletReady]);

  // Render / update entity markers
  const renderEntities = useCallback(() => {
    const L   = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    const visible = entities.filter((e) => enabledDomains.has(e.domain));
    const visSet  = new Set(visible.map((e) => e.id));

    for (const [id, marker] of markersRef.current) {
      if (!visSet.has(id)) { marker.remove(); markersRef.current.delete(id); }
    }
    for (const [id, trail] of trailsRef.current) {
      if (!visSet.has(id)) { trail.remove();  trailsRef.current.delete(id);  }
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
            maxWidth:       280,
            className:      "sx-popup",
            closeButton:    true,
            autoPanPadding: [40, 40],
          })
          .on("click", () => onEntitySelect(entity))
          .addTo(map);
        markersRef.current.set(entity.id, marker);
      }

      // Entity historical trail
      if (showTrails && entity.track && entity.track.length >= 1) {
        const pts = [
          ...entity.track.map((p) => [p.lat, p.lon] as [number, number]),
          latlng,
        ];
        const col  = severityToColor(entity.severity);
        const exT  = trailsRef.current.get(entity.id);
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

  useEffect(() => { renderEntities(); }, [renderEntities]);

  // Pan + open popup for selected entity
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedEntityId) return;
    const entity = entities.find((e) => e.id === selectedEntityId);
    if (!entity) return;
    map.panTo([entity.position.lat, entity.position.lon], { animate: true, duration: 0.8 });
    markersRef.current.get(selectedEntityId)?.openPopup();
  }, [selectedEntityId, entities]);

  const tileFilter   = OVERLAY_FILTERS[overlayMode];
  const vignetteClr  = OVERLAY_VIGNETTE[overlayMode];

  return (
    <div className="relative flex-1 min-h-0 w-full h-full overflow-hidden">
      {/* Leaflet mount point — filter applied to tile layer itself */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{
          background: "#020617",
          filter: tileFilter,
          transition: "filter 0.4s ease",
        }}
      />

      {/* Overlay mode vignette */}
      {overlayMode !== "normal" && (
        <div
          className="absolute inset-0 pointer-events-none z-[399]"
          style={{
            background: `radial-gradient(ellipse at center, transparent 55%, ${vignetteClr} 100%)`,
            transition: "background 0.4s ease",
          }}
        />
      )}

      {/* Scanline texture */}
      <div
        className="absolute inset-0 pointer-events-none z-[400]"
        style={{
          background: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.065) 2px,rgba(0,0,0,0.065) 4px)",
        }}
      />

      {/* Corner brackets */}
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
        </div>
        {cursorPos && (
          <div className="font-mono" style={{ fontSize: 9, color: "rgba(0,212,255,0.7)" }}>
            {Math.abs(cursorPos.lat).toFixed(4)}°{cursorPos.lat >= 0 ? "N" : "S"}&nbsp;
            {Math.abs(cursorPos.lon).toFixed(4)}°{cursorPos.lon >= 0 ? "E" : "W"}
          </div>
        )}
        {overlayMode !== "normal" && (
          <div
            className="font-mono font-bold"
            style={{ fontSize: 9, color: overlayMode === "flir" ? "#f97316" : "#10b981", letterSpacing: "0.12em" }}
          >
            ● {overlayLabel[overlayMode]}
          </div>
        )}
      </div>

      {/* TR — Classification */}
      <div className="absolute top-3 right-4 z-[402] pointer-events-none select-none text-right space-y-0.5">
        <div className="font-mono" style={{ fontSize: 9, color: "rgba(239,68,68,0.75)" }}>
          ⚠ TS // SENTINEL // NOFORN
        </div>
        <div className="font-mono" style={{ fontSize: 9, color: "rgba(0,212,255,0.4)" }}>
          DOMAIN COVERAGE: GLOBAL // 9 DOMAINS
        </div>
        <div className="font-mono" style={{ fontSize: 9, color: "rgba(0,212,255,0.4)" }}>
          STREAM: LIVE // Δt: 3s
        </div>
      </div>

      {/* BL — Map mode toggle */}
      <div className="absolute z-[402] flex flex-col gap-1" style={{ bottom: 44, left: 12 }}>
        {(["dark", "satellite"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setMapMode(mode)}
            style={{
              background:     mapMode === mode ? "rgba(0,212,255,0.18)" : "rgba(13,20,36,0.88)",
              color:          mapMode === mode ? "#00d4ff" : "#475569",
              border:         mapMode === mode ? "1px solid rgba(0,212,255,0.4)" : "1px solid rgba(30,58,95,0.7)",
              backdropFilter: "blur(6px)",
              fontFamily:     "'Share Tech Mono',monospace",
              fontSize:       9,
              letterSpacing:  "0.1em",
              padding:        "3px 8px",
              borderRadius:   2,
              cursor:         "pointer",
              textTransform:  "uppercase",
              transition:     "all 0.15s",
            }}
          >
            {mode === "dark" ? "TACTICAL" : "SAT VIEW"}
          </button>
        ))}
      </div>

      {/* BR — Mini radar sweep */}
      <MiniRadar entityCount={entityCount} />

      {/* Loading overlay */}
      {!leafletReady && (
        <div className="absolute inset-0 z-[410] flex items-center justify-center"
          style={{ background: "#020617" }}>
          <div className="text-center space-y-4">
            <div className="font-mono text-sx-cyan text-sm tracking-[0.3em]">
              INITIALIZING TACTICAL DISPLAY
            </div>
            <div className="font-mono text-sx-text-muted text-xs tracking-widest">
              LOADING GEOSPATIAL ENGINE…
            </div>
            <div className="flex justify-center gap-1">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="w-1 rounded-full bg-sx-cyan/40" style={{
                  height: `${12 + (i % 3) * 6}px`,
                  animation: `pulse ${0.6 + i * 0.1}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.08}s`,
                }} />
              ))}
            </div>
            <div className="font-mono text-[9px] text-sx-text-muted tracking-widest">
              CONNECTING TO SENTINEL STREAM…
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


