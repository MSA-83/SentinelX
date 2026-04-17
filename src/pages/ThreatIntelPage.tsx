// src/pages/ThreatIntelPage.tsx
import { useMemo, useState } from "react";
import { useEntityStream } from "@/hooks/useEntityStream";
import { computeThreatAssessment, severityToColor } from "@/lib/threatAssessor";
import { DOMAIN_CONFIGS, DOMAIN_ORDER } from "@/constants/domains";
import type { SeverityLevel } from "@/types/entities";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

export function ThreatIntelPage() {
  const { entities, events } = useEntityStream();
  const assessment = useMemo(() => computeThreatAssessment(entities), [entities]);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  // Radar data
  const radarData = DOMAIN_ORDER.map((domain) => {
    const cfg = DOMAIN_CONFIGS[domain];
    const level = assessment.domainThreatLevels?.[domain];
    const score = ({ CRITICAL: 100, HIGH: 75, MEDIUM: 50, LOW: 25, INFO: 5 } as Record<string, number>)[level ?? "INFO"] ?? 0;
    return { domain: cfg.shortLabel, score, fullMark: 100, color: cfg.color };
  });

  // Trend simulation
  const trendData = Array.from({ length: 24 }, (_, i) => ({
    time: `${(i).toString().padStart(2, "0")}:00Z`,
    index: Math.max(10, assessment.threatIndex + Math.sin(i * 0.5) * 15 + Math.random() * 8 - 4),
    events: Math.floor(Math.random() * 8 + 1),
  }));

  // Entity breakdown
  const domainBreakdown = DOMAIN_ORDER.map((domain) => {
    const cfg = DOMAIN_CONFIGS[domain];
    const domEntities = entities.filter((e) => e.domain === domain);
    const crit = domEntities.filter((e) => e.severity === "CRITICAL").length;
    const high = domEntities.filter((e) => e.severity === "HIGH").length;
    const anom = domEntities.filter((e) => e.anomalyFlag).length;
    const level = assessment.domainThreatLevels?.[domain] ?? "INFO";
    return { domain, cfg, total: domEntities.length, crit, high, anom, level };
  });

  return (
    <div className="flex flex-col h-full bg-sx-bg overflow-hidden">
      {/* Page header */}
      <div className="flex-shrink-0 border-b border-sx-border px-6 py-3 flex items-center justify-between" style={{ background: "#0d1424" }}>
        <div>
          <div className="font-display font-bold text-sx-cyan tracking-widest text-lg">THREAT INTELLIGENCE</div>
          <div className="font-mono text-[9px] text-sx-text-muted">MULTI-DOMAIN THREAT ASSESSMENT // COMPOSITE ANALYSIS</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="font-mono font-bold text-2xl" style={{ color: severityToColor(assessment.globalThreatLevel) }}>
              {assessment.threatIndex}
            </div>
            <div className="font-mono text-[9px] text-sx-text-muted">THREAT INDEX</div>
          </div>
          <div
            className="font-mono text-sm font-bold px-3 py-1.5 rounded border"
            style={{
              color: severityToColor(assessment.globalThreatLevel),
              borderColor: `${severityToColor(assessment.globalThreatLevel)}40`,
              background: `${severityToColor(assessment.globalThreatLevel)}10`,
            }}
          >
            {assessment.globalThreatLevel}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Top stats row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "CRITICAL ENTITIES", value: assessment.criticalEntityCount, color: "#ef4444" },
            { label: "HIGH PRIORITY", value: assessment.highEntityCount, color: "#f59e0b" },
            { label: "ANOMALIES FLAGGED", value: assessment.anomalyCount, color: "#ec4899" },
            { label: "ACTIVE CRISIS ZONES", value: assessment.activeCrisisZones.length, color: "#00d4ff" },
          ].map((stat) => (
            <div key={stat.label} className="rounded border border-sx-border-dim bg-sx-panel p-4">
              <div className="font-mono text-3xl font-bold mb-1" style={{ color: stat.color, textShadow: `0 0 12px ${stat.color}60` }}>
                {stat.value}
              </div>
              <div className="font-mono text-[9px] text-sx-text-muted tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Threat radar chart */}
          <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
            <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">MULTI-DOMAIN RADAR</div>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="rgba(30,58,95,0.8)" />
                <PolarAngleAxis
                  dataKey="domain"
                  tick={{ fill: "#475569", fontFamily: "Share Tech Mono", fontSize: 9, letterSpacing: "0.1em" }}
                />
                <Radar
                  name="Threat"
                  dataKey="score"
                  stroke="#00d4ff"
                  fill="rgba(0,212,255,0.12)"
                  strokeWidth={1.5}
                  dot={{ r: 3, fill: "#00d4ff" }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* 24h threat trend */}
          <div className="rounded border border-sx-border-dim bg-sx-panel p-4">
            <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">24H THREAT INDEX TREND</div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="threatGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={severityToColor(assessment.globalThreatLevel)} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={severityToColor(assessment.globalThreatLevel)} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(30,58,95,0.5)" />
                <XAxis dataKey="time" tick={{ fill: "#334155", fontFamily: "Share Tech Mono", fontSize: 8 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#334155", fontFamily: "Share Tech Mono", fontSize: 8 }} />
                <Tooltip
                  contentStyle={{ background: "#0d1424", border: "1px solid #1e3a5f", borderRadius: 2, fontFamily: "Share Tech Mono", fontSize: 10 }}
                  labelStyle={{ color: "#475569" }}
                  itemStyle={{ color: "#00d4ff" }}
                />
                <Area
                  type="monotone"
                  dataKey="index"
                  stroke={severityToColor(assessment.globalThreatLevel)}
                  strokeWidth={1.5}
                  fill="url(#threatGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Domain threat matrix */}
        <div className="rounded border border-sx-border-dim bg-sx-panel overflow-hidden">
          <div className="px-4 py-2 border-b border-sx-border-dim bg-sx-surface flex items-center justify-between">
            <span className="font-mono text-[10px] text-sx-text-muted tracking-widest">DOMAIN THREAT MATRIX</span>
            <span className="font-mono text-[9px] text-sx-text-muted">{entities.length} ENTITIES TRACKED</span>
          </div>
          <div className="divide-y divide-sx-border-dim">
            {domainBreakdown.map(({ domain, cfg, total, crit, high, anom, level }) => {
              const color = severityToColor(level as SeverityLevel);
              const pct = ({ CRITICAL: 100, HIGH: 75, MEDIUM: 50, LOW: 25, INFO: 5 } as Record<string, number>)[level] ?? 0;
              const isSelected = selectedDomain === domain;
              return (
                <button
                  key={domain}
                  onClick={() => setSelectedDomain(isSelected ? null : domain)}
                  className="w-full px-4 py-3 flex items-center gap-4 hover:bg-sx-surface/60 transition-all text-left"
                  style={{ borderLeft: isSelected ? `2px solid ${color}` : "2px solid transparent" }}
                >
                  <span className="text-xl flex-shrink-0">{cfg.icon}</span>
                  <div className="w-24 flex-shrink-0">
                    <div className="font-mono text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</div>
                    <div className="font-mono text-[9px] text-sx-text-muted">{cfg.shortLabel}</div>
                  </div>
                  <div className="flex-1">
                    <div className="h-1.5 rounded-full bg-sx-border-dim overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}60` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="text-center">
                      <div className="font-mono text-xs font-bold text-sx-text">{total}</div>
                      <div className="font-mono text-[8px] text-sx-text-muted">TOTAL</div>
                    </div>
                    <div className="text-center">
                      <div className="font-mono text-xs font-bold" style={{ color: "#ef4444" }}>{crit}</div>
                      <div className="font-mono text-[8px] text-sx-text-muted">CRIT</div>
                    </div>
                    <div className="text-center">
                      <div className="font-mono text-xs font-bold" style={{ color: "#f59e0b" }}>{high}</div>
                      <div className="font-mono text-[8px] text-sx-text-muted">HIGH</div>
                    </div>
                    <div className="text-center">
                      <div className="font-mono text-xs font-bold" style={{ color: "#ec4899" }}>{anom}</div>
                      <div className="font-mono text-[8px] text-sx-text-muted">ANOM</div>
                    </div>
                    <div
                      className="font-mono text-[10px] font-bold px-2 py-0.5 rounded w-20 text-center"
                      style={{ color, background: `${color}12`, border: `1px solid ${color}30` }}
                    >
                      {level}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active crisis zones */}
        {assessment.activeCrisisZones.length > 0 && (
          <div className="rounded border border-sx-red/30 bg-sx-red/5 p-4">
            <div className="font-mono text-[10px] text-sx-red tracking-widest mb-3">⚡ ACTIVE CRISIS ZONES</div>
            <div className="grid grid-cols-2 gap-2">
              {assessment.activeCrisisZones.map((zone) => (
                <div key={zone} className="flex items-center gap-2 px-3 py-2 rounded" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <div className="w-2 h-2 rounded-full bg-sx-red flex-shrink-0" style={{ boxShadow: "0 0 6px #ef4444", animation: "pulse 2s infinite" }} />
                  <span className="font-mono text-[10px] text-sx-red/80">{zone}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent critical events */}
        <div className="rounded border border-sx-border-dim bg-sx-panel overflow-hidden">
          <div className="px-4 py-2 border-b border-sx-border-dim bg-sx-surface">
            <span className="font-mono text-[10px] text-sx-text-muted tracking-widest">RECENT CRITICAL EVENTS</span>
          </div>
          <div className="divide-y divide-sx-border-dim">
            {events.filter((e) => e.severity === "CRITICAL" || e.severity === "HIGH").slice(0, 8).map((evt) => {
              const cfg = DOMAIN_CONFIGS[evt.domain];
              const color = severityToColor(evt.severity);
              const ts = new Date(evt.ts).toUTCString().split(" ")[4] + "Z";
              return (
                <div key={evt.id} className="px-4 py-2.5 flex items-start gap-3">
                  <span className="text-base flex-shrink-0">{cfg?.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[10px] font-bold" style={{ color }}>{evt.title}</div>
                    <div className="font-mono text-[9px] text-sx-text-muted truncate">{evt.description}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-mono text-[8px]" style={{ color }}>{evt.severity}</span>
                    <span className="font-mono text-[8px] text-sx-text-muted">{ts}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
