// src/pages/TimelineReplayPage.tsx
// 4D Timeline Replay — scrubbing ruler, speed controls, animated mini-map with entity trails

import { useState, useEffect, useRef, useCallback } from "react";
import { useEntityStream } from "@/hooks/useEntityStream";
import { DOMAIN_CONFIGS } from "@/constants/domains";
import { severityToColor } from "@/lib/threatAssessor";
import type { SentinelEntity, GeoPoint } from "@/types/entities";

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;

// ─── Mini-map canvas renderer ─────────────────────────────────────────────────

interface MiniMapProps {
  entities: SentinelEntity[];
  visibleEntityIds: Set<string>;
  currentIndex: number;
}

function MiniMap({ entities, visibleEntityIds }: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Store entity trail positions
  const trailsRef = useRef<Map<string, GeoPoint[]>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.offsetWidth || 400;
    const H = canvas.offsetHeight || 280;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(0,212,255,0.04)";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Simplified world outline (just coastline hint via bounding boxes)
    const continents = [
      // North America
      [[0.08, 0.12], [0.28, 0.12], [0.3, 0.28], [0.25, 0.4], [0.18, 0.55], [0.08, 0.55], [0.06, 0.35]],
      // South America
      [[0.22, 0.55], [0.32, 0.55], [0.35, 0.75], [0.27, 0.85], [0.2, 0.75], [0.2, 0.6]],
      // Europe
      [[0.46, 0.12], [0.6, 0.12], [0.62, 0.28], [0.52, 0.32], [0.46, 0.22]],
      // Africa
      [[0.48, 0.32], [0.6, 0.32], [0.62, 0.65], [0.52, 0.75], [0.44, 0.6], [0.44, 0.4]],
      // Asia
      [[0.6, 0.1], [0.9, 0.1], [0.92, 0.48], [0.8, 0.52], [0.7, 0.45], [0.62, 0.3]],
      // Australia
      [[0.75, 0.6], [0.9, 0.6], [0.92, 0.75], [0.8, 0.78], [0.73, 0.7]],
    ];

    ctx.strokeStyle = "rgba(0,212,255,0.12)";
    ctx.fillStyle = "rgba(0,212,255,0.03)";
    ctx.lineWidth = 0.8;
    continents.forEach((points) => {
      ctx.beginPath();
      points.forEach(([fx, fy], i) => {
        if (i === 0) ctx.moveTo(fx * W, fy * H);
        else ctx.lineTo(fx * W, fy * H);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    // Project lat/lon to canvas
    const project = (lat: number, lon: number): [number, number] => {
      const x = ((lon + 180) / 360) * W;
      const y = ((90 - lat) / 180) * H;
      return [x, y];
    };

    // Draw hotspot rings
    const hotspots = [
      { lat: 48.5, lon: 37.5 }, { lat: 24.5, lon: 120.0 },
      { lat: 12.5, lon: 43.5 }, { lat: 26.0, lon: 52.0 },
    ];
    hotspots.forEach(({ lat, lon }) => {
      const [x, y] = project(lat, lon);
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(239,68,68,0.2)";
      ctx.lineWidth = 0.75;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw entity trails
    for (const [id, trail] of trailsRef.current) {
      if (trail.length < 2) continue;
      const entity = entities.find((e) => e.id === id);
      if (!entity) continue;
      const color = severityToColor(entity.severity);

      ctx.beginPath();
      trail.forEach((pt, i) => {
        const [x, y] = project(pt.lat, pt.lon);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color + "40";
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw entities
    let drawn = 0;
    for (const entity of entities) {
      if (!visibleEntityIds.has(entity.id)) continue;
      const [x, y] = project(entity.position.lat, entity.position.lon);
      const color = severityToColor(entity.severity);
      const r = entity.severity === "CRITICAL" ? 4 : entity.severity === "HIGH" ? 3 : 2;

      // Glow for critical
      if (entity.severity === "CRITICAL" || entity.anomalyFlag) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = color + "20";
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Heading vector for aviation/maritime
      if (entity.heading !== undefined && (entity.domain === "aviation" || entity.domain === "maritime")) {
        const headingRad = ((entity.heading - 90) * Math.PI) / 180;
        const vLen = 10;
        const vx = x + Math.cos(headingRad) * vLen;
        const vy = y + Math.sin(headingRad) * vLen;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(vx, vy);
        ctx.strokeStyle = color + "70";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      drawn++;
    }

    // Update trails for moving entities
    for (const entity of entities) {
      if (!visibleEntityIds.has(entity.id)) continue;
      if (entity.domain !== "aviation" && entity.domain !== "maritime") continue;
      const existing = trailsRef.current.get(entity.id) ?? [];
      const updated = [...existing, entity.position].slice(-12);
      trailsRef.current.set(entity.id, updated);
    }

    // Legend
    const legendItems = [
      { color: "#ef4444", label: "CRITICAL" },
      { color: "#f59e0b", label: "HIGH" },
      { color: "#00d4ff", label: "NORMAL" },
    ];
    legendItems.forEach(({ color, label }, i) => {
      ctx.beginPath();
      ctx.arc(8, H - 48 + i * 14, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = "rgba(148,163,184,0.6)";
      ctx.font = `8px 'Share Tech Mono', monospace`;
      ctx.textBaseline = "middle";
      ctx.fillText(label, 16, H - 48 + i * 14);
    });

    // Entity count
    ctx.fillStyle = "rgba(0,212,255,0.5)";
    ctx.font = `9px 'Share Tech Mono', monospace`;
    ctx.textBaseline = "bottom";
    ctx.fillText(`${drawn} ENTITIES`, W - 80, H - 4);

  }, [entities, visibleEntityIds]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function TimelineReplayPage() {
  const { events, entities } = useEntityStream();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [position, setPosition] = useState(0); // 0-100 percent
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(
    new Set(["aviation", "maritime", "conflict", "cyber", "nuclear", "sigint"])
  );
  const tickRef = useRef<ReturnType<typeof setInterval>>();

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );
  const totalDuration =
    sortedEvents.length > 1
      ? new Date(sortedEvents[sortedEvents.length - 1].ts).getTime() -
        new Date(sortedEvents[0].ts).getTime()
      : 0;

  const visibleEvents = sortedEvents.slice(
    0,
    Math.max(1, Math.floor((currentIndex / 100) * sortedEvents.length + 1))
  );

  // Entities visible at current scrubber position
  const visibleEntityIds = new Set<string>(
    entities
      .filter((e) => selectedDomains.has(e.domain))
      .slice(0, Math.floor((position / 100) * entities.length + entities.length * 0.3))
      .map((e) => e.id)
  );

  const tick = useCallback(() => {
    setPosition((prev) => {
      const next = Math.min(100, prev + 0.4 * speed);
      if (next >= 100) setPlaying(false);
      return next;
    });
    setCurrentIndex((prev) => Math.min(prev + 1, Math.max(0, sortedEvents.length - 1)));
  }, [speed, sortedEvents.length]);

  useEffect(() => {
    if (playing) {
      tickRef.current = setInterval(tick, 200);
    } else {
      clearInterval(tickRef.current);
    }
    return () => clearInterval(tickRef.current);
  }, [playing, tick]);

  const handleSeek = (pct: number) => {
    setPosition(pct);
    setCurrentIndex(Math.floor((pct / 100) * Math.max(0, sortedEvents.length - 1)));
  };

  const handleReset = () => {
    setPlaying(false);
    setPosition(0);
    setCurrentIndex(0);
  };

  const currentTs = sortedEvents[currentIndex]?.ts
    ? new Date(sortedEvents[currentIndex].ts).toUTCString()
    : "—";

  const currentEvents = [...visibleEvents].reverse().slice(0, 8);

  // Aggregate stats at current position
  const critCount = visibleEvents.filter((e) => e.severity === "CRITICAL").length;
  const highCount = visibleEvents.filter((e) => e.severity === "HIGH").length;

  return (
    <div className="flex flex-col h-full bg-sx-bg overflow-hidden">
      {/* Header */}
      <div
        className="flex-shrink-0 border-b border-sx-border px-6 py-3"
        style={{ background: "#0d1424" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display font-bold text-sx-cyan tracking-widest">
              4D TIMELINE REPLAY
            </div>
            <div className="font-mono text-[9px] text-sx-text-muted">
              HISTORICAL EVENT CORRELATION // MULTI-DOMAIN // ANIMATED TRACK PLAYBACK
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="font-mono font-bold text-sx-red">{critCount}</div>
              <div className="font-mono text-[8px] text-sx-text-muted">CRITICAL</div>
            </div>
            <div className="text-center">
              <div className="font-mono font-bold text-sx-amber">{highCount}</div>
              <div className="font-mono text-[8px] text-sx-text-muted">HIGH</div>
            </div>
            <div className="text-center">
              <div className="font-mono font-bold text-sx-cyan">{visibleEvents.length}</div>
              <div className="font-mono text-[8px] text-sx-text-muted">EVENTS</div>
            </div>
          </div>
        </div>
      </div>

      {/* Playback controls */}
      <div
        className="flex-shrink-0 border-b border-sx-border px-6 py-3"
        style={{ background: "#0a0f1e" }}
      >
        <div className="flex items-center gap-3 mb-3">
          {/* Play/Pause */}
          <button
            onClick={() => setPlaying((v) => !v)}
            className="w-9 h-9 rounded flex items-center justify-center font-bold text-lg transition-all"
            style={{
              background: playing ? "rgba(0,212,255,0.15)" : "rgba(0,212,255,0.08)",
              border: "1px solid rgba(0,212,255,0.3)",
              color: "#00d4ff",
            }}
          >
            {playing ? "⏸" : "⏵"}
          </button>

          {/* Stop */}
          <button
            onClick={handleReset}
            className="w-9 h-9 rounded flex items-center justify-center text-lg transition-all"
            style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#475569" }}
          >
            ⏹
          </button>

          {/* Speed selector */}
          <div
            className="flex items-center gap-0.5 rounded p-0.5"
            style={{ background: "#080e1a", border: "1px solid #0f2040" }}
          >
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className="px-2 py-1 rounded font-mono text-[9px] transition-all"
                style={{
                  background: speed === s ? "rgba(0,212,255,0.15)" : "transparent",
                  color: speed === s ? "#00d4ff" : "#475569",
                  border: speed === s ? "1px solid rgba(0,212,255,0.3)" : "1px solid transparent",
                }}
              >
                {s}×
              </button>
            ))}
          </div>

          {/* Timestamp */}
          <div
            className="font-mono text-[10px] px-3 py-1.5 rounded"
            style={{ background: "#080e1a", border: "1px solid #0f2040", color: "#00d4ff" }}
          >
            T // {currentTs}
          </div>

          {/* Position % */}
          <div className="ml-auto font-mono text-[10px] text-sx-text-muted">
            {position.toFixed(0)}% · {visibleEvents.length}/{sortedEvents.length} EVENTS
          </div>
        </div>

        {/* Scrubber */}
        <div className="relative">
          <div
            className="relative h-4 rounded-full cursor-pointer group"
            style={{ background: "#0f2040" }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = ((e.clientX - rect.left) / rect.width) * 100;
              handleSeek(Math.max(0, Math.min(100, pct)));
            }}
          >
            <div
              className="absolute left-0 top-0 h-full rounded-full"
              style={{
                width: `${position}%`,
                background: "linear-gradient(90deg, #10b981 0%, #00d4ff 60%, #a855f7 100%)",
                boxShadow: "0 0 6px rgba(0,212,255,0.3)",
                transition: playing ? "none" : "width 0.1s",
              }}
            />
            {/* Event tick marks */}
            {sortedEvents.map((evt, i) => {
              const pct =
                totalDuration > 0
                  ? ((new Date(evt.ts).getTime() -
                      new Date(sortedEvents[0].ts).getTime()) /
                      totalDuration) *
                    100
                  : (i / Math.max(1, sortedEvents.length - 1)) * 100;
              const color = severityToColor(evt.severity);
              return (
                <div
                  key={evt.id}
                  className="absolute top-0 h-full w-0.5"
                  title={`${evt.severity}: ${evt.title}`}
                  style={{
                    left: `${pct}%`,
                    background: color,
                    opacity: i <= currentIndex ? 0.9 : 0.15,
                    cursor: "pointer",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSeek(pct);
                  }}
                />
              );
            })}
            {/* Playhead */}
            <div
              className="absolute top-1/2 w-5 h-5 rounded-full -translate-y-1/2 -translate-x-1/2 border-2 border-sx-cyan z-10"
              style={{
                left: `${position}%`,
                background: "#0d1424",
                boxShadow: "0 0 10px rgba(0,212,255,0.7)",
                transition: playing ? "none" : "left 0.1s",
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-mono text-[8px] text-sx-text-muted">
              {sortedEvents[0]?.ts
                ? new Date(sortedEvents[0].ts).toUTCString().split(" ")[4] + "Z"
                : "—"}
            </span>
            <span className="font-mono text-[8px] text-sx-text-muted">
              {sortedEvents[sortedEvents.length - 1]?.ts
                ? new Date(sortedEvents[sortedEvents.length - 1].ts)
                    .toUTCString()
                    .split(" ")[4] + "Z"
                : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Main content — Map + Event feed */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Animated mini-map */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-sx-border">
          {/* Map header */}
          <div
            className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-sx-border-dim"
            style={{ background: "#080e1a" }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: playing ? "#10b981" : "#f59e0b",
                  boxShadow: playing ? "0 0 4px #10b981" : "none",
                }}
              />
              <span className="font-mono text-[9px] text-sx-text-muted tracking-widest">
                {playing ? "ANIMATING ENTITY POSITIONS..." : "POSITION SNAPSHOT"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {["aviation", "maritime", "conflict", "cyber", "nuclear", "sigint"].map((d) => {
                const cfg = DOMAIN_CONFIGS[d as keyof typeof DOMAIN_CONFIGS];
                const enabled = selectedDomains.has(d);
                return (
                  <button
                    key={d}
                    onClick={() => {
                      setSelectedDomains((prev) => {
                        const next = new Set(prev);
                        if (next.has(d)) next.delete(d);
                        else next.add(d);
                        return next;
                      });
                    }}
                    className="px-1.5 py-0.5 rounded font-mono text-[8px] transition-all"
                    style={{
                      background: enabled ? `${cfg?.color}15` : "transparent",
                      color: enabled ? cfg?.color : "#334155",
                      border: `1px solid ${enabled ? cfg?.color + "30" : "#0f2040"}`,
                    }}
                    title={cfg?.label}
                  >
                    {cfg?.icon}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Canvas mini-map */}
          <div className="flex-1 relative min-h-0" style={{ background: "#020617" }}>
            <MiniMap
              entities={entities}
              visibleEntityIds={visibleEntityIds}
              currentIndex={currentIndex}
            />

            {/* Corner brackets */}
            {(["top-0 left-0 border-t border-l", "top-0 right-0 border-t border-r", "bottom-0 left-0 border-b border-l", "bottom-0 right-0 border-b border-r"] as const).map((cls, i) => (
              <div key={i} className={`absolute w-4 h-4 ${cls} pointer-events-none`} style={{ borderColor: "rgba(0,212,255,0.2)" }} />
            ))}

            {/* Overlay labels */}
            <div className="absolute top-2 left-3 pointer-events-none">
              <div className="font-mono text-[8px]" style={{ color: "rgba(0,212,255,0.45)" }}>
                SENTINEL-X // 4D REPLAY // WGS-84
              </div>
            </div>

            {/* Playhead time watermark */}
            {playing && (
              <div
                className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded pointer-events-none"
                style={{
                  background: "rgba(0,212,255,0.08)",
                  border: "1px solid rgba(0,212,255,0.2)",
                }}
              >
                <span className="font-mono text-[9px]" style={{ color: "rgba(0,212,255,0.7)" }}>
                  ANIMATING · {visibleEntityIds.size} ENTITIES
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Event stream + correlation */}
        <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden" style={{ background: "#0d1424" }}>
          <div className="flex-shrink-0 px-4 py-2 border-b border-sx-border-dim" style={{ background: "#0a0f1e" }}>
            <span className="font-mono text-[9px] text-sx-text-muted tracking-widest">
              EVENT STREAM — T/{position.toFixed(0)}%
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-sx-border-dim">
            {currentEvents.length === 0 ? (
              <div className="p-8 text-center font-mono text-[10px] text-sx-text-muted">
                SCRUB TIMELINE TO REPLAY EVENTS
              </div>
            ) : (
              currentEvents.map((evt, i) => {
                const cfg = DOMAIN_CONFIGS[evt.domain];
                const color = severityToColor(evt.severity);
                const isLatest = i === 0;
                const ts = new Date(evt.ts).toUTCString().split(" ")[4] + "Z";
                return (
                  <div
                    key={evt.id}
                    className="px-3 py-2.5 flex items-start gap-2 transition-all"
                    style={{
                      borderLeft: `2px solid ${color}`,
                      background: isLatest ? `${color}06` : "transparent",
                    }}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="font-mono text-[8px] text-sx-text-muted">{ts}</div>
                      <span className="text-base">{cfg?.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className="font-mono text-[10px] font-bold truncate"
                        style={{ color }}
                      >
                        {evt.title}
                      </div>
                      <div className="font-mono text-[9px] text-sx-text-muted line-clamp-2 mt-0.5">
                        {evt.description}
                      </div>
                    </div>
                    <span
                      className="flex-shrink-0 font-mono text-[8px] px-1 py-0.5 rounded"
                      style={{
                        color,
                        background: `${color}12`,
                        border: `1px solid ${color}25`,
                      }}
                    >
                      {evt.severity}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Correlation panel */}
          <div
            className="flex-shrink-0 border-t border-sx-border-dim p-3"
            style={{ background: "#080e1a" }}
          >
            <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-2">
              CORRELATION AT T/{position.toFixed(0)}%
            </div>
            <div className="space-y-1.5">
              {["aviation", "maritime", "conflict"].map((d) => {
                const cfg = DOMAIN_CONFIGS[d as keyof typeof DOMAIN_CONFIGS];
                const count = visibleEvents.filter((e) => e.domain === d).length;
                const pct = visibleEvents.length > 0
                  ? (count / visibleEvents.length) * 100
                  : 0;
                return (
                  <div key={d} className="flex items-center gap-2">
                    <span className="font-mono text-[9px] w-8 text-right" style={{ color: cfg?.color }}>
                      {cfg?.shortLabel}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: "#0f2040" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: cfg?.color }}
                      />
                    </div>
                    <span className="font-mono text-[8px] text-sx-text-muted w-6 text-right">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
