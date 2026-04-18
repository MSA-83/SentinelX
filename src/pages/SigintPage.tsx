// src/pages/SigintPage.tsx
// SIGINT Spectrum Visualization — waterfall display, emitter table, RF environment map
import { useState, useEffect, useRef, useMemo } from "react";
import { useEntityStream } from "@/hooks/useEntityStream";
import type { SentinelEntity } from "@/types/entities";
import { DOMAIN_CONFIGS } from "@/constants/domains";
import { severityToColor } from "@/lib/threatAssessor";

interface EmitterRecord {
  id: string;
  label: string;
  frequency: number;
  bandwidth: number;
  power: number;
  modulation: string;
  emitterType: string;
  bearing: number;
  severity: string;
  confidence: number;
  lat: number;
  lon: number;
  ts: string;
}

// Waterfall canvas — frequency vs time heatmap
function WaterfallDisplay({ emitters }: { emitters: EmitterRecord[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rowsRef = useRef<ImageData[]>([]);
  const animRef = useRef<number>();
  const freqRange = { min: 100, max: 18000 }; // MHz

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    const render = () => {
      // Shift existing rows down
      if (rowsRef.current.length >= H) rowsRef.current.shift();

      // Create new top row
      const row = ctx.createImageData(W, 1);
      const freqSpan = freqRange.max - freqRange.min;

      // Base noise floor
      for (let x = 0; x < W; x++) {
        const noise = Math.random() * 12;
        const idx = x * 4;
        row.data[idx] = noise;
        row.data[idx + 1] = noise * 1.2;
        row.data[idx + 2] = noise * 2;
        row.data[idx + 3] = 255;
      }

      // Paint emitter peaks
      for (const em of emitters) {
        const freqNorm = (em.frequency - freqRange.min) / freqSpan;
        const centerX = Math.floor(freqNorm * W);
        const bwPx = Math.max(2, Math.floor((em.bandwidth / freqSpan) * W * 0.5));
        const intensity = Math.max(0, em.power + 100); // dBm to positive

        for (let dx = -bwPx; dx <= bwPx; dx++) {
          const x = centerX + dx;
          if (x < 0 || x >= W) continue;
          const falloff = 1 - Math.abs(dx) / bwPx;
          const strength = intensity * falloff * (em.severity === "CRITICAL" ? 3 : em.severity === "HIGH" ? 2 : 1);
          const idx = x * 4;
          if (em.severity === "CRITICAL") {
            row.data[idx]     = Math.min(255, row.data[idx]     + strength * 3);
            row.data[idx + 1] = Math.min(255, row.data[idx + 1] + strength * 0.3);
            row.data[idx + 2] = Math.min(255, row.data[idx + 2] + strength * 0.2);
          } else if (em.severity === "HIGH") {
            row.data[idx]     = Math.min(255, row.data[idx]     + strength * 2);
            row.data[idx + 1] = Math.min(255, row.data[idx + 1] + strength * 1.5);
            row.data[idx + 2] = Math.min(255, row.data[idx + 2] + strength * 0.2);
          } else {
            row.data[idx]     = Math.min(255, row.data[idx]     + strength * 0.2);
            row.data[idx + 1] = Math.min(255, row.data[idx + 1] + strength * 1.2);
            row.data[idx + 2] = Math.min(255, row.data[idx + 2] + strength * 3);
          }
        }
      }

      rowsRef.current.push(row);

      // Paint all rows
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < rowsRef.current.length; i++) {
        ctx.putImageData(rowsRef.current[i], 0, H - 1 - i);
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [emitters]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={160}
      className="w-full"
      style={{ imageRendering: "pixelated", display: "block" }}
    />
  );
}

// Spectrum line chart — simulated power spectrum
function SpectrumChart({ emitters, freqRange }: { emitters: EmitterRecord[]; freqRange: { min: number; max: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const freqSpan = freqRange.max - freqRange.min;

    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "rgba(30,58,95,0.5)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 10; i++) {
      const y = (i / 10) * H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (let i = 0; i <= 8; i++) {
      const x = (i / 8) * W;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }

    // Noise floor
    const noiseData: number[] = new Array(W).fill(0).map(() => -95 + Math.random() * 5);

    // Add emitter peaks
    for (const em of emitters) {
      const centerX = Math.floor(((em.frequency - freqRange.min) / freqSpan) * W);
      const bwPx = Math.max(3, Math.floor((em.bandwidth / freqSpan) * W));
      const peakPower = em.power + 40;
      for (let dx = -bwPx * 2; dx <= bwPx * 2; dx++) {
        const x = centerX + dx;
        if (x < 0 || x >= W) continue;
        const falloff = Math.exp(-(dx * dx) / (bwPx * bwPx * 0.5));
        noiseData[x] = Math.max(noiseData[x], peakPower * falloff - 20 + Math.random() * 3);
      }
    }

    // Draw spectrum
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const power = noiseData[x]; // -100 to 0 dBm
      const y = H - ((power + 110) / 110) * H;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "rgba(0,212,255,0.9)");
    grad.addColorStop(0.5, "rgba(0,212,255,0.4)");
    grad.addColorStop(1, "rgba(0,212,255,0.05)");

    ctx.strokeStyle = "#00d4ff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Mark emitter peaks
    for (const em of emitters) {
      const x = Math.floor(((em.frequency - freqRange.min) / freqSpan) * W);
      const color = em.severity === "CRITICAL" ? "#ef4444" : em.severity === "HIGH" ? "#f59e0b" : "#00d4ff";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.strokeStyle = `${color}40`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = color;
      ctx.font = "8px 'Share Tech Mono', monospace";
      ctx.fillText(`${em.frequency.toFixed(0)}`, x + 2, 10);
    }
  }, [emitters, freqRange]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={120}
      className="w-full"
      style={{ imageRendering: "auto", display: "block" }}
    />
  );
}

function entityToEmitter(entity: SentinelEntity): EmitterRecord | null {
  if (entity.domain !== "sigint") return null;
  const freqStr = entity.meta.frequency as string ?? "800 MHz";
  const freq = parseFloat(freqStr.replace(/[^0-9.]/g, "")) || 800;
  const bwStr = entity.meta.bandwidth as string ?? "10 MHz";
  const bw = parseFloat(bwStr.replace(/[^0-9.]/g, "")) || 10;
  const bearingStr = entity.meta.bearing as string ?? "0°";
  const bearing = parseInt(bearingStr.replace(/[^0-9]/g, "")) || 0;
  return {
    id: entity.id,
    label: entity.label,
    frequency: freq,
    bandwidth: bw,
    power: (entity.meta.powerDbm as number) ?? -70,
    modulation: (entity.meta.modulation as string) ?? "UNKNOWN",
    emitterType: (entity.meta.emitterType as string) ?? "UNKNOWN",
    bearing,
    severity: entity.severity,
    confidence: entity.confidence,
    lat: entity.position.lat,
    lon: entity.position.lon,
    ts: entity.ts,
  };
}

const MODULATION_COLORS: Record<string, string> = {
  BPSK: "#00d4ff", QPSK: "#a855f7", "QAM-64": "#f59e0b",
  OFDM: "#10b981", FSK: "#ec4899", AM: "#3b82f6", UNKNOWN: "#475569",
};

export function SigintPage() {
  const { entities } = useEntityStream();
  const [freqMin, setFreqMin] = useState(100);
  const [freqMax, setFreqMax] = useState(18000);
  const [filterSev, setFilterSev] = useState<string>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const emitters = useMemo(() => {
    return entities
      .map(entityToEmitter)
      .filter((e): e is EmitterRecord => e !== null)
      .filter((e) => e.frequency >= freqMin && e.frequency <= freqMax)
      .filter((e) => filterSev === "ALL" || e.severity === filterSev)
      .sort((a, b) => b.power - a.power);
  }, [entities, freqMin, freqMax, filterSev]);

  const selected = selectedId ? emitters.find((e) => e.id === selectedId) : null;

  return (
    <div className="flex flex-col h-full bg-sx-bg overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-sx-border px-6 py-3 flex items-center justify-between" style={{ background: "#0d1424" }}>
        <div>
          <div className="font-display font-bold text-sx-cyan tracking-widest">SIGINT SPECTRUM ANALYZER</div>
          <div className="font-mono text-[9px] text-sx-text-muted">ELECTRONIC ORDER OF BATTLE // RF ENVIRONMENT // WATERFALL DISPLAY</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="font-mono text-lg font-bold" style={{ color: "#ec4899" }}>{emitters.length}</div>
            <div className="font-mono text-[9px] text-sx-text-muted">EMITTERS</div>
          </div>
          <div className="text-center">
            <div className="font-mono text-lg font-bold" style={{ color: "#ef4444" }}>{emitters.filter((e) => e.severity === "CRITICAL" || e.severity === "HIGH").length}</div>
            <div className="font-mono text-[9px] text-sx-text-muted">HIGH-PRI</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 border-b border-sx-border px-4 py-2 flex items-center gap-4" style={{ background: "#0a0f1e" }}>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-sx-text-muted">FREQ RANGE:</span>
          <input
            type="number"
            value={freqMin}
            onChange={(e) => setFreqMin(Number(e.target.value))}
            className="w-20 px-2 py-1 rounded font-mono text-[9px] outline-none text-right"
            style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
          />
          <span className="font-mono text-[9px] text-sx-text-muted">—</span>
          <input
            type="number"
            value={freqMax}
            onChange={(e) => setFreqMax(Number(e.target.value))}
            className="w-24 px-2 py-1 rounded font-mono text-[9px] outline-none text-right"
            style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
          />
          <span className="font-mono text-[9px] text-sx-text-muted">MHz</span>
        </div>
        <div className="flex items-center gap-1">
          {(["ALL", "CRITICAL", "HIGH", "MEDIUM"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterSev(s)}
              className="px-2 py-1 rounded font-mono text-[8px] transition-all"
              style={{
                background: filterSev === s ? "rgba(0,212,255,0.12)" : "transparent",
                color: filterSev === s ? "#00d4ff" : "#475569",
                border: `1px solid ${filterSev === s ? "rgba(0,212,255,0.3)" : "transparent"}`,
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-sx-green" style={{ animation: "pulse 2s infinite", boxShadow: "0 0 4px #10b981" }} />
          <span className="font-mono text-[9px] text-sx-green">LIVE COLLECTION ACTIVE</span>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: spectrum + waterfall + table */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-sx-border">
          {/* Spectrum display */}
          <div className="flex-shrink-0 border-b border-sx-border-dim" style={{ background: "#020617" }}>
            <div className="px-3 pt-2 pb-0.5 flex items-center justify-between">
              <span className="font-mono text-[8px] text-sx-text-muted tracking-widest">POWER SPECTRUM — {freqMin}–{freqMax} MHz</span>
              <div className="flex items-center gap-4">
                <span className="font-mono text-[8px] text-sx-text-muted">↑ 0 dBm</span>
                <span className="font-mono text-[8px] text-sx-text-muted">↓ -110 dBm</span>
              </div>
            </div>
            <div className="overflow-hidden" style={{ height: 120 }}>
              <SpectrumChart emitters={emitters} freqRange={{ min: freqMin, max: freqMax }} />
            </div>
          </div>

          {/* Waterfall display */}
          <div className="flex-shrink-0 border-b border-sx-border-dim" style={{ background: "#020617" }}>
            <div className="px-3 pt-2 pb-0.5 flex items-center justify-between">
              <span className="font-mono text-[8px] text-sx-text-muted tracking-widest">WATERFALL — FREQUENCY VS TIME</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-2 rounded-sm" style={{ background: "#ef4444" }} />
                  <span className="font-mono text-[7px] text-sx-text-muted">CRITICAL</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-2 rounded-sm" style={{ background: "#f59e0b" }} />
                  <span className="font-mono text-[7px] text-sx-text-muted">HIGH</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-2 rounded-sm" style={{ background: "#00d4ff" }} />
                  <span className="font-mono text-[7px] text-sx-text-muted">NOMINAL</span>
                </div>
              </div>
            </div>
            <div className="overflow-hidden" style={{ height: 160 }}>
              <WaterfallDisplay emitters={emitters} />
            </div>
            {/* Frequency axis labels */}
            <div className="flex justify-between px-2 pb-1">
              <span className="font-mono text-[7px] text-sx-text-muted">{freqMin} MHz</span>
              <span className="font-mono text-[7px] text-sx-text-muted">{Math.round((freqMin + freqMax) / 2)} MHz</span>
              <span className="font-mono text-[7px] text-sx-text-muted">{freqMax} MHz</span>
            </div>
          </div>

          {/* Emitter table */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div
              className="flex-shrink-0 grid px-4 py-1.5 border-b border-sx-border-dim font-mono text-[9px] text-sx-text-muted tracking-wider"
              style={{ background: "#0a0f1e", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr 1fr" }}
            >
              {["EMITTER ID", "FREQ (MHz)", "BW (MHz)", "MODULATION", "TYPE", "SEVERITY"].map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-sx-border-dim">
              {emitters.length === 0 ? (
                <div className="p-12 text-center font-mono text-[10px] text-sx-text-muted">
                  NO SIGINT EMITTERS IN FREQUENCY RANGE
                </div>
              ) : (
                emitters.map((em) => {
                  const sColor = severityToColor(em.severity as any);
                  const modColor = MODULATION_COLORS[em.modulation] ?? "#475569";
                  const isSelected = em.id === selectedId;
                  return (
                    <button
                      key={em.id}
                      onClick={() => setSelectedId(isSelected ? null : em.id)}
                      className="w-full grid px-4 py-2 text-left hover:bg-sx-surface/50 transition-all"
                      style={{
                        gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr 1fr",
                        background: isSelected ? "rgba(236,72,153,0.06)" : "transparent",
                        borderLeft: isSelected ? "2px solid #ec4899" : "2px solid transparent",
                      }}
                    >
                      <span className="font-mono text-[10px] font-bold text-sx-text">{em.label}</span>
                      <span className="font-mono text-[9px] text-sx-cyan">{em.frequency.toFixed(1)}</span>
                      <span className="font-mono text-[9px] text-sx-text-muted">{em.bandwidth.toFixed(1)}</span>
                      <span className="font-mono text-[9px]" style={{ color: modColor }}>{em.modulation}</span>
                      <span className="font-mono text-[9px] text-sx-text-muted">{em.emitterType}</span>
                      <span className="font-mono text-[9px] font-bold" style={{ color: sColor }}>{em.severity}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right: emitter detail */}
        <div className="w-72 flex-shrink-0 overflow-y-auto" style={{ background: "#0d1424" }}>
          {selected ? (
            <div className="p-4 space-y-3 animate-fade-in">
              <div className="rounded border p-3"
                style={{ borderColor: `${severityToColor(selected.severity as any)}40`, background: `${severityToColor(selected.severity as any)}06` }}>
                <div className="font-mono text-[10px] font-bold mb-1" style={{ color: "#ec4899" }}>📡 {selected.label}</div>
                <div className="font-mono text-[9px] text-sx-text-muted">{selected.id}</div>
                <div className="font-mono text-sm font-bold mt-1" style={{ color: severityToColor(selected.severity as any) }}>
                  {selected.severity}
                </div>
              </div>

              {[
                { title: "SIGNAL PARAMETERS", rows: [
                  ["FREQUENCY", `${selected.frequency.toFixed(2)} MHz`],
                  ["BANDWIDTH", `${selected.bandwidth.toFixed(2)} MHz`],
                  ["POWER", `${selected.power} dBm`],
                  ["MODULATION", selected.modulation],
                  ["EMITTER TYPE", selected.emitterType],
                  ["BEARING", `${selected.bearing}°`],
                ]},
                { title: "GEOLOCATION", rows: [
                  ["LAT", `${Math.abs(selected.lat).toFixed(4)}°${selected.lat >= 0 ? "N" : "S"}`],
                  ["LON", `${Math.abs(selected.lon).toFixed(4)}°${selected.lon >= 0 ? "E" : "W"}`],
                  ["CONFIDENCE", `${(selected.confidence * 100).toFixed(0)}%`],
                  ["TIMESTAMP", new Date(selected.ts).toUTCString().split(" ")[4] + "Z"],
                ]},
              ].map((section) => (
                <div key={section.title} className="rounded border border-sx-border-dim bg-sx-surface overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-sx-border-dim bg-sx-panel">
                    <span className="font-mono text-[9px] text-sx-text-muted tracking-widest">{section.title}</span>
                  </div>
                  <div className="divide-y divide-sx-border-dim">
                    {section.rows.map(([k, v]) => (
                      <div key={k} className="px-3 py-1.5 flex items-start justify-between gap-3">
                        <span className="font-mono text-[9px] text-sx-text-muted">{k}</span>
                        <span className="font-mono text-[9px] text-sx-text text-right">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Direction indicator */}
              <div className="rounded border border-sx-border-dim bg-sx-surface p-3">
                <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-3">BEARING INDICATOR</div>
                <div className="flex items-center justify-center">
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(30,58,95,0.8)" strokeWidth="1" />
                    <circle cx="40" cy="40" r="24" fill="none" stroke="rgba(30,58,95,0.5)" strokeWidth="0.5" />
                    {["N","E","S","W"].map((d, i) => {
                      const angle = i * 90;
                      const rad = (angle - 90) * Math.PI / 180;
                      return (
                        <text key={d} x={40 + Math.cos(rad) * 30} y={40 + Math.sin(rad) * 30 + 3}
                          textAnchor="middle" fill="rgba(0,212,255,0.4)" fontSize="7" fontFamily="'Share Tech Mono',monospace">{d}</text>
                      );
                    })}
                    <line
                      x1="40" y1="40"
                      x2={40 + Math.cos((selected.bearing - 90) * Math.PI / 180) * 30}
                      y2={40 + Math.sin((selected.bearing - 90) * Math.PI / 180) * 30}
                      stroke="#ec4899" strokeWidth="2" strokeLinecap="round"
                    />
                    <circle cx="40" cy="40" r="3" fill="#ec4899" />
                    <text x="40" y="74" textAnchor="middle" fill="#ec4899" fontSize="9" fontFamily="'Share Tech Mono',monospace">
                      {selected.bearing}°
                    </text>
                  </svg>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <div className="text-4xl opacity-20 mb-3">📡</div>
              <div className="font-mono text-[10px] text-sx-text-muted">SELECT EMITTER TO INSPECT</div>
              <div className="font-mono text-[9px] text-sx-text-muted/60 mt-1">Full signal intelligence record</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
