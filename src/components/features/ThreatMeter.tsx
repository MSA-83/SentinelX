// src/components/features/ThreatMeter.tsx
// Animated circular threat level gauge with domain breakdown
// Used in TopBar and standalone contexts

import { useEffect, useRef } from "react";
import type { ThreatAssessment } from "@/types/entities";
import { severityToColor } from "@/lib/threatAssessor";

interface ThreatMeterProps {
  assessment: ThreatAssessment;
  size?: number;
}

export function ThreatMeter({ assessment, size = 80 }: ThreatMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const color = severityToColor(assessment.globalThreatLevel);
  const pct   = assessment.threatIndex / 100;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const r  = size * 0.38;
    const startAngle = -Math.PI * 0.75;
    const totalArc   = Math.PI * 1.5;

    ctx.clearRect(0, 0, size, size);

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, startAngle + totalArc);
    ctx.strokeStyle = "#1e3a5f";
    ctx.lineWidth   = 4;
    ctx.lineCap     = "round";
    ctx.stroke();

    // Value arc
    if (pct > 0) {
      const grad = ctx.createLinearGradient(0, 0, size, 0);
      grad.addColorStop(0, "#10b981");
      grad.addColorStop(0.5, "#f59e0b");
      grad.addColorStop(1, color);

      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, startAngle + totalArc * pct);
      ctx.strokeStyle = grad;
      ctx.lineWidth   = 4;
      ctx.lineCap     = "round";
      ctx.shadowColor = color;
      ctx.shadowBlur  = 6;
      ctx.stroke();
      ctx.shadowBlur  = 0;
    }

    // Tick marks
    for (let i = 0; i <= 10; i++) {
      const angle    = startAngle + (totalArc * i) / 10;
      const inner    = r - 6;
      const outerR   = i % 5 === 0 ? r + 3 : r - 2;
      const x1       = cx + Math.cos(angle) * inner;
      const y1       = cy + Math.sin(angle) * inner;
      const x2       = cx + Math.cos(angle) * outerR;
      const y2       = cy + Math.sin(angle) * outerR;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = i % 5 === 0 ? "rgba(0,212,255,0.5)" : "rgba(30,58,95,0.8)";
      ctx.lineWidth   = i % 5 === 0 ? 1.5 : 0.75;
      ctx.stroke();
    }

    // Center index value
    ctx.fillStyle = color;
    ctx.font      = `bold ${size * 0.2}px 'Share Tech Mono', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = color;
    ctx.shadowBlur  = 8;
    ctx.fillText(assessment.threatIndex.toString(), cx, cy - 2);
    ctx.shadowBlur  = 0;

    // Level label below
    ctx.fillStyle    = "rgba(148,163,184,0.6)";
    ctx.font         = `${size * 0.1}px 'Share Tech Mono', monospace`;
    ctx.letterSpacing = "0.12em";
    ctx.fillText("INDEX", cx, cy + size * 0.17);
  }, [assessment.threatIndex, color, pct, size]);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <canvas ref={canvasRef} style={{ width: size, height: size }} />
    </div>
  );
}
