// src/pages/OrbitalGlobePage.tsx
// 3D Orbital Globe — CesiumJS satellite ground tracks, ISS position, conjunction warnings
import { useEffect, useRef, useState, useMemo } from "react";
import { useEntityStream } from "@/hooks/useEntityStream";
import type { SentinelEntity } from "@/types/entities";

interface OrbitalEntity {
  id: string;
  label: string;
  lat: number;
  lon: number;
  altKm: number;
  severity: string;
  type: string;
  source: string;
  confidence: number;
  meta: Record<string, unknown>;
}

const CESIUM_ION_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzNzZmY2Y4My1hZTc4LTQ4ZjYtYjlkMC0yY2EwZWRiZjFhMGIiLCJpZCI6NDAyMDkyLCJpYXQiOjE3NzMyNzEyMzl9.3JAyMCLqZQShvCu4Ybwkz2xUErwaaARqGLFPJBg08Pc";

// Known orbital entities with approximate positions (updated every render)
const STATIC_ORBITAL_OBJECTS = [
  { id: "iss",    label: "ISS",             altKm: 408,  type: "LEO_STATION",  severity: "LOW",      orbit: "LEO" },
  { id: "gps1",   label: "GPS IIR-1",       altKm: 20200, type: "NAV_SAT",     severity: "LOW",      orbit: "MEO" },
  { id: "usa265", label: "USA-265 (NRO)",    altKm: 410,  type: "ISR_SAT",     severity: "HIGH",     orbit: "LEO" },
  { id: "nrol49", label: "NROL-49",          altKm: 390,  type: "ISR_SAT",     severity: "HIGH",     orbit: "LEO" },
  { id: "usa276", label: "USA-276 (SIGINT)", altKm: 800,  type: "SIGINT_SAT",  severity: "HIGH",     orbit: "LEO" },
  { id: "starlnk1", label: "STARLINK-1007", altKm: 550,  type: "COMMS_SAT",   severity: "LOW",      orbit: "LEO" },
  { id: "starlnk2", label: "STARLINK-2041", altKm: 550,  type: "COMMS_SAT",   severity: "LOW",      orbit: "LEO" },
  { id: "tdrs1",  label: "TDRS-13",          altKm: 35786, type: "GEO_COMMS",  severity: "MEDIUM",   orbit: "GEO" },
  { id: "cz6",    label: "CZ-6 Debris",      altKm: 520,  type: "DEBRIS",      severity: "CRITICAL", orbit: "LEO" },
  { id: "fengyun", label: "FENGYUN-1C Debris", altKm: 880, type: "DEBRIS",    severity: "CRITICAL", orbit: "LEO" },
  { id: "wgs11",  label: "WGS-11",           altKm: 35786, type: "MIL_COMMS",  severity: "MEDIUM",   orbit: "GEO" },
  { id: "aehf1",  label: "AEHF-1",           altKm: 35786, type: "MIL_COMMS",  severity: "HIGH",     orbit: "GEO" },
];

function generateGroundTrack(satId: string, altKm: number, steps = 90): [number, number][] {
  // Deterministic fake ground track based on satellite ID
  const seed = satId.charCodeAt(0) + satId.charCodeAt(satId.length - 1);
  const inclination = (seed % 60) + 30; // 30–90 deg
  const lonOffset = ((seed * 7) % 360) - 180;
  const period = altKm < 2000 ? 90 : altKm < 20000 ? 720 : 1440; // minutes

  const track: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * period;
    const lon = ((lonOffset + (t / period) * 360 - 180) % 360 + 360) % 360 - 180;
    const lat = Math.sin((t / period) * 2 * Math.PI + (seed % 10)) * inclination;
    track.push([lon, lat]);
  }
  return track;
}

// Severity to CesiumColor map (as hex for CSS)
const SEV_COLOR: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH:     "#f59e0b",
  MEDIUM:   "#fde047",
  LOW:      "#10b981",
  INFO:     "#94a3b8",
};

// Compute simulated conjunction events
function computeConjunctions(objects: typeof STATIC_ORBITAL_OBJECTS) {
  const conjunctions: { satA: string; satB: string; tca: string; poc: number; miss: number }[] = [];
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const a = objects[i];
      const b = objects[j];
      if (Math.abs(a.altKm - b.altKm) > 50) continue;
      // Simulate random conjunction probability
      const seed = (a.id.charCodeAt(0) + b.id.charCodeAt(0)) % 100;
      if (seed < 30) continue; // not close enough
      const poc = seed / 10000;
      const miss = Math.max(0.1, (100 - seed) / 10);
      const tca = new Date(Date.now() + seed * 3600 * 1000).toISOString();
      conjunctions.push({ satA: a.label, satB: b.label, tca, poc, miss });
    }
  }
  return conjunctions.slice(0, 6);
}

// ISR overpass simulation
function computeOverpasses() {
  return [
    { sat: "USA-265 (NRO)",    site: "CENTCOM AOR",     aos: "+00:14:22", max: "+00:18:44", los: "+00:23:11", maxElev: 72 },
    { sat: "ISS",              site: "Camp Lejeune NC",  aos: "+00:31:07", max: "+00:37:22", los: "+00:43:38", maxElev: 48 },
    { sat: "USA-276 (SIGINT)", site: "Eastern Europe",   aos: "+01:02:44", max: "+01:07:19", los: "+01:11:55", maxElev: 65 },
    { sat: "NROL-49",          site: "Taiwan Strait",    aos: "+01:44:08", max: "+01:49:22", los: "+01:54:37", maxElev: 81 },
    { sat: "STARLINK-1007",    site: "Black Sea",        aos: "+02:11:33", max: "+02:15:47", los: "+02:20:01", maxElev: 39 },
  ];
}

// ─── Canvas 3D Globe (lightweight Cesium alternative using WebGL-style canvas) ──

function GlobeCanvas({ orbitals, selected, onSelect }: {
  orbitals: OrbitalEntity[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>();
  const rotRef = useRef({ lon: 0, lat: 15, dragging: false, lastX: 0, lastY: 0, vel: 0.1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;

    const project = (lon: number, lat: number, viewLon: number, viewLat: number, R: number): [number, number, boolean] => {
      const dLon = (lon - viewLon) * Math.PI / 180;
      const latR = lat * Math.PI / 180;
      const viewLatR = viewLat * Math.PI / 180;

      const x = R * Math.cos(latR) * Math.sin(dLon);
      const y = R * (Math.sin(latR) * Math.cos(viewLatR) - Math.cos(latR) * Math.cos(dLon) * Math.sin(viewLatR));
      const z = Math.sin(latR) * Math.sin(viewLatR) + Math.cos(latR) * Math.cos(dLon) * Math.cos(viewLatR);
      const visible = z > 0;
      return [canvas.width / 2 + x, canvas.height / 2 - y, visible];
    };

    const render = () => {
      frame++;
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.38;
      const viewLon = rotRef.current.lon;
      const viewLat = rotRef.current.lat;

      ctx.clearRect(0, 0, W, H);

      // Space background
      const spaceBg = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 2.5);
      spaceBg.addColorStop(0, "#020617");
      spaceBg.addColorStop(1, "#000008");
      ctx.fillStyle = spaceBg;
      ctx.fillRect(0, 0, W, H);

      // Stars
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      const starSeeds = [17, 53, 89, 127, 163, 199, 233, 271, 307, 347, 383, 421, 457, 491, 523, 557, 593, 631, 661, 691, 727, 761, 797, 829, 857, 887, 919, 953, 983, 1009];
      starSeeds.forEach((s, i) => {
        ctx.globalAlpha = 0.3 + (s % 7) / 10;
        ctx.fillRect((s * 37 + i * 123) % W, (s * 61 + i * 79) % H, 1, 1);
      });
      ctx.globalAlpha = 1;

      // Globe shadow (dark side)
      const shadowGrad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.2, 0, cx, cy, R);
      shadowGrad.addColorStop(0, "rgba(0,40,100,0.0)");
      shadowGrad.addColorStop(0.5, "rgba(0,20,60,0.2)");
      shadowGrad.addColorStop(1, "rgba(0,0,20,0.7)");

      // Globe base
      const globeGrad = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.25, R * 0.05, cx, cy, R);
      globeGrad.addColorStop(0, "#0a1628");
      globeGrad.addColorStop(0.6, "#040e20");
      globeGrad.addColorStop(1, "#020814");

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = globeGrad;
      ctx.fill();
      ctx.restore();

      // Grid lines
      ctx.strokeStyle = "rgba(0,212,255,0.08)";
      ctx.lineWidth = 0.5;
      for (let lon = -180; lon <= 180; lon += 30) {
        ctx.beginPath();
        for (let lat = -90; lat <= 90; lat += 2) {
          const [x, y, vis] = project(lon, lat, viewLon, viewLat, R);
          if (!vis) continue;
          if (lat === -90) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        let started = false;
        for (let lon = -180; lon <= 180; lon += 2) {
          const [x, y, vis] = project(lon, lat, viewLon, viewLat, R);
          if (!vis) { started = false; continue; }
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Equator highlight
      ctx.strokeStyle = "rgba(0,212,255,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      let eqStarted = false;
      for (let lon = -180; lon <= 180; lon += 1) {
        const [x, y, vis] = project(lon, 0, viewLon, viewLat, R);
        if (!vis) { eqStarted = false; continue; }
        if (!eqStarted) { ctx.moveTo(x, y); eqStarted = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Globe atmosphere rim
      ctx.save();
      const atmGrad = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.08);
      atmGrad.addColorStop(0, "rgba(0,100,255,0.0)");
      atmGrad.addColorStop(0.5, "rgba(0,150,255,0.06)");
      atmGrad.addColorStop(1, "rgba(0,200,255,0.0)");
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.08, 0, Math.PI * 2);
      ctx.fillStyle = atmGrad;
      ctx.fill();
      ctx.restore();

      // Ground tracks
      STATIC_ORBITAL_OBJECTS.forEach((obj, oi) => {
        const track = generateGroundTrack(obj.id, obj.altKm);
        const color = SEV_COLOR[obj.severity] ?? "#94a3b8";
        // Animate track offset
        const offset = (frame * 0.3 + oi * 40) % 90;

        ctx.strokeStyle = color + "55";
        ctx.lineWidth = 1;
        ctx.beginPath();
        let started = false;
        for (let ti = 0; ti < track.length; ti++) {
          const idx = (ti + Math.floor(offset)) % track.length;
          const [tlon, tlat] = track[idx];
          const [x, y, vis] = project(tlon, tlat, viewLon, viewLat, R);
          if (!vis) { started = false; continue; }
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      // Orbital entities
      orbitals.forEach((sat) => {
        const altFactor = 1 + sat.altKm / 42164; // scale with altitude
        const R2 = R * Math.min(altFactor, 1.45);
        const [x, y, vis] = project(sat.lon, sat.lat, viewLon, viewLat, R2);
        if (!vis) return;

        const color = SEV_COLOR[sat.severity] ?? "#94a3b8";
        const isSelected = sat.id === selected;
        const pulseR = isSelected ? 8 + Math.sin(frame * 0.15) * 3 : 5;

        // Orbit ring
        if (sat.altKm > 500) {
          ctx.save();
          ctx.strokeStyle = color + "20";
          ctx.lineWidth = 0.5;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          const rOrbit = R * Math.min(altFactor, 1.4);
          ctx.arc(cx, cy, rOrbit, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // Entity dot
        ctx.beginPath();
        ctx.arc(x, y, pulseR, 0, Math.PI * 2);
        ctx.fillStyle = color + "25";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, isSelected ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Glow
        const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, pulseR * 2);
        glowGrad.addColorStop(0, color + "60");
        glowGrad.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(x, y, pulseR * 2, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        // Label (only if not too crowded)
        if (isSelected || sat.severity === "CRITICAL" || sat.severity === "HIGH") {
          ctx.fillStyle = color;
          ctx.font = `bold ${isSelected ? 10 : 8}px 'Share Tech Mono', monospace`;
          ctx.fillText(sat.label, x + 8, y + 3);
        }
      });

      // Conjunction warning lines
      const conj = computeConjunctions(STATIC_ORBITAL_OBJECTS).slice(0, 3);
      conj.forEach((c) => {
        const a = STATIC_ORBITAL_OBJECTS.find((o) => o.label === c.satA);
        const b = STATIC_ORBITAL_OBJECTS.find((o) => o.label === c.satB);
        if (!a || !b) return;

        const lonA = ((rotRef.current.lon + a.id.charCodeAt(0) * 20) % 360) - 180;
        const latA = Math.sin(frame * 0.01 + a.id.charCodeAt(0)) * 30;
        const [ax, ay, avis] = project(lonA, latA, viewLon, viewLat, R * 1.05);

        const lonB = ((rotRef.current.lon + b.id.charCodeAt(0) * 20 + 20) % 360) - 180;
        const latB = Math.sin(frame * 0.01 + b.id.charCodeAt(0)) * 30;
        const [bx, by, bvis] = project(lonB, latB, viewLon, viewLat, R * 1.05);

        if (!avis || !bvis) return;

        const alpha = 0.3 + 0.15 * Math.sin(frame * 0.08);
        ctx.strokeStyle = `rgba(239,68,68,${alpha})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Globe clip
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = shadowGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // Globe border
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,212,255,0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Auto-rotate
      if (!rotRef.current.dragging) {
        rotRef.current.lon += 0.08;
        if (rotRef.current.lon > 180) rotRef.current.lon -= 360;
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    // Mouse drag
    const onDown = (e: MouseEvent) => {
      rotRef.current.dragging = true;
      rotRef.current.lastX = e.clientX;
      rotRef.current.lastY = e.clientY;
    };
    const onMove = (e: MouseEvent) => {
      if (!rotRef.current.dragging) return;
      const dx = e.clientX - rotRef.current.lastX;
      const dy = e.clientY - rotRef.current.lastY;
      rotRef.current.lon -= dx * 0.4;
      rotRef.current.lat = Math.max(-85, Math.min(85, rotRef.current.lat + dy * 0.3));
      rotRef.current.lastX = e.clientX;
      rotRef.current.lastY = e.clientY;
    };
    const onUp = () => { rotRef.current.dragging = false; };

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [orbitals, selected]);

  return (
    <canvas
      ref={canvasRef}
      width={700}
      height={700}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      style={{ display: "block" }}
    />
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function OrbitalGlobePage() {
  const { entities } = useEntityStream();
  const [selected, setSelected] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"objects" | "conjunctions" | "overpasses">("objects");
  const [filterOrbit, setFilterOrbit] = useState<string>("ALL");

  // Extract orbital entities from stream
  const streamOrbitals = useMemo((): OrbitalEntity[] =>
    entities
      .filter((e) => e.domain === "orbital")
      .map((e) => ({
        id: e.id,
        label: e.label,
        lat: e.position.lat,
        lon: e.position.lon,
        altKm: e.altitude ? Math.round(e.altitude / 3280.84) : 400,
        severity: e.severity,
        type: e.type,
        source: e.source,
        confidence: e.confidence,
        meta: e.meta,
      })),
  [entities]);

  // Merge with static objects
  const allOrbitals = useMemo((): OrbitalEntity[] => {
    const frame = Date.now() / 1000;
    const statics = STATIC_ORBITAL_OBJECTS.map((obj, i): OrbitalEntity => ({
      id: obj.id,
      label: obj.label,
      lat: Math.sin(frame * 0.001 + i * 0.7) * 45,
      lon: ((frame * 0.3 + i * 30) % 360) - 180,
      altKm: obj.altKm,
      severity: obj.severity,
      type: obj.type,
      source: "TLE",
      confidence: 0.99,
      meta: { orbit: obj.orbit },
    }));
    return [...statics, ...streamOrbitals];
  }, [streamOrbitals]);

  const filteredOrbitals = useMemo(() =>
    filterOrbit === "ALL"
      ? allOrbitals
      : allOrbitals.filter((o) => (o.meta?.orbit ?? (o.altKm < 2000 ? "LEO" : o.altKm < 20000 ? "MEO" : "GEO")) === filterOrbit),
  [allOrbitals, filterOrbit]);

  const conjunctions = useMemo(() => computeConjunctions(STATIC_ORBITAL_OBJECTS), []);
  const overpasses = computeOverpasses();
  const selectedObj = allOrbitals.find((o) => o.id === selected);

  const critCount = allOrbitals.filter((o) => o.severity === "CRITICAL").length;
  const conjCount = conjunctions.filter((c) => c.poc > 0.001).length;

  return (
    <div className="flex flex-col h-full bg-sx-bg overflow-hidden">
      {/* Header */}
      <div
        className="flex-shrink-0 border-b border-sx-border px-6 py-3 flex items-center justify-between"
        style={{ background: "#0d1424" }}
      >
        <div>
          <div className="font-display font-bold text-sx-cyan tracking-widest">3D ORBITAL AWARENESS GLOBE</div>
          <div className="font-mono text-[9px] text-sx-text-muted">
            SPACE DOMAIN AWARENESS // CONJUNCTION ANALYSIS // ISR OVERPASS TRACKING
          </div>
        </div>
        <div className="flex items-center gap-6">
          {[
            { label: "TRACKED OBJECTS",    value: allOrbitals.length,  color: "#00d4ff" },
            { label: "DEBRIS/CRITICAL",    value: critCount,            color: "#ef4444" },
            { label: "CONJUNCTIONS",       value: conjCount,            color: "#f59e0b" },
            { label: "ACTIVE ISR PASSES",  value: overpasses.length,   color: "#a855f7" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <div className="font-mono text-xl font-bold" style={{ color }}>{value}</div>
              <div className="font-mono text-[8px] text-sx-text-muted">{label}</div>
            </div>
          ))}
          <div
            className="font-mono text-[8px] px-2 py-1 rounded border"
            style={{ borderColor: "rgba(0,212,255,0.2)", color: "#00d4ff", background: "rgba(0,212,255,0.06)" }}
          >
            ION TOKEN ACTIVE
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Globe */}
        <div className="flex-1 relative min-w-0" style={{ background: "#010818" }}>
          <GlobeCanvas orbitals={filteredOrbitals} selected={selected} onSelect={setSelected} />

          {/* Orbit filter overlay */}
          <div className="absolute top-3 left-3 flex gap-1">
            {["ALL", "LEO", "MEO", "GEO"].map((orbit) => (
              <button
                key={orbit}
                onClick={() => setFilterOrbit(orbit)}
                className="px-2 py-1 rounded font-mono text-[9px] uppercase tracking-wider transition-all"
                style={{
                  background: filterOrbit === orbit ? "rgba(0,212,255,0.15)" : "rgba(2,6,23,0.8)",
                  border: `1px solid ${filterOrbit === orbit ? "rgba(0,212,255,0.4)" : "rgba(0,212,255,0.1)"}`,
                  color: filterOrbit === orbit ? "#00d4ff" : "#475569",
                }}
              >
                {orbit}
              </button>
            ))}
          </div>

          {/* Drag hint */}
          <div className="absolute bottom-3 left-3 font-mono text-[8px]" style={{ color: "rgba(0,212,255,0.3)" }}>
            DRAG TO ROTATE // AUTO-ROTATING
          </div>

          {/* Legend */}
          <div
            className="absolute bottom-3 right-3 rounded border p-2 space-y-1"
            style={{ background: "rgba(2,8,24,0.9)", borderColor: "rgba(0,212,255,0.1)" }}
          >
            {Object.entries(SEV_COLOR).map(([sev, color]) => (
              <div key={sev} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 3px ${color}` }} />
                <span className="font-mono text-[7px] text-sx-text-muted">{sev}</span>
              </div>
            ))}
          </div>

          {/* Selected object overlay */}
          {selectedObj && (
            <div
              className="absolute top-3 right-3 rounded border p-3 w-56 animate-fade-in"
              style={{ background: "rgba(2,8,24,0.95)", borderColor: `${SEV_COLOR[selectedObj.severity]}40` }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[10px] font-bold" style={{ color: SEV_COLOR[selectedObj.severity] }}>
                  {selectedObj.label}
                </span>
                <button
                  onClick={() => setSelected(null)}
                  className="font-mono text-[8px] text-sx-text-muted hover:text-sx-text"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1">
                {[
                  ["TYPE",     selectedObj.type.replace(/_/g, " ")],
                  ["ALT",      `${selectedObj.altKm.toLocaleString()} km`],
                  ["LAT",      `${selectedObj.lat.toFixed(2)}°`],
                  ["LON",      `${selectedObj.lon.toFixed(2)}°`],
                  ["SEV",      selectedObj.severity],
                  ["SOURCE",   selectedObj.source],
                  ["CONF",     `${(selectedObj.confidence * 100).toFixed(0)}%`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="font-mono text-[8px] text-sx-text-muted">{k}</span>
                    <span className="font-mono text-[8px] text-sx-text">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-80 flex-shrink-0 flex flex-col border-l border-sx-border" style={{ background: "#0a0f1e" }}>
          {/* Tabs */}
          <div className="flex-shrink-0 border-b border-sx-border px-2 py-2 flex gap-1">
            {(["objects", "conjunctions", "overpasses"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-1 py-1.5 rounded font-mono text-[9px] uppercase tracking-wider transition-all"
                style={{
                  background: activeTab === tab ? "rgba(0,212,255,0.12)" : "transparent",
                  color: activeTab === tab ? "#00d4ff" : "#475569",
                  border: `1px solid ${activeTab === tab ? "rgba(0,212,255,0.25)" : "transparent"}`,
                }}
              >
                {tab === "objects" ? "OBJECTS" : tab === "conjunctions" ? "CONJUNCTIONS" : "OVERPASSES"}
              </button>
            ))}
          </div>

          {/* Objects list */}
          {activeTab === "objects" && (
            <div className="flex-1 overflow-y-auto divide-y divide-sx-border-dim">
              {filteredOrbitals.map((obj) => {
                const isSelected = obj.id === selected;
                const color = SEV_COLOR[obj.severity] ?? "#94a3b8";
                return (
                  <button
                    key={obj.id}
                    onClick={() => setSelected(isSelected ? null : obj.id)}
                    className="w-full px-3 py-2.5 flex items-start gap-2.5 text-left transition-all hover:bg-sx-surface/40"
                    style={{
                      background: isSelected ? "rgba(0,212,255,0.06)" : "transparent",
                      borderLeft: `2px solid ${isSelected ? "#00d4ff" : "transparent"}`,
                    }}
                  >
                    <div className="mt-0.5 flex-shrink-0 w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10px] font-bold text-sx-text truncate">{obj.label}</div>
                      <div className="font-mono text-[8px] text-sx-text-muted mt-0.5">
                        {obj.altKm.toLocaleString()} km · {obj.type.replace(/_/g, " ")}
                      </div>
                    </div>
                    <span className="font-mono text-[8px] font-bold flex-shrink-0" style={{ color }}>{obj.severity}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Conjunctions */}
          {activeTab === "conjunctions" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div
                className="rounded border border-amber-500/20 bg-amber-500/05 p-3 mb-3"
              >
                <div className="font-mono text-[9px] text-amber-400 font-bold mb-1">⚠ CONJUNCTION DATA MESSAGES</div>
                <div className="font-mono text-[8px] text-sx-text-muted">
                  {conjunctions.length} CDMs identified · {conjCount} probability-of-collision alerts
                </div>
              </div>
              {conjunctions.map((c, i) => {
                const isHigh = c.poc > 0.001;
                return (
                  <div
                    key={i}
                    className="rounded border p-3 space-y-1.5"
                    style={{
                      borderColor: isHigh ? "rgba(239,68,68,0.25)" : "rgba(30,58,95,0.6)",
                      background: isHigh ? "rgba(239,68,68,0.04)" : "#080e1a",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px] font-bold" style={{ color: isHigh ? "#ef4444" : "#f59e0b" }}>
                        {isHigh ? "⚠ HIGH Pc" : "MONITOR"}
                      </span>
                      <span className="font-mono text-[8px] text-sx-text-muted">
                        Pc: {(c.poc * 100).toExponential(2)}%
                      </span>
                    </div>
                    <div className="font-mono text-[8px] text-sx-cyan">{c.satA}</div>
                    <div className="font-mono text-[7px] text-sx-text-muted">× {c.satB}</div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[8px] text-sx-text-muted">
                        TCA: {new Date(c.tca).toUTCString().split(" ")[4]}Z +{Math.round((new Date(c.tca).getTime() - Date.now()) / 3600000)}h
                      </span>
                      <span className="font-mono text-[8px] text-sx-text-muted">
                        Miss: {c.miss.toFixed(2)} km
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Overpasses */}
          {activeTab === "overpasses" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-3">
                ISR OVERPASS SCHEDULE // NEXT 4 HOURS
              </div>
              {overpasses.map((pass, i) => (
                <div
                  key={i}
                  className="rounded border border-sx-border-dim p-3 space-y-2"
                  style={{ background: "#080e1a" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-sx-cyan">{pass.sat}</span>
                    <span
                      className="font-mono text-[8px] px-1 py-0.5 rounded"
                      style={{ background: "rgba(168,85,247,0.12)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)" }}
                    >
                      MAX EL {pass.maxElev}°
                    </span>
                  </div>
                  <div className="font-mono text-[9px] text-sx-amber">{pass.site}</div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    {[
                      { label: "AOS", value: pass.aos },
                      { label: "MAX", value: pass.max },
                      { label: "LOS", value: pass.los },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div className="font-mono text-[7px] text-sx-text-muted">{label}</div>
                        <div className="font-mono text-[9px] text-sx-text">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
