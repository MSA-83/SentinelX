// src/pages/ExecutiveSummaryPage.tsx
import { useMemo, useState, useCallback } from "react";
import { useEntityStream } from "@/hooks/useEntityStream";
import { computeThreatAssessment, severityToColor } from "@/lib/threatAssessor";
import { DOMAIN_CONFIGS, DOMAIN_ORDER } from "@/constants/domains";
import { ThreatMeter } from "@/components/features/ThreatMeter";
import { toast } from "sonner";

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

export function ExecutiveSummaryPage() {
  const { entities, events } = useEntityStream();
  const assessment = useMemo(() => computeThreatAssessment(entities), [entities]);
  const [time] = useState(new Date());

  const dtg = `${time.getUTCDate().toString().padStart(2,"0")}${time.getUTCHours().toString().padStart(2,"0")}${time.getUTCMinutes().toString().padStart(2,"0")}Z ${["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][time.getUTCMonth()]} ${time.getUTCFullYear()}`;

  const critEvents = events.filter((e) => e.severity === "CRITICAL" && !e.acknowledged);

  const topDomains = DOMAIN_ORDER
    .map((d) => ({
      domain: d,
      cfg: DOMAIN_CONFIGS[d],
      level: assessment.domainThreatLevels?.[d] ?? "INFO",
      count: entities.filter((e) => e.domain === d).length,
    }))
    .sort((a, b) => {
      const o: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
      return (o[b.level] ?? 0) - (o[a.level] ?? 0);
    });

  const handleExportPDF = useCallback(() => {
    const content = [
      `CLASSIFICATION : TOP SECRET // SENTINEL // NOFORN`,
      `DTG            : ${dtg}`,
      `REPORT TYPE    : EXECUTIVE INTELLIGENCE SUMMARY`,
      "",
      "═══ GLOBAL THREAT ASSESSMENT ═══",
      `Global Threat Level  : ${assessment.globalThreatLevel}`,
      `Threat Index         : ${assessment.threatIndex}/100`,
      `Critical Entities    : ${assessment.criticalEntityCount}`,
      `High Entities        : ${assessment.highEntityCount}`,
      `Anomalies            : ${assessment.anomalyCount}`,
      `Active Crisis Zones  : ${assessment.activeCrisisZones.join(", ") || "None"}`,
      "",
      "═══ ENTITY TRACKING ═══",
      `Total Tracked        : ${entities.length}`,
      `Unacknowledged Alerts: ${events.filter((e) => !e.acknowledged).length}`,
      "",
      "═══ DOMAIN THREAT POSTURE ═══",
      ...topDomains.map((d) => `${d.cfg.label.padEnd(20)} : ${d.level.padEnd(10)} (${d.count} entities)`),
      "",
      "═══ CRITICAL INCIDENTS ═══",
      ...(critEvents.length > 0
        ? critEvents.slice(0, 5).map((e) => `[${e.domain.toUpperCase()}] ${e.title}: ${e.description}`)
        : ["No unacknowledged critical incidents."]),
      "",
      "═══ RECOMMENDED ACTIONS ═══",
      assessment.globalThreatLevel === "CRITICAL"
        ? "IMMEDIATE: Escalate to DEFCON 3. Notify senior command. Activate crisis response."
        : "ELEVATED: Continue monitoring. Increase ISR coverage on active AOs.",
      `Verify ${assessment.anomalyCount} flagged anomalies.`,
      `Review ${critEvents.length} outstanding CRITICAL events.`,
      "NEXT UPDATE: T+60 MINUTES OR ON SIGNIFICANT CHANGE",
    ].join("\n");
    exportPDF(`SENTINEL-X EXECUTIVE SUMMARY // ${dtg}`, content);
    toast.success("PDF report opened for printing");
  }, [assessment, entities, events, dtg, topDomains, critEvents]);

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
            <div
              className="font-display font-bold text-2xl tracking-widest"
              style={{ color: "#00d4ff", textShadow: "0 0 20px rgba(0,212,255,0.3)" }}
            >
              GLOBAL SITUATION ASSESSMENT
            </div>
            <div className="font-mono text-[10px] text-sx-text-muted mt-0.5">
              CLASSIFICATION: TOP SECRET // SENTINEL // NOFORN
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleExportPDF}
              className="px-3 py-1.5 rounded font-mono text-[9px] font-bold tracking-wider transition-all"
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
            { label: "TRACKED ENTITIES", value: entities.length, unit: "TOTAL", color: "#00d4ff" },
            { label: "CRITICAL ENTITIES", value: assessment.criticalEntityCount, unit: "IMMEDIATE", color: "#ef4444" },
            { label: "ACTIVE CRISIS ZONES", value: assessment.activeCrisisZones.length, unit: "ZONES", color: "#f59e0b" },
            { label: "UNACKNOWLEDGED ALERTS", value: events.filter((e) => !e.acknowledged).length, unit: "OUTSTANDING", color: "#ec4899" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded border p-5"
              style={{
                borderColor: `${stat.color}25`,
                background: `${stat.color}06`,
              }}
            >
              <div
                className="font-mono text-4xl font-bold mb-1"
                style={{ color: stat.color, textShadow: `0 0 16px ${stat.color}50` }}
              >
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
              {assessment.activeCrisisZones.map((zone) => (
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
              {critEvents.slice(0, 5).map((evt) => {
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

        {/* Recommended actions */}
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
              "NEXT UPDATE: T+60 MINUTES OR ON SIGNIFICANT CHANGE",
            ].map((action, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="font-mono text-[9px] text-sx-cyan flex-shrink-0 mt-0.5">{(i + 1).toString().padStart(2, "0")}.</span>
                <span className="font-mono text-[10px] text-sx-text-dim leading-relaxed">{action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center font-mono text-[9px] py-4" style={{ color: "#1e3a5f" }}>
          // SENTINEL-X EXECUTIVE SUMMARY // {dtg} // TS // SENTINEL // NOFORN // NOT FOR RELEASE //
        </div>
      </div>
    </div>
  );
}
