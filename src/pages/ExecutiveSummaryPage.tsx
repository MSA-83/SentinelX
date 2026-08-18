// src/pages/ExecutiveSummaryPage.tsx
import { useMemo, useState, useCallback, useRef } from "react";
import { useEntityStream } from "@/hooks/useEntityStream";
import { computeThreatAssessment, severityToColor } from "@/lib/threatAssessor";
import { DOMAIN_CONFIGS, DOMAIN_ORDER } from "@/constants/domains";
import { ThreatMeter } from "@/components/features/ThreatMeter";
import { supabase } from "@/lib/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface COA {
  action: string;
  priority: "IMMEDIATE" | "URGENT" | "ROUTINE";
  rationale: string;
}

interface DomainItem {
  domain: string;
  assessment: string;
  keyIndicators: string[];
}

interface AIBrief {
  bluf?: string;
  threatNarrative?: string;
  domainAnalysis?: DomainItem[];
  crossDomainCorrelations?: string[];
  anomalyAssessment?: string;
  collectionPriorities?: string[];
  coa?: COA[];
  confidence?: string;
  classification?: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  IMMEDIATE: "#ef4444",
  URGENT:    "#f59e0b",
  ROUTINE:   "#10b981",
};

function exportPDF(title: string, content: string) {
  const html = `<!DOCTYPE html><html><head>
    <title>${title}</title>
    <style>
      body { font-family: monospace; background: #020617; color: #e2e8f0; padding: 40px; }
      h1 { color: #00d4ff; font-size: 20px; border-bottom: 1px solid #1e3a5f; padding-bottom: 10px; }
      pre { font-size: 11px; line-height: 1.8; color: #94a3b8; white-space: pre-wrap; }
      .classified { color: #ef4444; font-size: 10px; text-align: center; margin: 20px 0; letter-spacing: 0.2em; }
      @media print { body { background: white; color: black; } h1 { color: #000; } .classified { color: #cc0000; } pre { color: #333; } }
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
  if (w) { w.onload = () => { w.print(); URL.revokeObjectURL(url); }; }
}

// ─── AI Brief Card ─────────────────────────────────────────────────────────────

function AIBriefCard({ brief, latencyMs, generatedAt }: { brief: AIBrief; latencyMs?: number; generatedAt?: string }) {
  return (
    <div className="rounded border overflow-hidden" style={{ borderColor: "rgba(168,85,247,0.25)", background: "rgba(168,85,247,0.03)" }}>
      {/* Document header */}
      <div className="px-5 py-3 border-b" style={{ borderColor: "rgba(168,85,247,0.15)", background: "rgba(168,85,247,0.05)" }}>
        <div className="text-center font-mono text-[8px] tracking-[0.25em] mb-2" style={{ color: "#ef4444" }}>
          ⚠ {brief.classification ?? "TOP SECRET // SENTINEL // NOFORN"} ⚠
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-widest" style={{ color: "#a855f7" }}>AI-GENERATED THREAT ASSESSMENT</div>
            <div className="font-mono text-[8px] text-sx-text-muted">
              GROQ LLAMA-3.3-70B // {generatedAt ? new Date(generatedAt).toUTCString() : "—"}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {latencyMs != null && (
              <div className="text-center">
                <div className="font-mono text-xs font-bold" style={{ color: "#a855f7" }}>{latencyMs}ms</div>
                <div className="font-mono text-[7px] text-sx-text-muted">LATENCY</div>
              </div>
            )}
            <div className="text-center">
              <div className="font-mono text-xs font-bold" style={{ color: brief.confidence === "HIGH" ? "#10b981" : brief.confidence === "MEDIUM" ? "#f59e0b" : "#ef4444" }}>
                {brief.confidence ?? "?"}
              </div>
              <div className="font-mono text-[7px] text-sx-text-muted">CONFIDENCE</div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* BLUF */}
        {brief.bluf && (
          <div className="rounded p-4" style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.18)" }}>
            <div className="font-mono text-[9px] text-sx-cyan tracking-[0.2em] mb-2 font-bold">⬛ BOTTOM LINE UP FRONT (BLUF)</div>
            <div className="font-mono text-sm leading-relaxed" style={{ color: "#e2e8f0" }}>{brief.bluf}</div>
          </div>
        )}

        {/* Threat Narrative */}
        {brief.threatNarrative && (
          <div>
            <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-2">THREAT NARRATIVE</div>
            <div className="font-mono text-[11px] text-sx-text-dim leading-relaxed border-l-2 pl-3" style={{ borderColor: "rgba(0,212,255,0.3)" }}>
              {brief.threatNarrative}
            </div>
          </div>
        )}

        {/* Domain Analysis */}
        {brief.domainAnalysis && brief.domainAnalysis.length > 0 && (
          <div>
            <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-2">DOMAIN-BY-DOMAIN ANALYSIS</div>
            <div className="grid grid-cols-2 gap-2">
              {brief.domainAnalysis.map((item, i) => (
                <div key={i} className="rounded p-3" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(30,58,95,0.6)" }}>
                  <div className="font-mono text-[9px] text-sx-cyan font-bold uppercase mb-1">{item.domain}</div>
                  <div className="font-mono text-[9px] text-sx-text-dim leading-relaxed mb-1.5">{item.assessment}</div>
                  {item.keyIndicators?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.keyIndicators.map((ind, j) => (
                        <span key={j} className="font-mono text-[7px] px-1 py-0.5 rounded" style={{ background: "rgba(0,212,255,0.06)", color: "#475569", border: "1px solid rgba(0,212,255,0.12)" }}>
                          {ind}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cross-domain correlations */}
        {brief.crossDomainCorrelations && brief.crossDomainCorrelations.length > 0 && (
          <div className="rounded p-4" style={{ background: "rgba(236,72,153,0.04)", border: "1px solid rgba(236,72,153,0.18)" }}>
            <div className="font-mono text-[9px] tracking-widest mb-2 font-bold" style={{ color: "#ec4899" }}>⟺ CROSS-DOMAIN CORRELATIONS</div>
            <div className="space-y-1.5">
              {brief.crossDomainCorrelations.map((c, i) => (
                <div key={i} className="flex gap-2.5">
                  <span className="font-mono text-[9px] flex-shrink-0 mt-0.5" style={{ color: "#ec4899" }}>{String.fromCharCode(65 + i)}.</span>
                  <span className="font-mono text-[10px] text-sx-text-dim leading-relaxed">{c}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Anomaly Assessment */}
        {brief.anomalyAssessment && (
          <div>
            <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-2">ANOMALY ASSESSMENT</div>
            <div className="font-mono text-[10px] text-sx-text-dim leading-relaxed">{brief.anomalyAssessment}</div>
          </div>
        )}

        {/* COAs */}
        {brief.coa && brief.coa.length > 0 && (
          <div>
            <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-2">RECOMMENDED COURSES OF ACTION</div>
            <div className="space-y-2">
              {brief.coa.map((c, i) => {
                const color = PRIORITY_COLOR[c.priority] ?? "#94a3b8";
                return (
                  <div key={i} className="rounded p-3 flex items-start gap-3" style={{ background: `${color}06`, border: `1px solid ${color}20` }}>
                    <span className="font-mono text-[8px] px-2 py-0.5 rounded flex-shrink-0 font-bold" style={{ color, background: `${color}15`, border: `1px solid ${color}30` }}>
                      {c.priority}
                    </span>
                    <div>
                      <div className="font-mono text-[11px] font-bold mb-0.5" style={{ color }}>{c.action}</div>
                      <div className="font-mono text-[9px] text-sx-text-muted">{c.rationale}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PIRs */}
        {brief.collectionPriorities && brief.collectionPriorities.length > 0 && (
          <div className="rounded p-4" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(30,58,95,0.6)" }}>
            <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-2">PRIORITY INTELLIGENCE REQUIREMENTS (PIRs)</div>
            <div className="grid grid-cols-1 gap-1.5">
              {brief.collectionPriorities.map((p, i) => (
                <div key={i} className="flex gap-2.5">
                  <span className="font-mono text-[9px] text-sx-cyan flex-shrink-0 font-bold">PIR-{i + 1}:</span>
                  <span className="font-mono text-[10px] text-sx-text-dim">{p}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-5 py-2 border-t flex items-center justify-between"
        style={{ borderColor: "rgba(168,85,247,0.15)", background: "rgba(168,85,247,0.03)" }}
      >
        <div className="font-mono text-[8px] text-sx-text-muted">GENERATED BY: SENTINEL-X AI // GROQ llama-3.3-70b-versatile</div>
        <div className="font-mono text-[8px]" style={{ color: "#ef4444" }}>TS // SENTINEL // NOFORN</div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function ExecutiveSummaryPage() {
  const { entities, events } = useEntityStream();
  const assessment = useMemo(() => computeThreatAssessment(entities), [entities]);
  const [time] = useState(new Date());
  const [aiBrief, setAIBrief] = useState<AIBrief | null>(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiLatency, setAILatency] = useState<number | null>(null);
  const [aiGeneratedAt, setAIGeneratedAt] = useState<string | null>(null);
  const briefRef = useRef<HTMLDivElement>(null);

  const dtg = `${time.getUTCDate().toString().padStart(2,"0")}${time.getUTCHours().toString().padStart(2,"0")}${time.getUTCMinutes().toString().padStart(2,"0")}Z ${["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][time.getUTCMonth()]} ${time.getUTCFullYear()}`;

  const critEvents = events.filter(e => e.severity === "CRITICAL" && !e.acknowledged);

  const topDomains = DOMAIN_ORDER
    .map(d => ({
      domain: d,
      cfg: DOMAIN_CONFIGS[d],
      level: assessment.domainThreatLevels?.[d] ?? "INFO",
      count: entities.filter(e => e.domain === d).length,
    }))
    .sort((a, b) => {
      const o: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
      return (o[b.level] ?? 0) - (o[a.level] ?? 0);
    });

  const handleGenerateAIBrief = useCallback(async () => {
    if (aiLoading) return;
    setAILoading(true);

    const domainSummary = DOMAIN_ORDER
      .map(d => {
        const cfg = DOMAIN_CONFIGS[d];
        const count = entities.filter(e => e.domain === d).length;
        const crit = entities.filter(e => e.domain === d && e.severity === "CRITICAL").length;
        const anom = entities.filter(e => e.domain === d && e.anomalyFlag).length;
        const level = assessment.domainThreatLevels?.[d] ?? "INFO";
        return `${cfg.label}: ${count} entities / ${crit} CRITICAL / ${anom} anomalies / level=${level}`;
      })
      .join("\n");

    const topEntities = entities
      .filter(e => e.severity === "CRITICAL" || e.anomalyFlag)
      .slice(0, 8)
      .map(e => `[${e.domain.toUpperCase()}] ${e.label} — ${e.severity}${e.anomalyFlag ? " (ANOMALY)" : ""}`)
      .join("\n");

    const t0 = performance.now();
    try {
      const { data, error } = await supabase.functions.invoke("sentinel-ai/deep-analysis", {
        body: {
          threatIndex: assessment.threatIndex,
          globalLevel: assessment.globalThreatLevel,
          criticalCount: assessment.criticalEntityCount,
          highCount: assessment.highEntityCount,
          anomalyCount: assessment.anomalyCount,
          crisisZones: assessment.activeCrisisZones,
          domainSummary,
          topEntities: topEntities || "No critical entities currently tracked",
        },
      });

      const elapsed = Math.round(performance.now() - t0);
      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try { const t = await error.context?.text(); msg = `[${error.context?.status}] ${t || msg}`; } catch { /**/ }
        }
        throw new Error(msg);
      }

      setAIBrief(data?.analysis ?? {});
      setAILatency(data?.latencyMs ?? elapsed);
      setAIGeneratedAt(data?.generatedAt ?? new Date().toISOString());
      toast.success(`AI brief generated in ${data?.latencyMs ?? elapsed}ms`);

      // Scroll to brief
      setTimeout(() => briefRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err: unknown) {
      toast.error(`AI brief failed: ${(err as Error).message}`);
    } finally {
      setAILoading(false);
    }
  }, [entities, assessment, aiLoading]);

  const handleExportPDF = useCallback(() => {
    const briefSection = aiBrief ? [
      "",
      "═══ AI-GENERATED THREAT ASSESSMENT ═══",
      `BLUF: ${aiBrief.bluf ?? "N/A"}`,
      "",
      `THREAT NARRATIVE: ${aiBrief.threatNarrative ?? "N/A"}`,
      "",
      "COURSES OF ACTION:",
      ...(aiBrief.coa ?? []).map(c => `  [${c.priority}] ${c.action}: ${c.rationale}`),
      "",
      "PRIORITY INTELLIGENCE REQUIREMENTS:",
      ...(aiBrief.collectionPriorities ?? []).map((p, i) => `  PIR-${i + 1}: ${p}`),
      "",
      `CONFIDENCE: ${aiBrief.confidence ?? "N/A"}`,
    ] : [];

    const content = [
      `CLASSIFICATION : TOP SECRET // SENTINEL // NOFORN`,
      `DTG            : ${dtg}`,
      `REPORT TYPE    : EXECUTIVE INTELLIGENCE SUMMARY`,
      "",
      "═══ GLOBAL THREAT ASSESSMENT ═══",
      `Global Threat Level  : ${assessment.globalThreatLevel}`,
      `Threat Index         : ${assessment.threatIndex}/100`,
      `Critical Entities    : ${assessment.criticalEntityCount}`,
      `Anomalies            : ${assessment.anomalyCount}`,
      `Active Crisis Zones  : ${assessment.activeCrisisZones.join(", ") || "None"}`,
      "",
      "═══ DOMAIN THREAT POSTURE ═══",
      ...topDomains.map(d => `${d.cfg.label.padEnd(20)} : ${d.level.padEnd(10)} (${d.count} entities)`),
      "",
      "═══ CRITICAL INCIDENTS ═══",
      ...(critEvents.length > 0
        ? critEvents.slice(0, 5).map(e => `[${e.domain.toUpperCase()}] ${e.title}: ${e.description}`)
        : ["No unacknowledged critical incidents."]),
      ...briefSection,
      "",
      "NEXT UPDATE: T+60 MINUTES OR ON SIGNIFICANT CHANGE",
    ].join("\n");
    exportPDF(`SENTINEL-X EXECUTIVE SUMMARY // ${dtg}`, content);
    toast.success("PDF report opened for printing");
  }, [assessment, entities, events, dtg, topDomains, critEvents, aiBrief]);

  return (
    <div className="flex flex-col h-full bg-sx-bg overflow-y-auto">
      {/* Header */}
      <div
        className="flex-shrink-0 border-b border-sx-border px-8 py-4"
        style={{ background: "linear-gradient(180deg, #0d1a2d 0%, #0a0f1e 100%)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[9px] text-sx-text-muted tracking-[0.3em] mb-1">
              SENTINEL-X // EXECUTIVE INTELLIGENCE SUMMARY // {dtg}
            </div>
            <div className="font-display font-bold text-2xl tracking-widest" style={{ color: "#00d4ff", textShadow: "0 0 20px rgba(0,212,255,0.3)" }}>
              GLOBAL SITUATION ASSESSMENT
            </div>
            <div className="font-mono text-[10px] text-sx-text-muted mt-0.5">
              CLASSIFICATION: TOP SECRET // SENTINEL // NOFORN
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleGenerateAIBrief}
              disabled={aiLoading}
              className="px-4 py-2 rounded font-mono text-[9px] font-bold tracking-wider transition-all flex items-center gap-2"
              style={{
                background: aiLoading ? "rgba(168,85,247,0.15)" : "rgba(168,85,247,0.1)",
                border: "1px solid rgba(168,85,247,0.4)",
                color: aiLoading ? "#7c3aed" : "#a855f7",
              }}
            >
              {aiLoading ? (
                <>
                  <span className="animate-pulse">●</span> GENERATING...
                </>
              ) : (
                <>🔬 GENERATE AI BRIEF</>
              )}
            </button>
            <button
              onClick={handleExportPDF}
              className="px-3 py-2 rounded font-mono text-[9px] font-bold tracking-wider transition-all"
              style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.25)", color: "#00d4ff" }}
            >
              ↓ PDF REPORT
            </button>
            <ThreatMeter assessment={assessment} size={96} />
            <div>
              <div className="font-mono text-[9px] text-sx-text-muted mb-1">GLOBAL THREAT LEVEL</div>
              <div
                className="font-display font-bold text-3xl tracking-widest"
                style={{ color: severityToColor(assessment.globalThreatLevel), textShadow: `0 0 16px ${severityToColor(assessment.globalThreatLevel)}40` }}
              >
                {assessment.globalThreatLevel}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-5xl mx-auto w-full">
        {/* Global stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "TRACKED ENTITIES",      value: entities.length,                                  unit: "TOTAL",       color: "#00d4ff" },
            { label: "CRITICAL ENTITIES",     value: assessment.criticalEntityCount,                   unit: "IMMEDIATE",   color: "#ef4444" },
            { label: "ACTIVE CRISIS ZONES",   value: assessment.activeCrisisZones.length,              unit: "ZONES",       color: "#f59e0b" },
            { label: "UNACKNOWLEDGED ALERTS", value: events.filter(e => !e.acknowledged).length,        unit: "OUTSTANDING", color: "#ec4899" },
          ].map(stat => (
            <div key={stat.label} className="rounded border p-5" style={{ borderColor: `${stat.color}25`, background: `${stat.color}06` }}>
              <div className="font-mono text-4xl font-bold mb-1" style={{ color: stat.color, textShadow: `0 0 16px ${stat.color}50` }}>
                {stat.value}
              </div>
              <div className="font-mono text-[8px] text-sx-text-muted tracking-wider">{stat.unit}</div>
              <div className="font-mono text-[9px] text-sx-text-dim mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Crisis zones */}
        {assessment.activeCrisisZones.length > 0 && (
          <div className="rounded border p-5" style={{ background: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.25)" }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-sx-red" style={{ animation: "pulse 1.5s infinite", boxShadow: "0 0 8px #ef4444" }} />
              <span className="font-mono text-[10px] text-sx-red tracking-widest font-bold">
                ⚡ ACTIVE CRISIS ZONES — IMMEDIATE ATTENTION REQUIRED
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {assessment.activeCrisisZones.map(zone => (
                <div key={zone} className="flex items-center gap-2 px-3 py-2 rounded" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)" }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-sx-red flex-shrink-0" />
                  <span className="font-mono text-[10px] text-sx-red/80">{zone}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Domain threat matrix */}
        <div className="rounded border border-sx-border-dim bg-sx-panel overflow-hidden">
          <div className="px-5 py-3 border-b border-sx-border-dim bg-sx-surface">
            <span className="font-mono text-[10px] text-sx-text-muted tracking-widest">DOMAIN THREAT POSTURE</span>
          </div>
          <div className="grid grid-cols-3 gap-0 divide-x divide-y divide-sx-border-dim">
            {topDomains.map(({ domain, cfg, level, count }) => {
              const color = severityToColor(level as any);
              const pct = ({ CRITICAL: 100, HIGH: 75, MEDIUM: 50, LOW: 25, INFO: 5 } as Record<string, number>)[level] ?? 0;
              return (
                <div key={domain} className="p-4 flex items-center gap-3">
                  <span className="text-xl flex-shrink-0">{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[10px] font-bold" style={{ color: cfg.color }}>{cfg.shortLabel}</span>
                      <span className="font-mono text-[9px] font-bold" style={{ color }}>{level}</span>
                    </div>
                    <div className="h-1 rounded-full bg-sx-border-dim overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <div className="font-mono text-[8px] text-sx-text-muted mt-0.5">{count} entities</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Key incidents */}
        {critEvents.length > 0 && (
          <div className="rounded border border-sx-border-dim bg-sx-panel overflow-hidden">
            <div className="px-5 py-3 border-b border-sx-border-dim bg-sx-surface">
              <span className="font-mono text-[10px] text-sx-text-muted tracking-widest">KEY INCIDENTS REQUIRING DECISION</span>
            </div>
            <div className="divide-y divide-sx-border-dim">
              {critEvents.slice(0, 5).map(evt => {
                const cfg = DOMAIN_CONFIGS[evt.domain];
                const color = severityToColor(evt.severity);
                return (
                  <div key={evt.id} className="px-5 py-3 flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">{cfg?.icon}</span>
                    <div className="flex-1">
                      <div className="font-mono text-[11px] font-bold mb-0.5" style={{ color }}>{evt.title}</div>
                      <div className="font-mono text-[9px] text-sx-text-muted">{evt.description}</div>
                    </div>
                    <span className="font-mono text-[8px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ color, background: `${color}12`, border: `1px solid ${color}25` }}>
                      {evt.severity}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* AI Brief section */}
        <div ref={briefRef}>
          {aiBrief ? (
            <AIBriefCard brief={aiBrief} latencyMs={aiLatency ?? undefined} generatedAt={aiGeneratedAt ?? undefined} />
          ) : (
            <div
              className="rounded border p-8 flex flex-col items-center gap-4"
              style={{ borderColor: "rgba(168,85,247,0.2)", background: "rgba(168,85,247,0.03)", borderStyle: "dashed" }}
            >
              <div className="text-3xl" style={{ filter: "grayscale(0.3)" }}>🔬</div>
              <div className="text-center">
                <div className="font-mono text-[11px] font-bold tracking-widest mb-1" style={{ color: "#a855f7" }}>
                  AI THREAT ASSESSMENT
                </div>
                <div className="font-mono text-[9px] text-sx-text-muted max-w-sm leading-relaxed">
                  Generate a comprehensive AI-powered threat report including BLUF, domain analysis,
                  cross-domain correlations, anomaly assessment, COAs, and collection priorities.
                </div>
              </div>
              <button
                onClick={handleGenerateAIBrief}
                disabled={aiLoading}
                className="px-6 py-2.5 rounded font-mono text-[10px] font-bold tracking-wider transition-all"
                style={{
                  background: aiLoading ? "rgba(168,85,247,0.15)" : "rgba(168,85,247,0.12)",
                  border: "1px solid rgba(168,85,247,0.4)",
                  color: "#a855f7",
                }}
              >
                {aiLoading ? "● GENERATING BRIEF..." : "🔬 GENERATE AI BRIEF"}
              </button>
              <div className="font-mono text-[8px] text-sx-text-muted">
                Powered by Groq llama-3.3-70b-versatile // Response in ~2-4 seconds
              </div>
            </div>
          )}
        </div>

        {/* Recommended actions (manual fallback) */}
        {!aiBrief && (
          <div className="rounded border border-sx-border-dim bg-sx-panel p-5">
            <div className="font-mono text-[10px] text-sx-text-muted tracking-widest mb-3">RECOMMENDED ACTIONS</div>
            <div className="space-y-2">
              {[
                assessment.globalThreatLevel === "CRITICAL"
                  ? "IMMEDIATE: Escalate to DEFCON 3. Notify senior command. Activate crisis response."
                  : assessment.globalThreatLevel === "HIGH"
                  ? "ELEVATED: Increase ISR coverage on active AOs. Prepare contingency options."
                  : "ROUTINE: Continue monitoring. Update SITREP at next scheduled interval.",
                `Manually verify ${assessment.anomalyCount} flagged anomalies across all domains.`,
                critEvents.length > 0 ? `Action and acknowledge ${critEvents.length} outstanding CRITICAL event(s).` : "All CRITICAL events acknowledged.",
                `Review domain threat posture — ${topDomains[0]?.domain.toUpperCase()} currently showing highest threat level.`,
              ].map((action, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="font-mono text-[9px] text-sx-cyan flex-shrink-0 mt-0.5">{(i + 1).toString().padStart(2, "0")}.</span>
                  <span className="font-mono text-[10px] text-sx-text-dim leading-relaxed">{action}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center font-mono text-[9px] py-4" style={{ color: "#1e3a5f" }}>
          // SENTINEL-X EXECUTIVE SUMMARY // {dtg} // TS // SENTINEL // NOFORN // NOT FOR RELEASE //
        </div>
      </div>
    </div>
  );
}
