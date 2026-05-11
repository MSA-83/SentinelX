// src/components/features/SitrepPanel.tsx
// Auto-generated SITREP (Situation Report) panel — NATO format
// Produces a structured intel summary from live entity and event data

import { useState, useMemo } from "react";
import type { SentinelEntity, StreamEvent, ThreatAssessment } from "@/types/entities";
import { DOMAIN_CONFIGS } from "@/constants/domains";
import { severityToColor } from "@/lib/threatAssessor";

interface SitrepPanelProps {
  entities: SentinelEntity[];
  events: StreamEvent[];
  threatAssessment: ThreatAssessment;
}

interface SitrepSection {
  code: string;
  title: string;
  content: string[];
}

function generateSitrep(
  entities: SentinelEntity[],
  events: StreamEvent[],
  assessment: ThreatAssessment
): SitrepSection[] {
  const now = new Date();
  const dtg = `${now.getUTCDate().toString().padStart(2,"0")}${now.getUTCHours().toString().padStart(2,"0")}${now.getUTCMinutes().toString().padStart(2,"0")}Z ${["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][now.getUTCMonth()]} ${now.getUTCFullYear()}`;

  const criticalEvents = events.filter((e) => e.severity === "CRITICAL" && !e.acknowledged);
  const highEvents     = events.filter((e) => e.severity === "HIGH"     && !e.acknowledged);
  const anomalies      = entities.filter((e) => e.anomalyFlag);

  // Domain entity counts
  const domainCounts: Record<string, number> = {};
  for (const e of entities) {
    domainCounts[e.domain] = (domainCounts[e.domain] ?? 0) + 1;
  }

  return [
    {
      code: "1",
      title: "SITUATION OVERVIEW",
      content: [
        `DTG: ${dtg}`,
        `CLASSIFICATION: TOP SECRET // SENTINEL // NOFORN`,
        `OPERATOR: SX-ANALYST-7 // SENTCOM`,
        `COMPOSITE THREAT INDEX: ${assessment.threatIndex}/100 — ${assessment.globalThreatLevel}`,
        `TOTAL TRACKED ENTITIES: ${entities.length}`,
        `ACTIVE CRISIS ZONES: ${assessment.activeCrisisZones.length > 0 ? assessment.activeCrisisZones.join(", ") : "NONE IDENTIFIED"}`,
        `OUTSTANDING ALERTS: ${criticalEvents.length} CRITICAL | ${highEvents.length} HIGH`,
      ],
    },
    {
      code: "2",
      title: "DOMAIN PICTURE",
      content: Object.entries(domainCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([domain, count]) => {
          const cfg = DOMAIN_CONFIGS[domain as keyof typeof DOMAIN_CONFIGS];
          const lvl = assessment.domainThreatLevels?.[domain as keyof typeof assessment.domainThreatLevels] ?? "INFO";
          return `${cfg?.shortLabel?.padEnd(4) ?? domain.toUpperCase().padEnd(4)} | ${count.toString().padStart(3)} ENTITIES | THREAT: ${lvl}`;
        }),
    },
    {
      code: "3",
      title: "CRITICAL INCIDENTS",
      content: criticalEvents.length > 0
        ? criticalEvents.slice(0, 5).map((e) => {
            const cfg = DOMAIN_CONFIGS[e.domain];
            return `[${cfg?.shortLabel ?? e.domain.toUpperCase()}] ${e.title} — ${e.description.slice(0, 80)}…`;
          })
        : ["NO CRITICAL INCIDENTS CURRENTLY OUTSTANDING"],
    },
    {
      code: "4",
      title: "ANOMALY DETECTIONS",
      content: anomalies.length > 0
        ? anomalies.slice(0, 6).map((e) => {
            const cfg = DOMAIN_CONFIGS[e.domain];
            const lat = `${Math.abs(e.position.lat).toFixed(2)}°${e.position.lat >= 0 ? "N" : "S"}`;
            const lon = `${Math.abs(e.position.lon).toFixed(2)}°${e.position.lon >= 0 ? "E" : "W"}`;
            return `${cfg?.icon} ${e.label} | ${e.type.replace(/_/g, " ")} | POS: ${lat} ${lon} | CONF: ${(e.confidence * 100).toFixed(0)}%`;
          })
        : ["NO ANOMALIES FLAGGED IN CURRENT OPERATIONAL PICTURE"],
    },
    {
      code: "5",
      title: "THREAT ASSESSMENT",
      content: [
        `GLOBAL POSTURE: ${assessment.globalThreatLevel} (INDEX ${assessment.threatIndex})`,
        `CRITICAL ENTITIES: ${assessment.criticalEntityCount}`,
        `HIGH-PRIORITY ENTITIES: ${assessment.highEntityCount}`,
        `ANOMALY FLAGS: ${assessment.anomalyCount}`,
        `HIGHEST DOMAIN: ${
          Object.entries(assessment.domainThreatLevels ?? {})
            .sort(([, a], [, b]) => {
              const order: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
              return (order[b] ?? 0) - (order[a] ?? 0);
            })[0]?.[0]?.toUpperCase() ?? "N/A"
        }`,
        `ASSESSMENT CONFIDENCE: ${Math.round(entities.reduce((a, e) => a + e.confidence, 0) / Math.max(entities.length, 1) * 100)}%`,
      ],
    },
    {
      code: "6",
      title: "RECOMMENDED ACTIONS",
      content: [
        assessment.globalThreatLevel === "CRITICAL"
          ? "IMMEDIATE: Escalate to DEFCON 3 posture. Notify senior command. Activate crisis response protocols."
          : assessment.globalThreatLevel === "HIGH"
          ? "ELEVATED: Increase collection coverage on active AOs. Request additional ISR assets. Prepare contingency options."
          : "ROUTINE: Continue monitoring all domains. Update situation report at next scheduled interval.",
        `Prioritize assessment of ${anomalies.length} flagged anomalies for manual verification.`,
        criticalEvents.length > 0
          ? `Acknowledge and action ${criticalEvents.length} outstanding CRITICAL event(s) immediately.`
          : "All CRITICAL events have been acknowledged.",
        "Ensure workspace filter settings align with current operational priorities.",
        "NEXT UPDATE: T+60 MINUTES OR ON SIGNIFICANT CHANGE",
      ],
    },
  ];
}

export function SitrepPanel({ entities, events, threatAssessment }: SitrepPanelProps) {
  const [generated, setGenerated] = useState(false);
  const [generatingAt, setGeneratingAt] = useState<string>("");
  const [copyMsg, setCopyMsg] = useState("");

  const sitrep = useMemo(
    () => (generated ? generateSitrep(entities, events, threatAssessment) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [generated, generatingAt] // re-generate only when triggered, not on every entity update
  );

  const handleGenerate = () => {
    setGeneratingAt(new Date().toISOString());
    setGenerated(true);
  };

  const handleCopy = () => {
    if (!sitrep) return;
    const text = sitrep
      .map((s) => `\n${s.code}. ${s.title}\n${"─".repeat(40)}\n${s.content.join("\n")}`)
      .join("\n");
    const full = `SENTINEL-X SITREP\nGENERATED: ${new Date().toUTCString()}\n${"═".repeat(50)}${text}\n\n${"═".repeat(50)}\n// END SITREP // SENTINEL-X // TS//NOFORN`;
    navigator.clipboard.writeText(full).then(() => {
      setCopyMsg("COPIED");
      setTimeout(() => setCopyMsg(""), 2000);
    });
  };

  const color = severityToColor(threatAssessment.globalThreatLevel);

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="font-mono text-[9px] tracking-widest" style={{ color: "#475569" }}>
          AUTO-SITREP GENERATOR
        </div>
        <div className="flex gap-1.5">
          {generated && (
            <button
              onClick={handleCopy}
              className="px-2 py-0.5 rounded font-mono text-[9px] transition-all"
              style={{
                background: copyMsg ? "rgba(16,185,129,0.15)" : "rgba(0,212,255,0.1)",
                color: copyMsg ? "#10b981" : "#00d4ff",
                border: `1px solid ${copyMsg ? "#10b98130" : "#00d4ff30"}`,
              }}
            >
              {copyMsg || "COPY"}
            </button>
          )}
          <button
            onClick={handleGenerate}
            className="px-2 py-0.5 rounded font-mono text-[9px] transition-all"
            style={{
              background: "rgba(0,212,255,0.15)",
              color: "#00d4ff",
              border: "1px solid rgba(0,212,255,0.35)",
            }}
          >
            {generated ? "REFRESH" : "GENERATE SITREP"}
          </button>
        </div>
      </div>

      {/* Pre-generate state */}
      {!generated && (
        <div
          className="rounded p-4 text-center"
          style={{ background: "#0a0f1e", border: "1px solid #0f2040" }}
        >
          <div className="text-3xl mb-2 opacity-40">📋</div>
          <div className="font-mono text-[10px] tracking-widest" style={{ color: "#475569" }}>
            SITUATION REPORT NOT YET GENERATED
          </div>
          <div className="font-mono text-[9px] mt-1" style={{ color: "#334155" }}>
            Click GENERATE SITREP to produce a NATO-format assessment from the current operational picture.
          </div>
        </div>
      )}

      {/* Generated SITREP */}
      {sitrep && (
        <>
          {/* Classification header */}
          <div
            className="rounded px-3 py-2 text-center"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <div className="font-mono text-[10px] font-bold tracking-widest" style={{ color: "#ef4444" }}>
              ⚠ TOP SECRET // SENTINEL // NOFORN
            </div>
            <div className="font-mono text-[8px] mt-0.5" style={{ color: "rgba(239,68,68,0.5)" }}>
              GENERATED: {new Date(generatingAt).toUTCString()}
            </div>
          </div>

          {/* Threat level badge */}
          <div
            className="rounded px-3 py-2 flex items-center justify-between"
            style={{ background: `${color}08`, border: `1px solid ${color}30` }}
          >
            <span className="font-mono text-[9px]" style={{ color: "#475569" }}>COMPOSITE THREAT INDEX</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 rounded-full" style={{ background: "#0f2040" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${threatAssessment.threatIndex}%`,
                    background: `linear-gradient(90deg, #10b981, ${color})`,
                    boxShadow: `0 0 6px ${color}`,
                  }}
                />
              </div>
              <span className="font-mono text-sm font-bold" style={{ color }}>{threatAssessment.threatIndex}</span>
              <span className="font-mono text-[10px] font-bold" style={{ color }}>{threatAssessment.globalThreatLevel}</span>
            </div>
          </div>

          {/* Sections */}
          {sitrep.map((section) => (
            <div
              key={section.code}
              className="rounded overflow-hidden"
              style={{ border: "1px solid #0f2040" }}
            >
              <div
                className="px-3 py-1.5 flex items-center gap-2"
                style={{ background: "#0a0f1e", borderBottom: "1px solid #0f2040" }}
              >
                <span
                  className="w-5 h-5 rounded-sm flex items-center justify-center font-mono text-[9px] font-bold flex-shrink-0"
                  style={{ background: "rgba(0,212,255,0.12)", color: "#00d4ff", border: "1px solid rgba(0,212,255,0.25)" }}
                >
                  {section.code}
                </span>
                <span className="font-mono text-[9px] tracking-widest" style={{ color: "#94a3b8" }}>
                  {section.title}
                </span>
              </div>
              <div
                className="px-3 py-2 space-y-1"
                style={{ background: "#0d1424" }}
              >
                {section.content.map((line, i) => (
                  <div key={i} className="font-mono text-[9px] leading-relaxed" style={{ color: "#64748b" }}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Footer */}
          <div className="font-mono text-[8px] text-center" style={{ color: "#1e3a5f" }}>
            // END SITREP // SENTINEL-X AUTOMATED INTELLIGENCE SYSTEM // NOT FOR RELEASE //
          </div>
        </>
      )}
    </div>
  );
}
