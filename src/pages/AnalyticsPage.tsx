// src/pages/AnalyticsPage.tsx
// Analytics — live entity-derived charts, cross-domain heatmap, anomaly timeline, source health

import { useMemo, useCallback, useState } from "react";
import { useEntityStream } from "@/hooks/useEntityStream";
import { computeThreatAssessment, severityToColor } from "@/lib/threatAssessor";
import { DOMAIN_CONFIGS, DOMAIN_ORDER } from "@/constants/domains";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter, ZAxis, Legend,
} from "recharts";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "#0d1424",
    border: "1px solid #1e3a5f",
    borderRadius: 2,
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    color: "#94a3b8",
  },
  labelStyle: { color: "#475569" },
};

const SOURCE_DATA_STATIC = [
  { source: "ADS-B",     freshness: 98, confidence: 95 },
  { source: "AISStream", freshness: 96, confidence: 90 },
  { source: "CelesTrak", freshness: 88, confidence: 99 },
  { source: "USGS",      freshness: 99, confidence: 99 },
  { source: "ACLED",     freshness: 75, confidence: 78 },
  { source: "Shodan",    freshness: 82, confidence: 72 },
  { source: "SIGINT",    freshness: 94, confidence: 68 },
  { source: "NRO/CTBTO", freshness: 70, confidence: 85 },
];

// ─── Heatmap cell ────────────────────────────────────────────────────────────

const SEV_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
const SEV_BG: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH:     "#f59e0b",
  MEDIUM:   "#eab308",
  LOW:      "#10b981",
  INFO:     "#334155",
};

// ─── Export utilities ─────────────────────────────────────────────────────────

function exportCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? "")).join(","));
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(title: string, content: string) {
  const html = `<!DOCTYPE html><html><head><title>${title}</title><style>
    body{font-family:monospace;background:#020617;color:#e2e8f0;padding:40px}
    h1{color:#00d4ff;font-size:20px;border-bottom:1px solid #1e3a5f;padding-bottom:10px}
    pre{font-size:11px;line-height:1.6;color:#94a3b8;white-space:pre-wrap}
    .c{color:#ef4444;font-size:10px;text-align:center;margin:20px 0}
  </style></head><body>
    <div class="c">⚠ TOP SECRET // SENTINEL // NOFORN ⚠</div>
    <h1>${title}</h1><pre>${content}</pre>
    <div class="c">END OF DOCUMENT // SENTINEL-X // ${new Date().toUTCString()}</div>
  </body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (w) { w.onload = () => { w.print(); URL.revokeObjectURL(url); }; }
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const { entities, events, latencyMs, messageRate } = useEntityStream();
  const assessment = useMemo(() => computeThreatAssessment(entities), [entities]);
  const [heatmapMode, setHeatmapMode] = useState<"count" | "severity">("count");

  // ── Live domain data ────────────────────────────────────────────────────────
  const domainData = DOMAIN_ORDER.map(d => {
    const cfg = DOMAIN_CONFIGS[d];
    const domEntities = entities.filter(e => e.domain === d);
    const crit = domEntities.filter(e => e.severity === "CRITICAL").length;
    const high = domEntities.filter(e => e.severity === "HIGH").length;
    const anom = domEntities.filter(e => e.anomalyFlag).length;
    return { name: cfg.shortLabel, fullName: cfg.label, count: domEntities.length, crit, high, anom, color: cfg.color };
  });

  const severityData = SEV_ORDER.map(sev => ({
    name: sev,
    value: entities.filter(e => e.severity === sev).length,
    color: severityToColor(sev),
  }));

  // ── Radar: domain threat levels ─────────────────────────────────────────────
  const radarData = DOMAIN_ORDER.map(d => {
    const level = assessment.domainThreatLevels?.[d] ?? "INFO";
    const score = ({ CRITICAL: 100, HIGH: 75, MEDIUM: 50, LOW: 25, INFO: 10 } as Record<string, number>)[level] ?? 0;
    const anomScore = Math.min(100, (entities.filter(e => e.domain === d && e.anomalyFlag).length / Math.max(1, entities.filter(e => e.domain === d).length)) * 200);
    return { domain: DOMAIN_CONFIGS[d].shortLabel, threat: score, anomaly: anomScore };
  });

  // ── Cross-domain heatmap: domain × severity ──────────────────────────────────
  const heatmapData = DOMAIN_ORDER.map(d => {
    const row: Record<string, string | number> = { domain: DOMAIN_CONFIGS[d].shortLabel };
    SEV_ORDER.forEach(sev => {
      row[sev] = entities.filter(e => e.domain === d && e.severity === sev).length;
    });
    return row;
  });

  // ── Scatter: confidence vs severity score ───────────────────────────────────
  const scatterData = entities.slice(0, 120).map(e => ({
    confidence: Math.round(e.confidence * 100),
    sevScore: ({ CRITICAL: 100, HIGH: 75, MEDIUM: 50, LOW: 25, INFO: 10 } as Record<string, number>)[e.severity] ?? 0,
    anomaly: e.anomalyFlag ? 1 : 0,
    domain: e.domain,
  }));

  // ── Anomaly distribution per domain ─────────────────────────────────────────
  const anomalyData = DOMAIN_ORDER.map(d => ({
    name: DOMAIN_CONFIGS[d].shortLabel,
    anomalies: entities.filter(e => e.domain === d && e.anomalyFlag).length,
    total: entities.filter(e => e.domain === d).length,
    color: DOMAIN_CONFIGS[d].color,
  })).filter(d => d.total > 0);

  // ── Source reliability derived from entity counts ────────────────────────────
  const sourceData = SOURCE_DATA_STATIC.map(s => ({
    ...s,
    entities: Math.round(entities.length * (s.confidence / 800)),
  }));

  const handleExportCSV = useCallback(() => {
    const rows = entities.map(e => ({
      id: e.id,
      domain: e.domain,
      type: e.type,
      label: e.label,
      severity: e.severity,
      confidence: (e.confidence * 100).toFixed(0) + "%",
      lat: e.position.lat.toFixed(4),
      lon: e.position.lon.toFixed(4),
      source: e.source,
      timestamp: e.ts,
      anomaly: e.anomalyFlag ? "YES" : "NO",
      classification: e.classification,
    }));
    exportCSV(rows, `sentinel-x-entities-${new Date().toISOString().split("T")[0]}.csv`);
    toast.success(`Exported ${rows.length} entity records`);
  }, [entities]);

  const handleExportEventsCSV = useCallback(() => {
    const rows = events.map(e => ({
      id: e.id, domain: e.domain, severity: e.severity,
      title: e.title, description: e.description,
      timestamp: e.ts, acknowledged: e.acknowledged ? "YES" : "NO",
    }));
    exportCSV(rows, `sentinel-x-events-${new Date().toISOString().split("T")[0]}.csv`);
    toast.success(`Exported ${rows.length} event records`);
  }, [events]);

  const handleExportPDF = useCallback(() => {
    const content = [
      `REPORT TYPE  : OPERATIONAL ANALYTICS`,
      `DTG          : ${new Date().toUTCString()}`,
      `CLASSIFICATION: TOP SECRET // SENTINEL // NOFORN`,
      "",
      "═══ GLOBAL THREAT ASSESSMENT ═══",
      `Global Threat Level : ${assessment.globalThreatLevel}`,
      `Threat Index        : ${assessment.threatIndex}/100`,
      `Critical Entities   : ${assessment.criticalEntityCount}`,
      `Anomaly Count       : ${assessment.anomalyCount}`,
      "",
      "═══ DOMAIN BREAKDOWN ═══",
      ...domainData.map(d => `${d.fullName.padEnd(24)} : ${d.count} entities / ${d.crit} critical / ${d.anom} anomalies`),
      "",
      "═══ SEVERITY DISTRIBUTION ═══",
      ...severityData.map(s => `${s.name.padEnd(12)} : ${s.value}`),
    ].join("\n");
    exportPDF("SENTINEL-X OPERATIONAL ANALYTICS REPORT", content);
    toast.success("PDF report opened for printing");
  }, [assessment, domainData, severityData]);

  return (
    <div className="flex flex-col h-full bg-sx-bg overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-sx-border px-6 py-3 flex items-center justify-between" style={{ background: "#0d1424" }}>
        <div>
          <div className="font-display font-bold text-sx-cyan tracking-widest text-lg">ANALYTICS</div>
          <div className="font-mono text-[9px] text-sx-text-muted">OPERATIONAL METRICS // CROSS-DOMAIN INTELLIGENCE // ANOMALY ANALYSIS</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 mr-2">
            {[
              { label: "ENTITIES",  value: entities.length, color: "#00d4ff" },
              { label: "ANOMALIES", value: assessment.anomalyCount, color: "#ec4899" },
              { label: "MSG/S",     value: messageRate, color: "#10b981" },
              { label: "LATENCY",   value: `${latencyMs}ms`, color: "#f59e0b" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div className="font-mono font-bold text-lg leading-none" style={{ color }}>{value}</div>
                <div className="font-mono text-[9px] text-sx-text-muted">{label}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {[
              { label: "↓ CSV",    handler: handleExportCSV,       color: "#00d4ff" },
              { label: "↓ EVENTS", handler: handleExportEventsCSV, color: "#a855f7" },
              { label: "↓ PDF",    handler: handleExportPDF,       color: "#ef4444" },
            ].map(({ label, handler, color }) => (
              <button
                key={label}
                onClick={handler}
                className="px-3 py-1.5 rounded font-mono text-[9px] transition-all"
                style={{ background: `${color}10`, border: `1px solid ${color}35`, color }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = `${color}1a`)}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = `${color}10`)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "TOTAL ENTITIES",  value: entities.length,                                   color: "#00d4ff" },
            { label: "CRITICAL",        value: assessment.criticalEntityCount,                    color: "#ef4444" },
            { label: "ANOMALIES",       value: assessment.anomalyCount,                           color: "#ec4899" },
            { label: "TOTAL EVENTS",    value: events.length,                                     color: "#a855f7" },
            { label: "UNACKED ALERTS",  value: events.filter(e => !e.acknowledged).length,         color: "#f59e0b" },
          ].map(kpi => (
            <div key={kpi.label} className="rounded border border-sx-border-dim bg-sx-panel p-3">
              <div className="font-mono text-2xl font-bold mb-0.5" style={{ color: kpi.color, textShadow: `0 0 12px ${kpi.color}40` }}>
                {kpi.value}
              </div>
              <div className="font-mono text-[9px] text-sx-text-muted tracking-wider">{kpi.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Domain entity count */}
          <div className="col-span-2 rounded border border-sx-border-dim bg-sx-panel p-4">
            <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">ENTITY COUNT BY DOMAIN — LIVE</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={domainData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(30,58,95,0.5)" />
                <XAxis dataKey="name" tick={{ fill: "#475569", fontFamily: "'Share Tech Mono', monospace", fontSize: 9 }} />
                <YAxis tick={{ fill: "#475569", fontFamily: "'Share Tech Mono', monospace", fontSize: 9 }} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="count" name="Total" radius={[2, 2, 0, 0]}>
                  {domainData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.7} />)}
                </Bar>
                <Bar dataKey="crit" name="Critical" radius={[2, 2, 0, 0]} fill="#ef4444" fillOpacity={0.9} />
                <Bar dataKey="anom" name="Anomalies" radius={[2, 2, 0, 0]} fill="#ec4899" fillOpacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Severity pie */}
          <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
            <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">SEVERITY DISTRIBUTION</div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={severityData.filter(d => d.value > 0)}
                  cx="50%" cy="50%" innerRadius={38} outerRadius={68}
                  paddingAngle={2} dataKey="value"
                >
                  {severityData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 mt-1">
              {severityData.filter(d => d.value > 0).map(d => (
                <div key={d.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm" style={{ background: d.color }} />
                    <span className="font-mono text-[9px] text-sx-text-muted">{d.name}</span>
                  </div>
                  <span className="font-mono text-[9px] text-sx-text">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Domain threat + anomaly radar */}
          <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
            <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">DOMAIN THREAT + ANOMALY RADAR</div>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(30,58,95,0.6)" />
                <PolarAngleAxis dataKey="domain" tick={{ fill: "#475569", fontFamily: "Share Tech Mono", fontSize: 8 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#334155", fontSize: 7 }} />
                <Radar name="Threat Level" dataKey="threat" stroke="#00d4ff" fill="#00d4ff" fillOpacity={0.12} strokeWidth={1.5} />
                <Radar name="Anomaly Rate" dataKey="anomaly" stroke="#ec4899" fill="#ec4899" fillOpacity={0.08} strokeWidth={1} strokeDasharray="3 2" />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: "#475569" }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Anomaly distribution bar */}
          <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
            <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">ANOMALY FLAGS BY DOMAIN</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={anomalyData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(30,58,95,0.5)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#475569", fontFamily: "Share Tech Mono", fontSize: 9 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#475569", fontFamily: "Share Tech Mono", fontSize: 9 }} width={45} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="anomalies" name="Anomalies" radius={[0, 2, 2, 0]}>
                  {anomalyData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.8} />)}
                </Bar>
                <Bar dataKey="total" name="Total" radius={[0, 2, 2, 0]} fill="#1e3a5f" fillOpacity={0.5} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cross-domain severity heatmap */}
        <div className="rounded border border-sx-border-dim bg-sx-panel overflow-hidden">
          <div className="px-4 py-2.5 border-b border-sx-border-dim flex items-center justify-between" style={{ background: "#0a0f1e" }}>
            <span className="font-mono text-[10px] text-sx-text-muted tracking-widest">CROSS-DOMAIN SEVERITY HEATMAP</span>
            <div className="flex items-center gap-1">
              {(["count", "severity"] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setHeatmapMode(mode)}
                  className="px-2 py-0.5 rounded font-mono text-[8px] uppercase transition-all"
                  style={{
                    background: heatmapMode === mode ? "rgba(0,212,255,0.1)" : "transparent",
                    color: heatmapMode === mode ? "#00d4ff" : "#475569",
                    border: `1px solid ${heatmapMode === mode ? "rgba(0,212,255,0.25)" : "transparent"}`,
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4">
            {/* Column headers */}
            <div className="grid mb-1" style={{ gridTemplateColumns: "80px repeat(5, 1fr)" }}>
              <div />
              {SEV_ORDER.map(sev => (
                <div key={sev} className="text-center">
                  <span className="font-mono text-[8px]" style={{ color: SEV_BG[sev] }}>{sev}</span>
                </div>
              ))}
            </div>
            {/* Rows */}
            <div className="space-y-1">
              {heatmapData.map((row, ri) => {
                const maxVal = Math.max(...SEV_ORDER.map(s => (row[s] as number) || 0));
                return (
                  <div key={ri} className="grid items-center gap-1" style={{ gridTemplateColumns: "80px repeat(5, 1fr)" }}>
                    <span className="font-mono text-[8px] text-sx-text-muted truncate">{row.domain}</span>
                    {SEV_ORDER.map(sev => {
                      const val = (row[sev] as number) ?? 0;
                      const intensity = maxVal > 0 ? val / maxVal : 0;
                      const bg = SEV_BG[sev];
                      return (
                        <div
                          key={sev}
                          className="h-8 rounded flex items-center justify-center transition-all"
                          title={`${row.domain} ${sev}: ${val}`}
                          style={{
                            background: val > 0 ? `${bg}${Math.round(intensity * 60 + 10).toString(16).padStart(2, "0")}` : "rgba(15,32,64,0.4)",
                            border: `1px solid ${val > 0 ? `${bg}30` : "rgba(30,58,95,0.3)"}`,
                          }}
                        >
                          <span className="font-mono text-[9px] font-bold" style={{ color: val > 0 ? bg : "#1e3a5f" }}>
                            {val > 0 ? val : "·"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-4 mt-3">
              <span className="font-mono text-[8px] text-sx-text-muted">INTENSITY:</span>
              <div className="flex items-center gap-1">
                <div className="w-4 h-2 rounded" style={{ background: "rgba(15,32,64,0.8)" }} />
                <span className="font-mono text-[7px] text-sx-text-muted">0</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-2 rounded" style={{ background: "rgba(239,68,68,0.25)" }} />
                <span className="font-mono text-[7px] text-sx-text-muted">LOW</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-2 rounded" style={{ background: "rgba(239,68,68,0.7)" }} />
                <span className="font-mono text-[7px] text-sx-text-muted">HIGH</span>
              </div>
            </div>
          </div>
        </div>

        {/* Confidence vs severity scatter */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
            <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">
              CONFIDENCE × SEVERITY SCATTER — {scatterData.length} ENTITIES
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ScatterChart margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(30,58,95,0.5)" />
                <XAxis dataKey="confidence" name="Confidence %" type="number" domain={[0, 100]}
                  tick={{ fill: "#475569", fontFamily: "Share Tech Mono", fontSize: 8 }}
                  label={{ value: "CONFIDENCE %", position: "insideBottom", offset: -2, fill: "#334155", fontFamily: "Share Tech Mono", fontSize: 8 }}
                />
                <YAxis dataKey="sevScore" name="Severity Score" type="number" domain={[0, 110]}
                  tick={{ fill: "#475569", fontFamily: "Share Tech Mono", fontSize: 8 }}
                />
                <ZAxis range={[20, 60]} />
                <Tooltip {...TOOLTIP_STYLE} cursor={{ strokeDasharray: "3 3", stroke: "#1e3a5f" }}
                  content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="rounded px-2 py-1.5" style={{ background: "#0d1424", border: "1px solid #1e3a5f" }}>
                        <div className="font-mono text-[8px] text-sx-cyan">{d?.domain?.toUpperCase()}</div>
                        <div className="font-mono text-[8px] text-sx-text-muted">Conf: {d?.confidence}% | Sev: {d?.sevScore}</div>
                        {d?.anomaly ? <div className="font-mono text-[8px]" style={{ color: "#ec4899" }}>⚠ ANOMALY</div> : null}
                      </div>
                    );
                  }}
                />
                {/* Normal entities */}
                <Scatter
                  data={scatterData.filter(d => !d.anomaly)}
                  fill="#00d4ff" fillOpacity={0.4} name="Normal"
                />
                {/* Anomaly entities */}
                <Scatter
                  data={scatterData.filter(d => d.anomaly)}
                  fill="#ec4899" fillOpacity={0.8} name="Anomaly"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Threat level area chart — derived from entity severity scores */}
          <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
            <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">ENTITY SEVERITY PROFILE — TOP 10 DOMAINS</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={domainData.sort((a, b) => b.crit - a.crit).slice(0, 10)}
                margin={{ top: 5, right: 5, bottom: 0, left: -20 }}
              >
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(30,58,95,0.5)" />
                <XAxis dataKey="name" tick={{ fill: "#475569", fontFamily: "Share Tech Mono", fontSize: 9 }} />
                <YAxis tick={{ fill: "#475569", fontFamily: "Share Tech Mono", fontSize: 9 }} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="high" name="High" stackId="a" fill="#f59e0b" fillOpacity={0.8} radius={[0,0,0,0]} />
                <Bar dataKey="crit" name="Critical" stackId="a" fill="#ef4444" fillOpacity={0.9} radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Source reliability matrix */}
        <div className="rounded border border-sx-border-dim bg-sx-panel overflow-hidden">
          <div className="px-4 py-2.5 border-b border-sx-border-dim flex items-center justify-between" style={{ background: "#0a0f1e" }}>
            <span className="font-mono text-[10px] text-sx-text-muted tracking-widest">SOURCE RELIABILITY MATRIX</span>
            <button
              onClick={() => { exportCSV(sourceData, "sentinel-x-sources.csv"); toast.success("Source data exported"); }}
              className="font-mono text-[9px] text-sx-text-muted hover:text-sx-cyan transition-colors"
            >
              ↓ CSV
            </button>
          </div>
          <div className="divide-y divide-sx-border-dim">
            {sourceData.map(src => (
              <div key={src.source} className="px-4 py-2.5 grid items-center gap-4" style={{ gridTemplateColumns: "100px 1fr 1fr 60px" }}>
                <span className="font-mono text-[10px] font-bold text-sx-cyan">{src.source}</span>
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-[8px] text-sx-text-muted">FRESHNESS</span>
                    <span className="font-mono text-[9px] text-sx-text">{src.freshness}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-sx-border-dim overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${src.freshness}%`, background: src.freshness > 90 ? "#10b981" : src.freshness > 75 ? "#f59e0b" : "#ef4444" }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-[8px] text-sx-text-muted">CONFIDENCE</span>
                    <span className="font-mono text-[9px] text-sx-text">{src.confidence}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-sx-border-dim overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${src.confidence}%`, background: "#00d4ff", opacity: 0.6 }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-lg font-bold text-sx-text">{src.entities}</div>
                  <div className="font-mono text-[8px] text-sx-text-muted">ENTITIES</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Export row */}
        <div className="rounded border border-sx-border-dim p-4 flex items-center justify-between" style={{ background: "rgba(0,212,255,0.03)" }}>
          <div>
            <div className="font-mono text-[10px] text-sx-cyan tracking-widest mb-0.5">EXPORT OPTIONS</div>
            <div className="font-mono text-[9px] text-sx-text-muted">Export current intelligence snapshot for reporting and archiving</div>
          </div>
          <div className="flex items-center gap-2">
            {[
              { label: "EXPORT ENTITIES CSV", handler: handleExportCSV,       color: "#00d4ff" },
              { label: "EXPORT EVENTS CSV",   handler: handleExportEventsCSV, color: "#a855f7" },
              { label: "EXPORT PDF REPORT",   handler: handleExportPDF,       color: "#ef4444" },
            ].map(({ label, handler, color }) => (
              <button
                key={label}
                onClick={handler}
                className="px-4 py-2 rounded font-mono text-[10px] font-bold transition-all"
                style={{ background: `${color}10`, border: `1px solid ${color}30`, color }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = `${color}1a`)}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = `${color}10`)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
