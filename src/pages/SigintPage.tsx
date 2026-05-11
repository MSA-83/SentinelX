// src/pages/SigintPage.tsx
// SIGINT Spectrum Visualization — waterfall display, emitter table, RF environment map
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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

// ─── Waterfall canvas — scrolling frequency-vs-time heatmap ───────────────────

function WaterfallDisplay({ emitters, freqMin, freqMax }: {
  emitters: EmitterRecord[];
  freqMin: number;
  freqMax: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rowBufRef = useRef<Uint8ClampedArray[]>([]);
  const animRef = useRef<number>();
  const lastFrameRef = useRef(0);
  const FRAME_INTERVAL = 120; // ms between new waterfall rows

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const freqSpan = freqMax - freqMin;

    const addRow = (ts: number) => {
      if (ts - lastFrameRef.current < FRAME_INTERVAL) return;
      lastFrameRef.current = ts;

      const W = canvas.width;

      // Base noise floor (RGB per pixel)
      const rowData = new Uint8ClampedArray(W * 4);
      for (let x = 0; x < W; x++) {
        const n = Math.random() * 14 + 2;
        rowData[x * 4]     = n * 0.3;
        rowData[x * 4 + 1] = n * 0.5;
        rowData[x * 4 + 2] = n * 1.8;
        rowData[x * 4 + 3] = 255;
      }

      // Paint emitter peaks into the row
      for (const em of emitters) {
        if (em.frequency < freqMin || em.frequency > freqMax) continue;
        const freqNorm = (em.frequency - freqMin) / freqSpan;
        const centerX = Math.floor(freqNorm * W);
        const bwPx = Math.max(3, Math.floor((em.bandwidth / freqSpan) * W * 0.6));
        const intensity = Math.max(0, em.power + 105) * (em.severity === "CRITICAL" ? 2.8 : em.severity === "HIGH" ? 1.9 : 1.1);

        for (let dx = -bwPx * 2; dx <= bwPx * 2; dx++) {
          const x = centerX + dx;
          if (x < 0 || x >= W) continue;
          const gauss = Math.exp(-(dx * dx) / (bwPx * bwPx * 0.6));
          const str = intensity * gauss + Math.random() * 4;

          const idx = x * 4;
          if (em.severity === "CRITICAL") {
            rowData[idx]     = Math.min(255, rowData[idx]     + str * 3.2);
            rowData[idx + 1] = Math.min(255, rowData[idx + 1] + str * 0.4);
            rowData[idx + 2] = Math.min(255, rowData[idx + 2] + str * 0.15);
          } else if (em.severity === "HIGH") {
            rowData[idx]     = Math.min(255, rowData[idx]     + str * 2.2);
            rowData[idx + 1] = Math.min(255, rowData[idx + 1] + str * 1.4);
            rowData[idx + 2] = Math.min(255, rowData[idx + 2] + str * 0.1);
          } else {
            rowData[idx]     = Math.min(255, rowData[idx]     + str * 0.1);
            rowData[idx + 1] = Math.min(255, rowData[idx + 1] + str * 1.1);
            rowData[idx + 2] = Math.min(255, rowData[idx + 2] + str * 2.8);
          }
        }
      }

      rowBufRef.current.push(rowData);
      // Keep only as many rows as the canvas height
      if (rowBufRef.current.length > canvas.height) {
        rowBufRef.current.shift();
      }
    };

    const draw = (ts: number) => {
      addRow(ts);

      const W = canvas.width;
      const H = canvas.height;
      const rows = rowBufRef.current;

      // Paint buffered rows bottom-up (newest at bottom)
      for (let i = 0; i < rows.length; i++) {
        const y = H - 1 - i;
        if (y < 0) break;
        const imgData = ctx.createImageData(W, 1);
        imgData.data.set(rows[rows.length - 1 - i]);
        ctx.putImageData(imgData, 0, y);
      }

      // Fill top unfilled rows with black
      if (rows.length < H) {
        ctx.fillStyle = "#020617";
        ctx.fillRect(0, 0, W, H - rows.length);
      }

      // Timestamp label (scrolling waterfall "now" marker)
      ctx.fillStyle = "rgba(0,212,255,0.35)";
      ctx.font = "8px 'Share Tech Mono', monospace";
      ctx.fillText(new Date().toUTCString().split(" ")[4] + "Z", W - 62, H - rows.length + 10);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [emitters, freqMin, freqMax]);

  return (
    <canvas
      ref={canvasRef}
      width={900}
      height={200}
      className="w-full h-full"
      style={{ imageRendering: "pixelated", display: "block" }}
    />
  );
}

// ─── Spectrum line chart — live power spectrum overlay ────────────────────────

function SpectrumChart({ emitters, freqMin, freqMax }: {
  emitters: EmitterRecord[];
  freqMin: number;
  freqMax: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const noiseBaseRef = useRef<number[] | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const freqSpan = freqMax - freqMin;

    // Stable noise base (regenerated when freq range changes)
    if (!noiseBaseRef.current || noiseBaseRef.current.length !== W) {
      noiseBaseRef.current = Array.from({ length: W }, () => -96 + Math.random() * 6);
    }

    let animId: number;
    const render = () => {
      ctx.clearRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = "rgba(30,58,95,0.45)";
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 8; i++) {
        const x = (i / 8) * W;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let i = 0; i <= 5; i++) {
        const y = (i / 5) * H;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Build signal array from noise base + emitter peaks
      const signal = noiseBaseRef.current!.slice();
      for (const em of emitters) {
        if (em.frequency < freqMin || em.frequency > freqMax) continue;
        const centerX = Math.floor(((em.frequency - freqMin) / freqSpan) * W);
        const bwPx = Math.max(4, Math.floor((em.bandwidth / freqSpan) * W));
        const peak = em.power + 38 + Math.random() * 2;
        for (let dx = -bwPx * 2; dx <= bwPx * 2; dx++) {
          const x = centerX + dx;
          if (x < 0 || x >= W) continue;
          const g = Math.exp(-(dx * dx) / (bwPx * bwPx * 0.5));
          signal[x] = Math.max(signal[x], peak * g - 18 + Math.random() * 3);
        }
      }

      // Draw filled spectrum
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "rgba(0,212,255,0.85)");
      grad.addColorStop(0.45, "rgba(0,212,255,0.35)");
      grad.addColorStop(1, "rgba(0,212,255,0.03)");

      ctx.beginPath();
      for (let x = 0; x < W; x++) {
        const power = signal[x]; // dBm range -110 to 0
        const y = H - ((power + 112) / 112) * H;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#00d4ff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // dBm axis labels
      ctx.fillStyle = "rgba(71,85,105,0.8)";
      ctx.font = "8px 'Share Tech Mono', monospace";
      [0, -20, -40, -60, -80, -100].forEach((dbm, i) => {
        ctx.fillText(`${dbm}`, 2, (i / 5) * H + 9);
      });

      // Emitter frequency markers
      for (const em of emitters) {
        if (em.frequency < freqMin || em.frequency > freqMax) continue;
        const x = Math.floor(((em.frequency - freqMin) / freqSpan) * W);
        const color = severityToColor(em.severity as any);

        ctx.save();
        ctx.strokeStyle = color + "55";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Frequency label
        ctx.fillStyle = color;
        ctx.font = "bold 8px 'Share Tech Mono', monospace";
        const label = `${em.frequency >= 1000 ? (em.frequency / 1000).toFixed(1) + "G" : em.frequency.toFixed(0) + "M"}`;
        const lx = Math.min(W - 36, Math.max(0, x + 3));
        ctx.fillText(label, lx, 12);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [emitters, freqMin, freqMax]);

  return (
    <canvas
      ref={canvasRef}
      width={900}
      height={130}
      className="w-full h-full"
      style={{ display: "block" }}
    />
  );
}

// ─── Frequency Axis Bar ───────────────────────────────────────────────────────

function FreqAxis({ freqMin, freqMax }: { freqMin: number; freqMax: number }) {
  const ticks = 9;
  return (
    <div className="flex justify-between px-2 py-1" style={{ background: "#020617" }}>
      {Array.from({ length: ticks }, (_, i) => {
        const freq = freqMin + (i / (ticks - 1)) * (freqMax - freqMin);
        return (
          <span key={i} className="font-mono text-[7px]" style={{ color: "rgba(0,212,255,0.3)" }}>
            {freq >= 1000 ? `${(freq / 1000).toFixed(1)}G` : `${Math.round(freq)}M`}
          </span>
        );
      })}
    </div>
  );
}

// ─── Entity → Emitter conversion ──────────────────────────────────────────────

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

// ─── Band presets ─────────────────────────────────────────────────────────────

const BAND_PRESETS = [
  { label: "HF", min: 3, max: 30 },
  { label: "VHF", min: 30, max: 300 },
  { label: "UHF", min: 300, max: 3000 },
  { label: "L-Band", min: 1000, max: 2000 },
  { label: "S-Band", min: 2000, max: 4000 },
  { label: "C-Band", min: 4000, max: 8000 },
  { label: "X-Band", min: 8000, max: 12000 },
  { label: "Ku", min: 12000, max: 18000 },
  { label: "ALL", min: 100, max: 18000 },
];

// ─── Main page ─────────────────────────────────────────────────────────────────

export function SigintPage() {
  const { entities } = useEntityStream();
  const [freqMin, setFreqMin] = useState(100);
  const [freqMax, setFreqMax] = useState(18000);
  const [filterSev, setFilterSev] = useState<string>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"power" | "freq" | "severity">("power");

  const emitters = useMemo(() => {
    const raw = entities
      .map(entityToEmitter)
      .filter((e): e is EmitterRecord => e !== null)
      .filter((e) => e.frequency >= freqMin && e.frequency <= freqMax)
      .filter((e) => filterSev === "ALL" || e.severity === filterSev);

    return raw.sort((a, b) => {
      if (sortBy === "freq") return a.frequency - b.frequency;
      if (sortBy === "severity") {
        const order = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 } as Record<string, number>;
        return (order[b.severity] ?? 0) - (order[a.severity] ?? 0);
      }
      return b.power - a.power;
    });
  }, [entities, freqMin, freqMax, filterSev, sortBy]);

  const selected = selectedId ? emitters.find((e) => e.id === selectedId) : null;

  const handleBandPreset = useCallback((min: number, max: number) => {
    setFreqMin(min);
    setFreqMax(max);
  }, []);

  const critCount = emitters.filter((e) => e.severity === "CRITICAL").length;
  const highCount = emitters.filter((e) => e.severity === "HIGH").length;

  return (
    <div className="flex flex-col h-full bg-sx-bg overflow-hidden">
      {/* Header */}
      <div
        className="flex-shrink-0 border-b border-sx-border px-6 py-3 flex items-center justify-between"
        style={{ background: "#0d1424" }}
      >
        <div>
          <div className="font-display font-bold text-sx-cyan tracking-widest">SIGINT SPECTRUM ANALYZER</div>
          <div className="font-mono text-[9px] text-sx-text-muted">
            ELECTRONIC ORDER OF BATTLE // RF ENVIRONMENT // WATERFALL DISPLAY
          </div>
        </div>
        <div className="flex items-center gap-5">
          {[
            { label: "EMITTERS", value: emitters.length, color: "#ec4899" },
            { label: "CRITICAL",  value: critCount,       color: "#ef4444" },
            { label: "HIGH",      value: highCount,       color: "#f59e0b" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <div className="font-mono text-lg font-bold" style={{ color }}>{value}</div>
              <div className="font-mono text-[9px] text-sx-text-muted">{label}</div>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-2">
            <div className="w-1.5 h-1.5 rounded-full bg-sx-green" style={{ animation: "pulse 2s infinite", boxShadow: "0 0 4px #10b981" }} />
            <span className="font-mono text-[9px] text-sx-green">LIVE</span>
          </div>
        </div>
      </div>

      {/* Band presets + controls */}
      <div
        className="flex-shrink-0 border-b border-sx-border px-4 py-2 flex items-center gap-4 flex-wrap"
        style={{ background: "#0a0f1e" }}
      >
        {/* Band presets */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="font-mono text-[8px] text-sx-text-muted mr-1">BAND:</span>
          {BAND_PRESETS.map(({ label, min, max }) => (
            <button
              key={label}
              onClick={() => handleBandPreset(min, max)}
              className="px-2 py-0.5 rounded font-mono text-[8px] uppercase tracking-wider transition-all"
              style={{
                background: freqMin === min && freqMax === max ? "rgba(0,212,255,0.12)" : "transparent",
                color: freqMin === min && freqMax === max ? "#00d4ff" : "#475569",
                border: `1px solid ${freqMin === min && freqMax === max ? "rgba(0,212,255,0.3)" : "transparent"}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-sx-border-dim" />

        {/* Manual freq range */}
        <div className="flex items-center gap-1.5">
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

        <div className="w-px h-5 bg-sx-border-dim" />

        {/* Severity filter */}
        <div className="flex items-center gap-1">
          {(["ALL", "CRITICAL", "HIGH", "MEDIUM"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterSev(s)}
              className="px-2 py-0.5 rounded font-mono text-[8px] transition-all"
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
      </div>

      {/* Spectrum displays + table */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: displays + table */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-sx-border">

          {/* Power Spectrum */}
          <div
            className="flex-shrink-0 border-b border-sx-border-dim"
            style={{ background: "#020617", height: 160 }}
          >
            <div className="px-3 pt-1.5 flex items-center justify-between">
              <span className="font-mono text-[8px] tracking-widest" style={{ color: "rgba(0,212,255,0.4)" }}>
                POWER SPECTRUM ({freqMin >= 1000 ? `${(freqMin/1000).toFixed(1)}G` : `${freqMin}M`} — {freqMax >= 1000 ? `${(freqMax/1000).toFixed(1)}G` : `${freqMax}M`} Hz)
              </span>
              <div className="flex gap-3">
                <span className="font-mono text-[7px]" style={{ color: "rgba(71,85,105,0.6)" }}>↑ 0 dBm</span>
                <span className="font-mono text-[7px]" style={{ color: "rgba(71,85,105,0.6)" }}>↓ -112 dBm</span>
              </div>
            </div>
            <div style={{ height: 130, overflow: "hidden" }}>
              <SpectrumChart emitters={emitters} freqMin={freqMin} freqMax={freqMax} />
            </div>
          </div>

          {/* Waterfall */}
          <div
            className="flex-shrink-0 border-b border-sx-border-dim"
            style={{ background: "#020617", height: 230 }}
          >
            <div className="px-3 pt-1.5 pb-0.5 flex items-center justify-between">
              <span className="font-mono text-[8px] tracking-widest" style={{ color: "rgba(0,212,255,0.4)" }}>
                WATERFALL — FREQUENCY vs TIME (NEWEST AT BOTTOM)
              </span>
              <div className="flex items-center gap-3">
                {[
                  { color: "#ef4444", label: "CRITICAL" },
                  { color: "#f59e0b", label: "HIGH" },
                  { color: "#00d4ff", label: "NOMINAL" },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className="w-2 h-1.5 rounded-sm" style={{ background: color }} />
                    <span className="font-mono text-[7px] text-sx-text-muted">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ height: 200, overflow: "hidden" }}>
              <WaterfallDisplay emitters={emitters} freqMin={freqMin} freqMax={freqMax} />
            </div>
          </div>

          {/* Freq axis */}
          <FreqAxis freqMin={freqMin} freqMax={freqMax} />

          {/* Emitter table */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div
              className="flex-shrink-0 flex items-center justify-between px-4 py-1.5 border-b border-sx-border-dim"
              style={{ background: "#0a0f1e" }}
            >
              <span className="font-mono text-[9px] text-sx-text-muted tracking-widest">
                ACTIVE EMITTERS ({emitters.length})
              </span>
              <div className="flex items-center gap-1">
                <span className="font-mono text-[8px] text-sx-text-muted mr-1">SORT:</span>
                {(["power", "freq", "severity"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className="px-1.5 py-0.5 rounded font-mono text-[8px] uppercase transition-all"
                    style={{
                      background: sortBy === s ? "rgba(0,212,255,0.1)" : "transparent",
                      color: sortBy === s ? "#00d4ff" : "#334155",
                      border: `1px solid ${sortBy === s ? "rgba(0,212,255,0.25)" : "transparent"}`,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Column headers */}
            <div
              className="flex-shrink-0 grid px-4 py-1 font-mono text-[8px] text-sx-text-muted tracking-widest border-b border-sx-border-dim"
              style={{ background: "#0a0f1e", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 0.8fr 1fr" }}
            >
              {["EMITTER ID", "FREQ", "BW", "MOD", "TYPE", "PWR dBm", "SEV"].map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-sx-border-dim">
              {emitters.length === 0 ? (
                <div className="p-12 text-center font-mono text-[10px] text-sx-text-muted">
                  NO SIGINT EMITTERS IN SELECTED FREQUENCY RANGE
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
                        gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 0.8fr 1fr",
                        background: isSelected ? "rgba(236,72,153,0.06)" : "transparent",
                        borderLeft: `2px solid ${isSelected ? "#ec4899" : "transparent"}`,
                      }}
                    >
                      <span className="font-mono text-[10px] font-bold text-sx-text truncate pr-2">{em.label}</span>
                      <span className="font-mono text-[9px] text-sx-cyan">
                        {em.frequency >= 1000 ? `${(em.frequency / 1000).toFixed(2)}G` : `${em.frequency.toFixed(0)}M`}
                      </span>
                      <span className="font-mono text-[9px] text-sx-text-muted">{em.bandwidth.toFixed(1)}</span>
                      <span className="font-mono text-[9px]" style={{ color: modColor }}>{em.modulation}</span>
                      <span className="font-mono text-[9px] text-sx-text-muted truncate">{em.emitterType}</span>
                      <span className="font-mono text-[9px] text-sx-text-muted">{em.power}</span>
                      <span className="font-mono text-[9px] font-bold" style={{ color: sColor }}>{em.severity}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right: emitter detail panel */}
        <div className="w-72 flex-shrink-0 overflow-y-auto" style={{ background: "#0d1424" }}>
          {selected ? (
            <div className="p-4 space-y-3 animate-fade-in">
              {/* Title card */}
              <div
                className="rounded border p-3"
                style={{
                  borderColor: `${severityToColor(selected.severity as any)}40`,
                  background: `${severityToColor(selected.severity as any)}06`,
                }}
              >
                <div className="font-mono text-[10px] font-bold mb-0.5" style={{ color: "#ec4899" }}>
                  📡 {selected.label}
                </div>
                <div className="font-mono text-[8px] text-sx-text-muted">{selected.id}</div>
                <div className="font-mono text-sm font-bold mt-1" style={{ color: severityToColor(selected.severity as any) }}>
                  {selected.severity}
                </div>
              </div>

              {/* Signal params */}
              {[
                {
                  title: "SIGNAL PARAMETERS",
                  rows: [
                    ["FREQUENCY", `${selected.frequency >= 1000 ? (selected.frequency / 1000).toFixed(3) + " GHz" : selected.frequency.toFixed(2) + " MHz"}`],
                    ["BANDWIDTH", `${selected.bandwidth.toFixed(2)} MHz`],
                    ["POWER", `${selected.power} dBm`],
                    ["MODULATION", selected.modulation],
                    ["EMITTER TYPE", selected.emitterType],
                    ["BEARING", `${selected.bearing}°`],
                  ],
                },
                {
                  title: "GEOLOCATION",
                  rows: [
                    ["LAT", `${Math.abs(selected.lat).toFixed(4)}°${selected.lat >= 0 ? "N" : "S"}`],
                    ["LON", `${Math.abs(selected.lon).toFixed(4)}°${selected.lon >= 0 ? "E" : "W"}`],
                    ["CONFIDENCE", `${(selected.confidence * 100).toFixed(0)}%`],
                    ["TIMESTAMP", new Date(selected.ts).toUTCString().split(" ")[4] + "Z"],
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
                  <svg width="90" height="90" viewBox="0 0 90 90">
                    {/* Rings */}
                    {[38, 24, 12].map((r) => (
                      <circle key={r} cx="45" cy="45" r={r} fill="none" stroke="rgba(30,58,95,0.7)" strokeWidth="0.8" />
                    ))}
                    {/* Cardinal directions */}
                    {["N","E","S","W"].map((d, i) => {
                      const rad = (i * 90 - 90) * Math.PI / 180;
                      return (
                        <text key={d}
                          x={45 + Math.cos(rad) * 32} y={45 + Math.sin(rad) * 32 + 3}
                          textAnchor="middle" fill="rgba(0,212,255,0.4)"
                          fontSize="7" fontFamily="'Share Tech Mono',monospace"
                        >
                          {d}
                        </text>
                      );
                    })}
                    {/* Bearing needle */}
                    <line
                      x1="45" y1="45"
                      x2={45 + Math.cos((selected.bearing - 90) * Math.PI / 180) * 32}
                      y2={45 + Math.sin((selected.bearing - 90) * Math.PI / 180) * 32}
                      stroke="#ec4899" strokeWidth="2" strokeLinecap="round"
                    />
                    {/* Counter needle (back) */}
                    <line
                      x1="45" y1="45"
                      x2={45 + Math.cos((selected.bearing + 90) * Math.PI / 180) * 10}
                      y2={45 + Math.sin((selected.bearing + 90) * Math.PI / 180) * 10}
                      stroke="#ec489940" strokeWidth="1.5" strokeLinecap="round"
                    />
                    <circle cx="45" cy="45" r="2.5" fill="#ec4899" />
                    <text x="45" y="84" textAnchor="middle" fill="#ec4899"
                      fontSize="9" fontFamily="'Share Tech Mono',monospace">
                      {selected.bearing}°
                    </text>
                  </svg>
                </div>
              </div>

              {/* Modulation indicator */}
              <div className="rounded border border-sx-border-dim bg-sx-surface p-3">
                <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-2">MODULATION SIGNATURE</div>
                <div
                  className="rounded py-2 text-center font-mono text-sm font-bold"
                  style={{
                    background: `${MODULATION_COLORS[selected.modulation] ?? "#475569"}12`,
                    border: `1px solid ${MODULATION_COLORS[selected.modulation] ?? "#475569"}30`,
                    color: MODULATION_COLORS[selected.modulation] ?? "#475569",
                  }}
                >
                  {selected.modulation}
                </div>
                <div className="font-mono text-[8px] text-sx-text-muted mt-2 text-center">
                  {selected.emitterType} · {(selected.confidence * 100).toFixed(0)}% CONFIDENCE
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <div className="text-5xl opacity-15 mb-4">📡</div>
              <div className="font-mono text-[10px] text-sx-text-muted">SELECT EMITTER</div>
              <div className="font-mono text-[9px] text-sx-text-muted/60 mt-1">Full signal intelligence record</div>
              <div className="mt-8 space-y-2 w-full">
                <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-2">LEGEND</div>
                {Object.entries(MODULATION_COLORS).filter(([k]) => k !== "UNKNOWN").map(([mod, color]) => (
                  <div key={mod} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
                    <span className="font-mono text-[9px] text-sx-text-muted">{mod}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
