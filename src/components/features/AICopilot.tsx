// src/components/features/AICopilot.tsx
// AI Analyst — OnSpace AI (deep chat) + Groq (quick brief + deep analysis)
import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { SentinelEntity, ThreatAssessment } from "@/types/entities";
import { DOMAIN_CONFIGS, DOMAIN_ORDER } from "@/constants/domains";
import { severityToColor } from "@/lib/threatAssessor";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
  provider?: "onspace" | "groq";
  latencyMs?: number;
  type?: "brief" | "analysis" | "chat";
  analysis?: DeepAnalysis;
}

interface COA {
  action: string;
  priority: "IMMEDIATE" | "URGENT" | "ROUTINE";
  rationale: string;
}

interface DomainAnalysisItem {
  domain: string;
  assessment: string;
  keyIndicators: string[];
}

interface DeepAnalysis {
  bluf?: string;
  threatNarrative?: string;
  domainAnalysis?: DomainAnalysisItem[];
  crossDomainCorrelations?: string[];
  anomalyAssessment?: string;
  collectionPriorities?: string[];
  coa?: COA[];
  confidence?: string;
  classification?: string;
}

interface AICopilotProps {
  entities: SentinelEntity[];
  threatAssessment: ThreatAssessment;
  onClose: () => void;
}

function buildSystemContext(entities: SentinelEntity[], assessment: ThreatAssessment): string {
  const domainCounts: Record<string, number> = {};
  for (const e of entities) domainCounts[e.domain] = (domainCounts[e.domain] ?? 0) + 1;

  return `You are SENTINEL-X AI ANALYST — an advanced intelligence analysis system integrated into a global situational awareness platform.

COMPOSITE THREAT INDEX: ${assessment.threatIndex}/100 — Level: ${assessment.globalThreatLevel}
TOTAL TRACKED ENTITIES: ${entities.length}
CRITICAL ENTITIES: ${assessment.criticalEntityCount}
HIGH-PRIORITY ENTITIES: ${assessment.highEntityCount}
ANOMALY FLAGS: ${assessment.anomalyCount}
ACTIVE CRISIS ZONES: ${assessment.activeCrisisZones.join(", ") || "None"}

DOMAIN BREAKDOWN:
${Object.entries(domainCounts).map(([d, c]) => {
  const cfg = DOMAIN_CONFIGS[d as keyof typeof DOMAIN_CONFIGS];
  const level = assessment.domainThreatLevels?.[d as keyof typeof assessment.domainThreatLevels] ?? "INFO";
  return `- ${cfg?.label ?? d}: ${c} entities | Threat: ${level}`;
}).join("\n")}

Respond as a professional military intelligence analyst. Be concise, factual, and use appropriate military terminology.`;
}

const QUICK_PROMPTS = [
  "Identify cross-domain threat correlations",
  "Which anomalies require immediate action?",
  "Assess maritime threat posture",
  "Summarize orbital conjunction risks",
  "What are the top 3 collection priorities?",
];

const PRIORITY_COLOR: Record<string, string> = {
  IMMEDIATE: "#ef4444",
  URGENT:    "#f59e0b",
  ROUTINE:   "#10b981",
};

function DeepAnalysisCard({ analysis, latencyMs }: { analysis: DeepAnalysis; latencyMs?: number }) {
  const [expandedSection, setExpandedSection] = useState<string | null>("bluf");

  return (
    <div className="space-y-1">
      {/* Classification header */}
      <div
        className="text-center font-mono text-[7px] tracking-[0.2em] py-0.5 rounded-sm"
        style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}
      >
        {analysis.classification ?? "TOP SECRET // SENTINEL // NOFORN"}
      </div>

      {/* BLUF */}
      {analysis.bluf && (
        <div className="rounded p-2.5" style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.15)" }}>
          <div className="font-mono text-[8px] text-sx-cyan tracking-widest mb-1">⬛ BLUF</div>
          <div className="font-mono text-[9px] text-sx-text leading-relaxed">{analysis.bluf}</div>
        </div>
      )}

      {/* Threat narrative */}
      {analysis.threatNarrative && (
        <button
          onClick={() => setExpandedSection(expandedSection === "narrative" ? null : "narrative")}
          className="w-full text-left rounded p-2 transition-all"
          style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(30,58,95,0.6)" }}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[8px] text-sx-text-muted tracking-widest">THREAT NARRATIVE</span>
            <span className="font-mono text-[8px] text-sx-text-muted">{expandedSection === "narrative" ? "▲" : "▼"}</span>
          </div>
          {expandedSection === "narrative" && (
            <div className="mt-1.5 font-mono text-[9px] text-sx-text-dim leading-relaxed">
              {analysis.threatNarrative}
            </div>
          )}
        </button>
      )}

      {/* Domain analysis */}
      {analysis.domainAnalysis && analysis.domainAnalysis.length > 0 && (
        <button
          onClick={() => setExpandedSection(expandedSection === "domains" ? null : "domains")}
          className="w-full text-left rounded p-2 transition-all"
          style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(30,58,95,0.6)" }}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[8px] text-sx-text-muted tracking-widest">DOMAIN ANALYSIS ({analysis.domainAnalysis.length})</span>
            <span className="font-mono text-[8px] text-sx-text-muted">{expandedSection === "domains" ? "▲" : "▼"}</span>
          </div>
          {expandedSection === "domains" && (
            <div className="mt-2 space-y-2">
              {analysis.domainAnalysis.map((d, i) => (
                <div key={i} className="rounded p-1.5" style={{ background: "rgba(0,0,0,0.2)" }}>
                  <div className="font-mono text-[8px] text-sx-cyan mb-0.5 uppercase">{d.domain}</div>
                  <div className="font-mono text-[8px] text-sx-text-dim leading-relaxed">{d.assessment}</div>
                  {d.keyIndicators?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.keyIndicators.map((ind, j) => (
                        <span key={j} className="font-mono text-[7px] px-1 py-0.5 rounded" style={{ background: "rgba(0,212,255,0.06)", color: "#475569", border: "1px solid rgba(0,212,255,0.1)" }}>
                          {ind}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </button>
      )}

      {/* Cross-domain correlations */}
      {analysis.crossDomainCorrelations && analysis.crossDomainCorrelations.length > 0 && (
        <button
          onClick={() => setExpandedSection(expandedSection === "correlations" ? null : "correlations")}
          className="w-full text-left rounded p-2 transition-all"
          style={{ background: "rgba(236,72,153,0.04)", border: "1px solid rgba(236,72,153,0.15)" }}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[8px] tracking-widest" style={{ color: "#ec4899" }}>⟺ CROSS-DOMAIN CORRELATIONS</span>
            <span className="font-mono text-[8px]" style={{ color: "#ec4899" }}>{expandedSection === "correlations" ? "▲" : "▼"}</span>
          </div>
          {expandedSection === "correlations" && (
            <div className="mt-1.5 space-y-1">
              {analysis.crossDomainCorrelations.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <span className="font-mono text-[8px] text-sx-text-muted flex-shrink-0 mt-0.5">{(i + 1).toString().padStart(2, "0")}.</span>
                  <span className="font-mono text-[8px] text-sx-text-dim leading-relaxed">{c}</span>
                </div>
              ))}
            </div>
          )}
        </button>
      )}

      {/* COA recommendations */}
      {analysis.coa && analysis.coa.length > 0 && (
        <div>
          <div className="font-mono text-[8px] text-sx-text-muted tracking-widest mb-1 px-1">COURSES OF ACTION</div>
          <div className="space-y-1">
            {analysis.coa.map((c, i) => {
              const color = PRIORITY_COLOR[c.priority] ?? "#94a3b8";
              return (
                <div key={i} className="rounded p-1.5 flex items-start gap-2" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
                  <span className="font-mono text-[7px] px-1 py-0.5 rounded flex-shrink-0 font-bold" style={{ color, background: `${color}15` }}>
                    {c.priority}
                  </span>
                  <div>
                    <div className="font-mono text-[8px] font-bold text-sx-text">{c.action}</div>
                    <div className="font-mono text-[7px] text-sx-text-muted">{c.rationale}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Collection priorities */}
      {analysis.collectionPriorities && analysis.collectionPriorities.length > 0 && (
        <div className="rounded p-2" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(30,58,95,0.6)" }}>
          <div className="font-mono text-[8px] text-sx-text-muted tracking-widest mb-1">PRIORITY INTELLIGENCE REQUIREMENTS</div>
          <div className="space-y-0.5">
            {analysis.collectionPriorities.map((p, i) => (
              <div key={i} className="flex gap-2">
                <span className="font-mono text-[8px] text-sx-cyan flex-shrink-0">PIR-{i + 1}:</span>
                <span className="font-mono text-[8px] text-sx-text-dim">{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer: confidence + latency */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[7px] text-sx-text-muted">CONFIDENCE:</span>
          <span className="font-mono text-[7px]" style={{ color: analysis.confidence === "HIGH" ? "#10b981" : analysis.confidence === "MEDIUM" ? "#f59e0b" : "#ef4444" }}>
            {analysis.confidence ?? "UNKNOWN"}
          </span>
        </div>
        {latencyMs != null && (
          <span className="font-mono text-[7px] text-sx-text-muted">{latencyMs}ms // GROQ</span>
        )}
      </div>
    </div>
  );
}

export function AICopilot({ entities, threatAssessment, onClose }: AICopilotProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init",
      role: "assistant",
      content: "SENTINEL-X AI ANALYST online. Current operational picture loaded.\n\n⚡ QUICK BRIEF — 3-sentence Groq executive summary\n🔬 DEEP ANALYSIS — Full structured threat report with COAs\n💬 Chat — Ask anything about the current situation",
      ts: Date.now(),
      provider: "onspace",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  // tab state reserved for future tab UI
  const [, setActiveTab] = useState<"chat" | "analysis">("chat");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const buildDeepAnalysisPayload = useCallback(() => {
    const topEntities = entities
      .filter(e => e.severity === "CRITICAL" || e.anomalyFlag)
      .slice(0, 8)
      .map(e => `[${e.domain.toUpperCase()}] ${e.label} — ${e.severity}${e.anomalyFlag ? " (ANOMALY)" : ""}`)
      .join("\n");

    const domainSummary = DOMAIN_ORDER
      .map(d => {
        const cfg = DOMAIN_CONFIGS[d];
        const count = entities.filter(e => e.domain === d).length;
        const crit = entities.filter(e => e.domain === d && e.severity === "CRITICAL").length;
        const anom = entities.filter(e => e.domain === d && e.anomalyFlag).length;
        const level = threatAssessment.domainThreatLevels?.[d] ?? "INFO";
        return `${cfg.label}: ${count} entities / ${crit} CRITICAL / ${anom} anomalies / level=${level}`;
      })
      .join("\n");

    return {
      threatIndex: threatAssessment.threatIndex,
      globalLevel: threatAssessment.globalThreatLevel,
      criticalCount: threatAssessment.criticalEntityCount,
      highCount: threatAssessment.highEntityCount,
      anomalyCount: threatAssessment.anomalyCount,
      crisisZones: threatAssessment.activeCrisisZones,
      domainSummary,
      topEntities: topEntities || "No critical entities currently tracked",
    };
  }, [entities, threatAssessment]);

  const sendQuickBrief = async () => {
    if (briefLoading || loading || analysisLoading) return;
    setBriefLoading(true);

    const contextSummary = [
      `Threat Index: ${threatAssessment.threatIndex}/100 (${threatAssessment.globalThreatLevel})`,
      `Entities: ${entities.length} tracked, ${threatAssessment.criticalEntityCount} CRITICAL`,
      `Anomalies: ${threatAssessment.anomalyCount}`,
      `Crisis Zones: ${threatAssessment.activeCrisisZones.join(", ") || "None"}`,
      `Domain threats: ${Object.entries(threatAssessment.domainThreatLevels ?? {}).map(([d, l]) => `${d}=${l}`).join(", ")}`,
    ].join(". ");

    const briefMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: "⚡ QUICK BRIEF",
      ts: Date.now(),
    };
    setMessages(prev => [...prev, briefMsg]);
    setActiveTab("chat");

    const t0 = performance.now();
    try {
      const { data, error } = await supabase.functions.invoke("sentinel-ai/quick-brief", {
        body: { context: contextSummary },
      });

      const elapsed = Math.round(performance.now() - t0);
      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try { const t = await error.context?.text(); msg = `[${error.context?.status}] ${t || msg}`; } catch { /**/ }
        }
        throw new Error(msg);
      }

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data?.content ?? "No brief generated.",
        ts: Date.now(),
        provider: "groq",
        latencyMs: data?.latencyMs ?? elapsed,
        type: "brief",
      }]);
    } catch (err: unknown) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `[GROQ ERROR] Quick brief failed: ${(err as Error).message}`,
        ts: Date.now(),
        provider: "groq",
      }]);
    } finally {
      setBriefLoading(false);
    }
  };

  const sendDeepAnalysis = async () => {
    if (briefLoading || loading || analysisLoading) return;
    setAnalysisLoading(true);
    setActiveTab("chat");

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: "🔬 DEEP ANALYSIS — Generate comprehensive threat assessment",
      ts: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    const t0 = performance.now();
    try {
      const payload = buildDeepAnalysisPayload();
      const { data, error } = await supabase.functions.invoke("sentinel-ai/deep-analysis", {
        body: payload,
      });

      const elapsed = Math.round(performance.now() - t0);
      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try { const t = await error.context?.text(); msg = `[${error.context?.status}] ${t || msg}`; } catch { /**/ }
        }
        throw new Error(msg);
      }

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        ts: Date.now(),
        provider: "groq",
        latencyMs: data?.latencyMs ?? elapsed,
        type: "analysis",
        analysis: data?.analysis ?? {},
      }]);
    } catch (err: unknown) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `[GROQ ERROR] Deep analysis failed: ${(err as Error).message}`,
        ts: Date.now(),
        provider: "groq",
      }]);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setActiveTab("chat");

    try {
      const systemContext = buildSystemContext(entities, threatAssessment);
      const history = messages.filter(m => m.role !== "system" && m.type !== "analysis").slice(-6).map(m => ({
        role: m.role,
        content: m.type === "brief" ? m.content : m.content,
      }));

      const { data, error } = await supabase.functions.invoke("sentinel-ai", {
        body: {
          messages: [
            { role: "system", content: systemContext },
            ...history,
            { role: "user", content: text },
          ],
          model: "gpt-4o-mini",
        },
      });

      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const statusCode = error.context?.status ?? 500;
            const textContent = await error.context?.text();
            msg = `[Code: ${statusCode}] ${textContent || error.message}`;
          } catch { /**/ }
        }
        throw new Error(msg);
      }

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data?.content ?? data?.message ?? "No response received.",
        ts: Date.now(),
        provider: "onspace",
        type: "chat",
      }]);
    } catch (err: unknown) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `[SYSTEM ERROR] AI analyst unavailable: ${(err as Error).message}`,
        ts: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const isAnyLoading = loading || briefLoading || analysisLoading;

  return (
    <div
      className="fixed bottom-10 right-4 z-[600] flex flex-col rounded border overflow-hidden animate-slide-in-right"
      style={{
        width: 420,
        height: 580,
        background: "#0d1424",
        borderColor: "rgba(0,212,255,0.25)",
        boxShadow: "0 0 0 1px rgba(0,212,255,0.08), 0 24px 64px rgba(0,0,0,0.8), 0 0 40px rgba(0,212,255,0.08)",
      }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "#1e3a5f", background: "#0a0f1e" }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-sx-cyan" style={{ boxShadow: "0 0 6px #00d4ff", animation: "pulse 2s infinite" }} />
          <span className="font-mono text-[10px] text-sx-cyan tracking-widest font-bold">AI ANALYST // SENTINEL-X</span>
          <span className="font-mono text-[7px] px-1.5 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }}>
            GROQ
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Threat index pill */}
          <div
            className="font-mono text-[8px] px-2 py-0.5 rounded"
            style={{
              color: severityToColor(threatAssessment.globalThreatLevel),
              background: `${severityToColor(threatAssessment.globalThreatLevel)}12`,
              border: `1px solid ${severityToColor(threatAssessment.globalThreatLevel)}30`,
            }}
          >
            T:{threatAssessment.threatIndex} {threatAssessment.globalThreatLevel}
          </div>
          <button onClick={onClose} className="font-mono text-sx-text-muted hover:text-sx-text text-xs px-1">✕</button>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 border-b" style={{ borderColor: "#0f2040" }}>
        <button
          onClick={sendQuickBrief}
          disabled={isAnyLoading}
          className="flex items-center gap-1 px-2.5 py-1 rounded font-mono text-[8px] font-bold transition-all"
          style={{
            background: briefLoading ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.08)",
            border: "1px solid rgba(16,185,129,0.3)",
            color: isAnyLoading && !briefLoading ? "#334155" : "#10b981",
            whiteSpace: "nowrap",
          }}
          title="Groq ultra-fast 3-sentence executive brief"
        >
          {briefLoading ? "⚡ BRIEFING..." : "⚡ QUICK BRIEF"}
        </button>

        <button
          onClick={sendDeepAnalysis}
          disabled={isAnyLoading}
          className="flex items-center gap-1 px-2.5 py-1 rounded font-mono text-[8px] font-bold transition-all"
          style={{
            background: analysisLoading ? "rgba(168,85,247,0.15)" : "rgba(168,85,247,0.08)",
            border: "1px solid rgba(168,85,247,0.3)",
            color: isAnyLoading && !analysisLoading ? "#334155" : "#a855f7",
            whiteSpace: "nowrap",
          }}
          title="Full structured threat assessment with COAs"
        >
          {analysisLoading ? "🔬 ANALYZING..." : "🔬 DEEP ANALYSIS"}
        </button>

        <div className="flex-1 flex gap-1 overflow-x-auto no-scrollbar">
          {QUICK_PROMPTS.slice(0, 2).map(prompt => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              disabled={isAnyLoading}
              className="flex-shrink-0 px-2 py-0.5 rounded font-mono text-[7px] transition-all"
              style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: isAnyLoading ? "#1e3a5f" : "#475569", whiteSpace: "nowrap" }}
              onMouseEnter={e => { if (!isAnyLoading) { (e.target as HTMLElement).style.color = "#00d4ff"; } }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = isAnyLoading ? "#1e3a5f" : "#475569"; }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[92%] rounded px-3 py-2"
              style={{
                background: msg.role === "user"
                  ? "rgba(0,212,255,0.1)"
                  : msg.type === "analysis"
                    ? "rgba(168,85,247,0.04)"
                    : msg.provider === "groq"
                      ? "rgba(16,185,129,0.05)"
                      : "#080e1a",
                border: `1px solid ${msg.role === "user"
                  ? "rgba(0,212,255,0.25)"
                  : msg.type === "analysis"
                    ? "rgba(168,85,247,0.2)"
                    : msg.provider === "groq"
                      ? "rgba(16,185,129,0.2)"
                      : "#0f2040"}`,
              }}
            >
              {msg.role === "assistant" && (
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className="font-mono text-[8px] tracking-wider"
                    style={{
                      color: msg.type === "analysis"
                        ? "#a855f7"
                        : msg.provider === "groq"
                          ? "#10b981"
                          : "rgba(0,212,255,0.6)",
                    }}
                  >
                    {msg.type === "analysis" ? "🔬 GROQ DEEP ANALYSIS" : msg.provider === "groq" ? "⚡ GROQ LLAMA-3.3-70B" : "◈ AI ANALYST"}
                  </div>
                  {msg.latencyMs != null && (
                    <div className="font-mono text-[7px] text-sx-text-muted">{msg.latencyMs}ms</div>
                  )}
                </div>
              )}

              {/* Deep analysis structured render */}
              {msg.type === "analysis" && msg.analysis ? (
                <DeepAnalysisCard analysis={msg.analysis} latencyMs={msg.latencyMs} />
              ) : (
                <div
                  className="font-mono text-[10px] leading-relaxed whitespace-pre-wrap"
                  style={{ color: msg.role === "user" ? "#00d4ff" : "#94a3b8" }}
                >
                  {msg.content}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicators */}
        {(loading || briefLoading || analysisLoading) && (
          <div className="flex justify-start">
            <div
              className="rounded px-3 py-2"
              style={{
                background: analysisLoading ? "rgba(168,85,247,0.06)" : briefLoading ? "rgba(16,185,129,0.05)" : "#080e1a",
                border: `1px solid ${analysisLoading ? "rgba(168,85,247,0.2)" : briefLoading ? "rgba(16,185,129,0.2)" : "#0f2040"}`,
              }}
            >
              <div
                className="font-mono text-[8px] tracking-wider mb-1.5"
                style={{ color: analysisLoading ? "#a855f7" : briefLoading ? "#10b981" : "rgba(0,212,255,0.6)" }}
              >
                {analysisLoading ? "🔬 GROQ ANALYZING..." : briefLoading ? "⚡ GROQ BRIEFING..." : "◈ AI ANALYST THINKING..."}
              </div>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: analysisLoading ? "#a855f7" : briefLoading ? "#10b981" : "rgba(0,212,255,0.4)",
                      animation: `pulse 1s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3 py-2.5 border-t flex items-center gap-2" style={{ borderColor: "#1e3a5f" }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
          placeholder="Ask the AI analyst... (Enter to send)"
          className="flex-1 bg-transparent outline-none font-mono text-[10px]"
          style={{ color: "#e2e8f0", caretColor: "#00d4ff" }}
          disabled={isAnyLoading}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={isAnyLoading || !input.trim()}
          className="font-mono text-[9px] px-2 py-1 rounded transition-all"
          style={{
            background: isAnyLoading || !input.trim() ? "transparent" : "rgba(0,212,255,0.12)",
            color: isAnyLoading || !input.trim() ? "#334155" : "#00d4ff",
            border: `1px solid ${isAnyLoading || !input.trim() ? "#0f2040" : "rgba(0,212,255,0.3)"}`,
          }}
        >
          SEND
        </button>
      </div>
    </div>
  );
}
