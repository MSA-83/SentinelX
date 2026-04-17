// src/components/features/AICopilot.tsx
// AI Analyst assistant powered by OnSpace AI — natural language intelligence queries
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { SentinelEntity, ThreatAssessment } from "@/types/entities";
import { DOMAIN_CONFIGS } from "@/constants/domains";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
}

interface AICopilotProps {
  entities: SentinelEntity[];
  threatAssessment: ThreatAssessment;
  onClose: () => void;
}

function buildSystemContext(entities: SentinelEntity[], assessment: ThreatAssessment): string {
  const domainCounts: Record<string, number> = {};
  for (const e of entities) domainCounts[e.domain] = (domainCounts[e.domain] ?? 0) + 1;

  return `You are SENTINEL-X AI ANALYST — an advanced intelligence analysis system integrated into a global situational awareness platform. You have access to the following current operational picture:

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

Respond as a professional military intelligence analyst. Be concise, factual, and use appropriate military terminology. Always include classification handling guidance when discussing sensitive information. Format responses with clear structure when appropriate.`;
}

const QUICK_PROMPTS = [
  "Summarize the current threat picture",
  "What domains require immediate attention?",
  "Identify the highest-risk entities",
  "Generate a brief SITREP",
  "What are the active crisis zones?",
  "Recommend intelligence collection priorities",
];

export function AICopilot({ entities, threatAssessment, onClose }: AICopilotProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init",
      role: "assistant",
      content: "SENTINEL-X AI ANALYST online. I have access to the current operational picture. How can I assist your analysis?",
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const systemContext = buildSystemContext(entities, threatAssessment);
      const history = messages.filter((m) => m.role !== "system").slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
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
        let errorMessage = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const statusCode = error.context?.status ?? 500;
            const textContent = await error.context?.text();
            errorMessage = `[Code: ${statusCode}] ${textContent || error.message}`;
          } catch {
            errorMessage = error.message;
          }
        }
        throw new Error(errorMessage);
      }

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data?.content ?? data?.message ?? "No response received.",
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `[SYSTEM ERROR] AI analyst unavailable: ${(err as Error).message}. Ensure the sentinel-ai edge function is deployed.`,
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed bottom-10 right-4 z-[600] flex flex-col rounded border overflow-hidden animate-slide-in-right"
      style={{
        width: 380,
        height: 520,
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
        </div>
        <button onClick={onClose} className="font-mono text-sx-text-muted hover:text-sx-text text-xs px-1">✕</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className="max-w-[85%] rounded px-3 py-2"
              style={{
                background: msg.role === "user" ? "rgba(0,212,255,0.1)" : "#080e1a",
                border: `1px solid ${msg.role === "user" ? "rgba(0,212,255,0.25)" : "#0f2040"}`,
              }}
            >
              {msg.role === "assistant" && (
                <div className="font-mono text-[8px] text-sx-cyan/60 tracking-wider mb-1">AI ANALYST</div>
              )}
              <div className="font-mono text-[10px] leading-relaxed whitespace-pre-wrap" style={{ color: msg.role === "user" ? "#00d4ff" : "#94a3b8" }}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded px-3 py-2" style={{ background: "#080e1a", border: "1px solid #0f2040" }}>
              <div className="font-mono text-[8px] text-sx-cyan/60 tracking-wider mb-1">AI ANALYST</div>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-sx-cyan/40"
                    style={{ animation: `pulse 1s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      <div className="flex-shrink-0 px-3 py-2 flex gap-1 overflow-x-auto no-scrollbar border-t" style={{ borderColor: "#0f2040" }}>
        {QUICK_PROMPTS.slice(0, 3).map((prompt) => (
          <button
            key={prompt}
            onClick={() => sendMessage(prompt)}
            className="flex-shrink-0 px-2 py-0.5 rounded font-mono text-[8px] transition-all"
            style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#475569", whiteSpace: "nowrap" }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#00d4ff"; (e.target as HTMLElement).style.borderColor = "#00d4ff30"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "#475569"; (e.target as HTMLElement).style.borderColor = "#1e3a5f"; }}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3 py-2.5 border-t flex items-center gap-2" style={{ borderColor: "#1e3a5f" }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
          placeholder="Ask the AI analyst..."
          className="flex-1 bg-transparent outline-none font-mono text-[10px]"
          style={{ color: "#e2e8f0", caretColor: "#00d4ff" }}
          disabled={loading}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="font-mono text-[9px] px-2 py-1 rounded transition-all"
          style={{
            background: loading || !input.trim() ? "transparent" : "rgba(0,212,255,0.12)",
            color: loading || !input.trim() ? "#334155" : "#00d4ff",
            border: `1px solid ${loading || !input.trim() ? "#0f2040" : "rgba(0,212,255,0.3)"}`,
          }}
        >
          SEND
        </button>
      </div>
    </div>
  );
}
