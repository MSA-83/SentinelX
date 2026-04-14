/**
 * GeoMap — Reusable Leaflet map wrapper for Sentinel-X.
 *
 * Provides a fully configured dark-mode tactical Leaflet map with:
 * - Configurable tile providers (dark / satellite / terrain)
 * - Controlled center / zoom via props
 * - onMapReady callback that exposes the raw Leaflet Map instance
 *   for imperative layer operations from parent components
 * - Scanline HUD overlay + corner brackets
 * - Cursor coordinate readout
 */

import { useEffect, useRef, useState } from "react";

export type TileProvider = "dark" | "satellite" | "terrain";

interface GeoMapProps {
  /** Initial centre [lat, lon] */
  center?: [number, number];
  /** Initial zoom level */
  zoom?: number;
  /** Tile provider key */
  tileProvider?: TileProvider;
  /** Called with the Leaflet Map instance once the map is ready */
  onMapReady?: (map: import("leaflet").Map, L: typeof import("leaflet")) => void;
  /** Called when the user moves/zooms the map */
  onViewChange?: (center: [number, number], zoom: number) => void;
  /** Additional class names for the outer wrapper */
  className?: string;
  /** Show corner bracket decorations */
  showBrackets?: boolean;
  /** Show scanline overlay */
  showScanlines?: boolean;
  /** Show cursor coordinate HUD */
  showCursorCoords?: boolean;
  children?: React.ReactNode;
}

const TILE_URLS: Record<TileProvider, string> = {
  dark:      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  terrain:   "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
};

const TILE_ATTRIBUTION: Record<TileProvider, string> = {
  dark:      "&copy; <a href='https://carto.com/'>CARTO</a>",
  satellite: "&copy; Esri &mdash; Source: USGS, NOAA",
  terrain:   "&copy; <a href='https://carto.com/'>CARTO</a> (no labels)",
};

export function GeoMap({
  center = [20, 15],
  zoom = 3,
  tileProvider = "dark",
  onMapReady,
  onViewChange,
  className = "",
  showBrackets = true,
  showScanlines = true,
  showCursorCoords = true,
  children,
}: GeoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<import("leaflet").Map | null>(null);
  const tileRef      = useRef<import("leaflet").TileLayer | null>(null);
  const LRef         = useRef<typeof import("leaflet") | null>(null);

  const [leafletReady, setLeafletReady] = useState(false);
  const [cursorCoords, setCursorCoords] = useState<[number, number] | null>(null);
  const [mapZoom,      setMapZoom]      = useState(zoom);

  // ── Bootstrap Leaflet ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled) return;
      // Suppress default icon resolution (we use custom divIcons everywhere)
      delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
      LRef.current = L;
      setLeafletReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Create Map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    if (!leafletReady || !L || !containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      minZoom:          2,
      maxZoom:          18,
      zoomControl:      false,
      attributionControl: true,
      preferCanvas:     true,
      worldCopyJump:    true,
    });

    // Custom zoom control positioned bottom-right
    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Initial tile layer
    tileRef.current = L.tileLayer(TILE_URLS[tileProvider], {
      attribution: TILE_ATTRIBUTION[tileProvider],
      maxZoom: 18,
      ...(tileProvider !== "satellite" ? { subdomains: "abcd" } : {}),
    }).addTo(map);

    // Event wiring
    map.on("mousemove", (e) => {
      setCursorCoords([e.latlng.lat, e.latlng.lng]);
    });
    map.on("mouseout", () => setCursorCoords(null));
    map.on("zoomend", () => {
      setMapZoom(map.getZoom());
      onViewChange?.([map.getCenter().lat, map.getCenter().lng], map.getZoom());
    });
    map.on("moveend", () => {
      onViewChange?.([map.getCenter().lat, map.getCenter().lng], map.getZoom());
    });

    mapRef.current = map;
    onMapReady?.(map, L);

    return () => {
      map.remove();
      mapRef.current  = null;
      tileRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady]);

  // ── Swap tile provider ─────────────────────────────────────────────────────
  useEffect(() => {
    const L   = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !tileRef.current) return;
    tileRef.current.remove();
    tileRef.current = L.tileLayer(TILE_URLS[tileProvider], {
      attribution: TILE_ATTRIBUTION[tileProvider],
      maxZoom: 18,
      ...(tileProvider !== "satellite" ? { subdomains: "abcd" } : {}),
    }).addTo(map);
  }, [tileProvider]);

  // ── Coordinate formatter ───────────────────────────────────────────────────
  const fmtCoord = (lat: number, lon: number) => {
    const la = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"}`;
    const lo = `${Math.abs(lon).toFixed(4)}°${lon >= 0 ? "E" : "W"}`;
    return `${la}  ${lo}`;
  };

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{ background: "#020617" }}
    >
      {/* Leaflet mount */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Scanline texture */}
      {showScanlines && (
        <div
          className="absolute inset-0 pointer-events-none z-[400]"
          style={{
            background:
              "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px)",
          }}
        />
      )}

      {/* Corner HUD brackets */}
      {showBrackets && (
        <>
          <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-sx-cyan/25 pointer-events-none z-[401]" />
          <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-sx-cyan/25 pointer-events-none z-[401]" />
          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-sx-cyan/25 pointer-events-none z-[401]" />
          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-sx-cyan/25 pointer-events-none z-[401]" />
        </>
      )}

      {/* TL HUD readout */}
      <div className="absolute top-3 left-4 z-[402] pointer-events-none select-none space-y-0.5">
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "rgba(0,212,255,0.6)" }}>
          SENTINEL-X // GEOSPATIAL ENGINE
        </div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "rgba(0,212,255,0.35)" }}>
          PROJ: WEB MERCATOR // WGS-84 // ZOOM: {mapZoom}
        </div>
        {showCursorCoords && cursorCoords && (
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "rgba(0,212,255,0.75)" }}>
            {fmtCoord(cursorCoords[0], cursorCoords[1])}
          </div>
        )}
      </div>

      {/* TR classification stamp */}
      <div className="absolute top-3 right-4 z-[402] pointer-events-none select-none text-right">
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "rgba(239,68,68,0.7)" }}>
          TS // SENTINEL // NOFORN
        </div>
      </div>

      {/* Loading state */}
      {!leafletReady && (
        <div
          className="absolute inset-0 z-[410] flex items-center justify-center"
          style={{ background: "#020617" }}
        >
          <div className="text-center space-y-3">
            <div
              style={{
                fontFamily: "'Share Tech Mono',monospace",
                fontSize: 12,
                color: "#00d4ff",
                letterSpacing: "0.3em",
              }}
            >
              INITIALIZING GEOSPATIAL ENGINE
            </div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#475569" }}>
              LOADING LEAFLET…
            </div>
          </div>
        </div>
      )}

      {/* Slot for children (custom overlays, controls, etc.) */}
      {leafletReady && children}
    </div>
  );
}

export default GeoMap;
