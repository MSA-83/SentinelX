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

// ─── Mini radar HUD widget ─────────────────────────────────────────────────────

function MiniRadar({ entityCount, aisCount }: { entityCount: number; aisCount: number }) {
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

  const r  = 38;
  const cx = 50;
  const cy = 50;

  return (
    <div className="absolute z-[402] pointer-events-none select-none" style={{ bottom: 36, right: 64 }}>
      <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        {[r * 0.35, r * 0.65, r].map((rr, i) => (
          <circle key={i} cx={cx} cy={cy} r={rr} fill="none" stroke="rgba(0,212,255,0.18)" strokeWidth="0.75" />
        ))}
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="rgba(0,212,255,0.12)" strokeWidth="0.5"/>
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="rgba(0,212,255,0.12)" strokeWidth="0.5"/>
        <defs>
          <radialGradient id="sweepGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <path
          d={`M ${cx} ${cy} L ${(cx + r * Math.cos(((angle - 90) * Math.PI) / 180)).toFixed(2)} ${(cy + r * Math.sin(((angle - 90) * Math.PI) / 180)).toFixed(2)} A ${r} ${r} 0 0 1 ${(cx + r * Math.cos(((angle - 90 - 55) * Math.PI) / 180)).toFixed(2)} ${(cy + r * Math.sin(((angle - 90 - 55) * Math.PI) / 180)).toFixed(2)} Z`}
          fill="url(#sweepGrad)" opacity="0.6"
        />
        <line
          x1={cx} y1={cy}
          x2={(cx + r * Math.cos(((angle - 90) * Math.PI) / 180)).toFixed(2)}
          y2={(cy + r * Math.sin(((angle - 90) * Math.PI) / 180)).toFixed(2)}
          stroke="#00d4ff" strokeWidth="1" opacity="0.8"
        />
        <text x={cx} y={cy + 2} textAnchor="middle" fill="#00d4ff" fontSize="9" fontFamily="'Share Tech Mono',monospace" fontWeight="bold">
          {entityCount}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="rgba(0,212,255,0.5)" fontSize="6" fontFamily="'Share Tech Mono',monospace" letterSpacing="1">
          TRK
        </text>
        {aisCount > 0 && (
          <text x={cx} y={cy + 22} textAnchor="middle" fill="rgba(34,211,238,0.7)" fontSize="5.5" fontFamily="'Share Tech Mono',monospace">
            AIS:{aisCount}
          </text>
        )}
        <text x={cx} y={cy - r - 4} textAnchor="middle" fill="rgba(0,212,255,0.4)" fontSize="6" fontFamily="'Share Tech Mono',monospace" letterSpacing="1">
          RADAR
        </text>
      </svg>
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
  const [geofenceCount,  setGeofenceCount]  = useState(0);
  const [breachCount,    setBreachCount]    = useState(0);
  const radarTileRef     = useRef<TileLayer | null>(null);

  const overlayLabel: Record<MapOverlayMode, string> = {
    normal: "",
    flir: "FLIR // THERMAL",
    nightvision: "NV // GEN-III",
  };

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
      mapRef.current          = null;
      tileRef.current         = null;
      clusterRef.current      = null;
      aisLayerRef.current     = null;
      geofenceLayerRef.current= null;
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

  // Render AIS vessel markers
  const renderAISVessels = useCallback(() => {
    const L        = LRef.current;
    const map      = mapRef.current;
    const aisLayer = aisLayerRef.current;
    if (!L || !map || !aisLayer) return;

    if (!showAISLayer) {
      // Clear all AIS markers
      for (const marker of aisMarkersRef.current.values()) marker.remove();
      aisMarkersRef.current.clear();
      setAisVesselCount(0);
      return;
    }

    const visSet = new Set(aisEntities.map((e) => e.id));

    // Remove stale AIS markers
    for (const [id, marker] of aisMarkersRef.current) {
      if (!visSet.has(id)) { marker.remove(); aisMarkersRef.current.delete(id); }
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
          DOMAIN COVERAGE: GLOBAL // 9 DOMAINS
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

      {/* BR — Mini radar */}
      <MiniRadar entityCount={entityCount} aisCount={aisVesselCount} />

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
