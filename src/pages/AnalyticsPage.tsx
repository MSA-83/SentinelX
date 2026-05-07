// src/pages/AnalyticsPage.tsx
// Analytics dashboard with Recharts charts, source reliability, and CSV/PDF export

import { useMemo, useCallback } from "react";
import { useEntityStream } from "@/hooks/useEntityStream";
import { computeThreatAssessment, severityToColor } from "@/lib/threatAssessor";
import { DOMAIN_CONFIGS, DOMAIN_ORDER } from "@/constants/domains";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { toast } from "sonner";

// ─── Source data ─────────────────────────────────────────────────────────────

const SOURCE_DATA = [
  { source: "ADS-B", freshness: 98, confidence: 95, entities: 65 },
  { source: "AISStream", freshness: 96, confidence: 90, entities: 48 },
  { source: "CelesTrak", freshness: 88, confidence: 99, entities: 32 },
  { source: "ACLED", freshness: 75, confidence: 78, entities: 10 },
  { source: "Shodan", freshness: 82, confidence: 72, entities: 5 },
  { source: "USGS", freshness: 99, confidence: 99, entities: 8 },
  { source: "NRO/CTBTO", freshness: 70, confidence: 85, entities: 5 },
  { source: "SIGINT", freshness: 94, confidence: 68, entities: 12 },
];

// Stable 24h event trend (seeded)
const EVENT_TREND = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i.toString().padStart(2, "0")}:00`,
  events: [6, 3, 2, 2, 4, 8, 12, 10, 9, 7, 6, 8, 11, 9, 7, 8, 10, 12, 9, 7, 5, 6, 7, 8][i],
  critical: [1, 0, 0, 0, 1, 2, 3, 2, 1, 1, 1, 2, 3, 2, 1, 1, 2, 3, 2, 1, 0, 1, 1, 2][i],
  high: [2, 1, 1, 1, 2, 3, 5, 4, 3, 3, 2, 3, 5, 3, 3, 3, 4, 5, 3, 3, 2, 2, 3, 3][i],
}));

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

// ─── Export utilities ─────────────────────────────────────────────────────────

function exportCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => JSON.stringify(row[h] ?? "")).join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(title: string, content: string) {
  const html = `<!DOCTYPE html><html><head>
    <title>${title}</title>
    <style>
      body { font-family: monospace; background: #020617; color: #e2e8f0; padding: 40px; }
      h1 { color: #00d4ff; font-size: 20px; border-bottom: 1px solid #1e3a5f; padding-bottom: 10px; }
      h2 { color: #94a3b8; font-size: 14px; margin-top: 20px; }
      pre { font-size: 11px; line-height: 1.6; color: #94a3b8; white-space: pre-wrap; }
      .classified { color: #ef4444; font-size: 10px; text-align: center; margin-bottom: 20px; }
    </style>
  </head><body>
    <div class="classified">⚠ TOP SECRET // SENTINEL // NOFORN ⚠</div>
    <h1>${title}</h1>
    <pre>${content}</pre>
    <div class="classified">END OF DOCUMENT // SENTINEL-X PLATFORM // ${new Date().toUTCString()}</div>
  </body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (w) {
    w.onload = () => {
      w.print();
      URL.revokeObjectURL(url);
    };
  }
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const { entities, events, latencyMs, messageRate } = useEntityStream();
  const assessment = useMemo(() => computeThreatAssessment(entities), [entities]);

  const domainData = DOMAIN_ORDER.map((d) => {
    const cfg = DOMAIN_CONFIGS[d];
    const count = entities.filter((e) => e.domain === d).length;
    const crit = entities.filter((e) => e.domain === d && e.severity === "CRITICAL").length;
    const anom = entities.filter((e) => e.domain === d && e.anomalyFlag).length;
    return { name: cfg.shortLabel, fullName: cfg.label, count, crit, anom, color: cfg.color };
  });

  const severityData = (["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const).map((sev) => ({
    name: sev,
    value: entities.filter((e) => e.severity === sev).length,
    color: severityToColor(sev),
  }));

  // Radar chart data for domain threat levels
  const radarData = DOMAIN_ORDER.map((d) => {
    const cfg = DOMAIN_CONFIGS[d];
    const level = assessment.domainThreatLevels?.[d] ?? "INFO";
    const score = ({ CRITICAL: 100, HIGH: 75, MEDIUM: 50, LOW: 25, INFO: 10 } as Record<string, number>)[level] ?? 0;
    return { domain: cfg.shortLabel, score };
  });

  const handleExportCSV = useCallback(() => {
    const rows = entities.map((e) => ({
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
    toast.success(`Exported ${rows.length} entity records to CSV`);
  }, [entities]);

  const handleExportPDF = useCallback(() => {
    const dtg = new Date().toUTCString();
    const content = [
      `REPORT TYPE  : OPERATIONAL ANALYTICS`,
      `DTG          : ${dtg}`,
      `GENERATED BY : SENTINEL-X PLATFORM v6.3`,
      `CLASSIFICATION: TOP SECRET // SENTINEL // NOFORN`,
      "",
      "═══ GLOBAL THREAT ASSESSMENT ═══",
      `Global Threat Level : ${assessment.globalThreatLevel}`,
      `Threat Index        : ${assessment.threatIndex}/100`,
      `Critical Entities   : ${assessment.criticalEntityCount}`,
      `Anomaly Count       : ${assessment.anomalyCount}`,
      `Active Crisis Zones : ${assessment.activeCrisisZones.join(", ") || "None"}`,
      "",
      "═══ ENTITY STATISTICS ═══",
      `Total Entities      : ${entities.length}`,
      `Total Events        : ${events.length}`,
      `Unacknowledged      : ${events.filter((e) => !e.acknowledged).length}`,
      `Stream Latency      : ${latencyMs}ms`,
      `Message Rate        : ${messageRate}/s`,
      "",
      "═══ DOMAIN BREAKDOWN ═══",
      ...domainData.map(
        (d) =>
          `${d.fullName.padEnd(24)} : ${String(d.count).padStart(4)} entities / ${String(d.crit).padStart(3)} critical / ${String(d.anom).padStart(3)} anomalies`
      ),
      "",
      "═══ SEVERITY DISTRIBUTION ═══",
      ...severityData.map((s) => `${s.name.padEnd(12)} : ${s.value}`),
      "",
      "═══ SOURCE RELIABILITY ═══",
      ...SOURCE_DATA.map(
        (s) =>
          `${s.source.padEnd(14)} : freshness=${s.freshness}% / confidence=${s.confidence}% / entities=${s.entities}`
      ),
    ].join("\n");

    exportPDF("SENTINEL-X OPERATIONAL ANALYTICS REPORT", content);
    toast.success("PDF report opened for printing");
  }, [assessment, entities, events, latencyMs, messageRate, domainData, severityData]);

  const handleExportEventsCSV = useCallback(() => {
    const rows = events.map((e) => ({
      id: e.id,
      domain: e.domain,
      severity: e.severity,
      title: e.title,
      description: e.description,
      timestamp: e.ts,
      acknowledged: e.acknowledged ? "YES" : "NO",
    }));
    exportCSV(rows, `sentinel-x-events-${new Date().toISOString().split("T")[0]}.csv`);
    toast.success(`Exported ${rows.length} event records to CSV`);
  }, [events]);

  return (
    <div className="flex flex-col h-full bg-sx-bg overflow-hidden">
      {/* Header */}
      <div
        className="flex-shrink-0 border-b border-sx-border px-6 py-3 flex items-center justify-between"
        style={{ background: "#0d1424" }}
      >
        <div>
          <div className="font-display font-bold text-sx-cyan tracking-widest text-lg">ANALYTICS</div>
          <div className="font-mono text-[9px] text-sx-text-muted">
            OPERATIONAL METRICS // DATA QUALITY // TREND ANALYSIS
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Metrics */}
          <div className="flex items-center gap-4 mr-2">
            {[
              { label: "ENTITIES", value: entities.length, color: "#00d4ff" },
              { label: "MSG/S", value: messageRate, color: "#10b981" },
              { label: "LATENCY", value: `${latencyMs}ms`, color: "#f59e0b" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div className="font-mono font-bold text-lg leading-none" style={{ color }}>
                  {value}
                </div>
                <div className="font-mono text-[9px] text-sx-text-muted">{label}</div>
              </div>
            ))}
          </div>

          {/* Export buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded font-mono text-[9px] transition-all flex items-center gap-1.5"
              style={{
                background: "rgba(0,212,255,0.08)",
                border: "1px solid rgba(0,212,255,0.25)",
                color: "#00d4ff",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(0,212,255,0.15)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(0,212,255,0.08)")}
            >
              ↓ CSV
            </button>
            <button
              onClick={handleExportEventsCSV}
              className="px-3 py-1.5 rounded font-mono text-[9px] transition-all"
              style={{
                background: "rgba(168,85,247,0.08)",
                border: "1px solid rgba(168,85,247,0.25)",
                color: "#a855f7",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(168,85,247,0.15)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(168,85,247,0.08)")}
            >
              ↓ EVENTS
            </button>
            <button
              onClick={handleExportPDF}
              className="px-3 py-1.5 rounded font-mono text-[9px] transition-all"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "#ef4444",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.15)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.08)")}
            >
              ↓ PDF REPORT
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "TOTAL ENTITIES", value: entities.length, color: "#00d4ff" },
            { label: "CRITICAL", value: assessment.criticalEntityCount, color: "#ef4444" },
            { label: "ANOMALIES", value: assessment.anomalyCount, color: "#ec4899" },
            { label: "TOTAL EVENTS", value: events.length, color: "#a855f7" },
            { label: "UNACKED ALERTS", value: events.filter((e) => !e.acknowledged).length, color: "#f59e0b" },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded border border-sx-border-dim bg-sx-panel p-3">
              <div
                className="font-mono text-2xl font-bold mb-0.5"
                style={{ color: kpi.color, textShadow: `0 0 12px ${kpi.color}40` }}
              >
                {kpi.value}
              </div>
              <div className="font-mono text-[9px] text-sx-text-muted tracking-wider">{kpi.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Domain distribution bar chart */}
          <div className="col-span-2 rounded border border-sx-border-dim bg-sx-panel p-4">
            <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">
              ENTITY COUNT BY DOMAIN
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={domainData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(30,58,95,0.5)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#475569", fontFamily: "'Share Tech Mono', monospace", fontSize: 9 }}
                />
                <YAxis
                  tick={{ fill: "#475569", fontFamily: "'Share Tech Mono', monospace", fontSize: 9 }}
                />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="count" name="Total" radius={[2, 2, 0, 0]}>
                  {domainData.map((d, i) => (
                    <Cell key={i} fill={d.color} fillOpacity={0.7} />
                  ))}
                </Bar>
                <Bar dataKey="crit" name="Critical" radius={[2, 2, 0, 0]} fill="#ef4444" fillOpacity={0.9} />
                <Bar dataKey="anom" name="Anomalies" radius={[2, 2, 0, 0]} fill="#ec4899" fillOpacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Severity pie */}
          <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
            <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">
              SEVERITY DISTRIBUTION
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={severityData.filter((d) => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={38}
                  outerRadius={68}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {severityData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 mt-1">
              {severityData.filter((d) => d.value > 0).map((d) => (
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
          {/* 24h event trend */}
          <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
            <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">
              24H EVENT ACTIVITY TREND
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart
                data={EVENT_TREND}
                margin={{ top: 5, right: 0, bottom: 0, left: -20 }}
              >
                <defs>
                  <linearGradient id="evGrad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="evGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(30,58,95,0.5)" />
                <XAxis
                  dataKey="hour"
                  tick={{ fill: "#334155", fontFamily: "'Share Tech Mono', monospace", fontSize: 8 }}
                  interval={3}
                />
                <YAxis
                  tick={{ fill: "#334155", fontFamily: "'Share Tech Mono', monospace", fontSize: 8 }}
                />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend
                  wrapperStyle={{
                    fontFamily: "'Share Tech Mono', monospace",
                    fontSize: 9,
                    color: "#475569",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="events"
                  name="All Events"
                  stroke="#a855f7"
                  strokeWidth={1.5}
                  fill="url(#evGrad1)"
                />
                <Area
                  type="monotone"
                  dataKey="critical"
                  name="Critical"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  fill="url(#evGrad2)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Domain threat radar */}
          <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
            <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">
              DOMAIN THREAT RADAR
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(30,58,95,0.6)" />
                <PolarAngleAxis
                  dataKey="domain"
                  tick={{ fill: "#475569", fontFamily: "'Share Tech Mono', monospace", fontSize: 8 }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fill: "#334155", fontSize: 7 }}
                />
                <Radar
                  name="Threat Level"
                  dataKey="score"
                  stroke="#00d4ff"
                  fill="#00d4ff"
                  fillOpacity={0.12}
                  strokeWidth={1.5}
                />
                <Tooltip {...TOOLTIP_STYLE} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Source reliability matrix */}
        <div className="rounded border border-sx-border-dim bg-sx-panel overflow-hidden">
          <div
            className="px-4 py-2.5 border-b border-sx-border-dim flex items-center justify-between"
            style={{ background: "#0a0f1e" }}
          >
            <span className="font-mono text-[10px] text-sx-text-muted tracking-widest">
              SOURCE RELIABILITY MATRIX
            </span>
            <button
              onClick={() => {
                exportCSV(SOURCE_DATA, "sentinel-x-sources.csv");
                toast.success("Source data exported");
              }}
              className="font-mono text-[9px] text-sx-text-muted hover:text-sx-cyan transition-colors"
            >
              ↓ CSV
            </button>
          </div>
          <div className="divide-y divide-sx-border-dim">
            {SOURCE_DATA.map((src) => (
              <div
                key={src.source}
                className="px-4 py-2.5 grid items-center gap-4"
                style={{ gridTemplateColumns: "100px 1fr 1fr 60px" }}
              >
                <span className="font-mono text-[10px] font-bold text-sx-cyan">{src.source}</span>
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-[8px] text-sx-text-muted">FRESHNESS</span>
                    <span className="font-mono text-[9px] text-sx-text">{src.freshness}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-sx-border-dim overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${src.freshness}%`,
                        background: src.freshness > 90 ? "#10b981" : src.freshness > 75 ? "#f59e0b" : "#ef4444",
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-[8px] text-sx-text-muted">CONFIDENCE</span>
                    <span className="font-mono text-[9px] text-sx-text">{src.confidence}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-sx-border-dim overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sx-cyan-dim"
                      style={{ width: `${src.confidence}%` }}
                    />
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

        {/* Export summary */}
        <div
          className="rounded border border-sx-border-dim p-4 flex items-center justify-between"
          style={{ background: "rgba(0,212,255,0.03)" }}
        >
          <div>
            <div className="font-mono text-[10px] text-sx-cyan tracking-widest mb-0.5">EXPORT OPTIONS</div>
            <div className="font-mono text-[9px] text-sx-text-muted">
              Export current intelligence snapshot for reporting and archiving
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 rounded font-mono text-[10px] font-bold transition-all"
              style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: "#00d4ff" }}
            >
              EXPORT ENTITIES CSV
            </button>
            <button
              onClick={handleExportEventsCSV}
              className="px-4 py-2 rounded font-mono text-[10px] font-bold transition-all"
              style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)", color: "#a855f7" }}
            >
              EXPORT EVENTS CSV
            </button>
            <button
              onClick={handleExportPDF}
              className="px-4 py-2 rounded font-mono text-[10px] font-bold transition-all"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}
            >
              EXPORT PDF REPORT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
