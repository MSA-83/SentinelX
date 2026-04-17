// src/pages/AnalyticsPage.tsx
import { useMemo } from "react";
import { useEntityStream } from "@/hooks/useEntityStream";
import { computeThreatAssessment, severityToColor } from "@/lib/threatAssessor";
import { DOMAIN_CONFIGS, DOMAIN_ORDER } from "@/constants/domains";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Legend,
} from "recharts";

export function AnalyticsPage() {
  const { entities, events, latencyMs, messageRate } = useEntityStream();
  const assessment = useMemo(() => computeThreatAssessment(entities), [entities]);

  // Domain distribution data
  const domainData = DOMAIN_ORDER.map((d) => {
    const cfg = DOMAIN_CONFIGS[d];
    const count = entities.filter((e) => e.domain === d).length;
    const crit = entities.filter((e) => e.domain === d && e.severity === "CRITICAL").length;
    return { name: cfg.shortLabel, count, crit, color: cfg.color };
  });

  // Severity distribution
  const severityData = (["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const).map((sev) => ({
    name: sev,
    value: entities.filter((e) => e.severity === sev).length,
    color: severityToColor(sev),
  }));

  // Classification distribution
  const classData = ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"].map((cl) => ({
    name: cl.replace("_", " "),
    value: entities.filter((e) => e.classification === cl).length,
    color: { UNCLASSIFIED: "#10b981", CONFIDENTIAL: "#3b82f6", SECRET: "#f59e0b", TOP_SECRET: "#ef4444" }[cl] ?? "#475569",
  }));

  // 24h event trend (simulated)
  const eventTrend = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i.toString().padStart(2, "0")}:00`,
    events: Math.floor(Math.random() * 12 + 1),
    critical: Math.floor(Math.random() * 3),
    high: Math.floor(Math.random() * 5),
  }));

  // Source reliability
  const sourceData = [
    { source: "ADS-B", freshness: 98, confidence: 95, entities: 65 },
    { source: "AISStream", freshness: 96, confidence: 90, entities: 48 },
    { source: "CelesTrak", freshness: 88, confidence: 99, entities: 32 },
    { source: "ACLED", freshness: 75, confidence: 78, entities: 10 },
    { source: "Shodan", freshness: 82, confidence: 72, entities: 5 },
    { source: "USGS", freshness: 99, confidence: 99, entities: 8 },
    { source: "NRO/CTBTO", freshness: 70, confidence: 85, entities: 5 },
    { source: "SIGINT", freshness: 94, confidence: 68, entities: 12 },
  ];

  const tooltipStyle = {
    contentStyle: { background: "#0d1424", border: "1px solid #1e3a5f", borderRadius: 2, fontFamily: "Share Tech Mono", fontSize: 10 },
    labelStyle: { color: "#475569" },
    itemStyle: { color: "#94a3b8" },
  };

  return (
    <div className="flex flex-col h-full bg-sx-bg overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-sx-border px-6 py-3 flex items-center justify-between" style={{ background: "#0d1424" }}>
        <div>
          <div className="font-display font-bold text-sx-cyan tracking-widest text-lg">ANALYTICS</div>
          <div className="font-mono text-[9px] text-sx-text-muted">OPERATIONAL METRICS // DATA QUALITY // TREND ANALYSIS</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="font-mono font-bold text-lg text-sx-cyan">{entities.length}</div>
            <div className="font-mono text-[9px] text-sx-text-muted">ENTITIES</div>
          </div>
          <div className="text-center">
            <div className="font-mono font-bold text-lg text-sx-green">{messageRate}/s</div>
            <div className="font-mono text-[9px] text-sx-text-muted">MSG RATE</div>
          </div>
          <div className="text-center">
            <div className="font-mono font-bold text-lg text-sx-amber">{latencyMs}ms</div>
            <div className="font-mono text-[9px] text-sx-text-muted">LATENCY</div>
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
              <div className="font-mono text-2xl font-bold mb-0.5" style={{ color: kpi.color }}>
                {kpi.value}
              </div>
              <div className="font-mono text-[9px] text-sx-text-muted tracking-wider">{kpi.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Domain distribution bar chart */}
          <div className="col-span-2 rounded border border-sx-border-dim bg-sx-panel p-4">
            <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">ENTITY COUNT BY DOMAIN</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={domainData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(30,58,95,0.5)" />
                <XAxis dataKey="name" tick={{ fill: "#475569", fontFamily: "Share Tech Mono", fontSize: 9 }} />
                <YAxis tick={{ fill: "#475569", fontFamily: "Share Tech Mono", fontSize: 9 }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" name="Total" radius={[2, 2, 0, 0]}>
                  {domainData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.7} />)}
                </Bar>
                <Bar dataKey="crit" name="Critical" radius={[2, 2, 0, 0]} fill="#ef4444" fillOpacity={0.9} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Severity pie */}
          <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
            <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">SEVERITY DISTRIBUTION</div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={severityData.filter((d) => d.value > 0)}
                  cx="50%" cy="50%"
                  innerRadius={40} outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {severityData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 mt-2">
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

        {/* Event trend */}
        <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
          <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">24H EVENT ACTIVITY TREND</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={eventTrend} margin={{ top: 5, right: 0, bottom: 0, left: -20 }}>
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
              <XAxis dataKey="hour" tick={{ fill: "#334155", fontFamily: "Share Tech Mono", fontSize: 8 }} />
              <YAxis tick={{ fill: "#334155", fontFamily: "Share Tech Mono", fontSize: 8 }} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontFamily: "Share Tech Mono", fontSize: 9, color: "#475569" }} />
              <Area type="monotone" dataKey="events" name="Events" stroke="#a855f7" strokeWidth={1.5} fill="url(#evGrad1)" />
              <Area type="monotone" dataKey="critical" name="Critical" stroke="#ef4444" strokeWidth={1.5} fill="url(#evGrad2)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Source reliability */}
        <div className="rounded border border-sx-border-dim bg-sx-panel overflow-hidden">
          <div className="px-4 py-2 border-b border-sx-border-dim bg-sx-surface">
            <span className="font-mono text-[10px] text-sx-text-muted tracking-widest">SOURCE RELIABILITY MATRIX</span>
          </div>
          <div className="divide-y divide-sx-border-dim">
            {sourceData.map((src) => (
              <div key={src.source} className="px-4 py-2.5 grid items-center gap-4" style={{ gridTemplateColumns: "100px 1fr 1fr 60px" }}>
                <span className="font-mono text-[10px] font-bold text-sx-cyan">{src.source}</span>
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-[8px] text-sx-text-muted">FRESHNESS</span>
                    <span className="font-mono text-[9px] text-sx-text">{src.freshness}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-sx-border-dim overflow-hidden">
                    <div className="h-full rounded-full bg-sx-green" style={{ width: `${src.freshness}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-[8px] text-sx-text-muted">CONFIDENCE</span>
                    <span className="font-mono text-[9px] text-sx-text">{src.confidence}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-sx-border-dim overflow-hidden">
                    <div className="h-full rounded-full bg-sx-cyan-dim" style={{ width: `${src.confidence}%` }} />
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
      </div>
    </div>
  );
}
