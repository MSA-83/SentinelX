// src/components/features/AnomalyExplainer.tsx
// AI-powered anomaly explanation popover for flagged entities
import { useState, useCallback } from "react";
import type { SentinelEntity } from "@/types/entities";
import { supabase } from "@/lib/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { DOMAIN_CONFIGS } from "@/constants/domains";

interface AnomalyExplainerProps {
  entity: SentinelEntity;
}

export function AnomalyExplainer({ entity }: AnomalyExplainerProps) {
  const [open,        setOpen]        = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [latencyMs,   setLatencyMs]   = useState<number | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  const cfg = DOMAIN_CONFIGS[entity.domain];

  const handleExplain = useCallback(async () => {
    // Toggle close if already open and has content
    if (open && explanation) { setOpen(false); return; }
    setOpen(true);

    // Use cached result if available
    if (explanation) return;

    setLoading(true);
    setError(null);

    const context = [
      `Entity: ${entity.label}`,
      `Domain: ${cfg?.label ?? entity.domain}`,
      `Type: ${entity.type.replace(/_/g, " ")}`,
      `Severity: ${entity.severity}`,
      `Confidence: ${(entity.confidence * 100).toFixed(0)}%`,
      `Position: ${entity.position.lat.toFixed(3)}°, ${entity.position.lon.toFixed(3)}°`,
      entity.speed    != null ? `Speed: ${entity.speed} kt`  : "",
      entity.heading  != null ? `Heading: ${entity.heading}°` : "",
      entity.altitude != null ? `Altitude: ${entity.altitude} ft` : "",
      entity.meta?.navStatus  ? `Nav status: ${entity.meta.navStatus}` : "",
      entity.meta?.destination? `Destination: ${entity.meta.destination}` : "",
      entity.meta?.shipType   ? `Ship type: ${entity.meta.shipType}` : "",
      `Source: ${entity.source}`,
    ].filter(Boolean).join("; ");

    const t0 = performance.now();

    try {
      const { data, error: fnError } = await supabase.functions.invoke("sentinel-ai", {
        body: {
          messages: [
            {
              role: "system",
              content:
                "You are SENTINEL-X AI anomaly analyst. Explain in exactly 2-3 concise sentences why this entity was flagged as anomalous. " +
                "Focus on specific tactical indicators (unusual speed, suspicious course, high-risk ship type, navigation status, or geographic position). " +
                "Use military intelligence language. Be specific and actionable.",
            },
            {
              role: "user",
              content: `Anomalous entity data: ${context}`,
            },
          ],
          model: "gpt-4o-mini",
        },
      });

      const elapsed = Math.round(performance.now() - t0);
      setLatencyMs(elapsed);

      if (fnError) {
        let msg = fnError.message;
        if (fnError instanceof FunctionsHttpError) {
          try {
            const statusCode = fnError.context?.status ?? 500;
            const textContent = await fnError.context?.text();
            msg = `[Code: ${statusCode}] ${textContent || fnError.message}`;
          } catch { /**/ }
        }
        throw new Error(msg);
      }

      setExplanation(data?.content ?? "No explanation generated.");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [entity, cfg, open, explanation]);

  if (!entity.anomalyFlag) return null;

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={handleExplain}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded font-mono text-[8px] font-bold tracking-wider transition-all w-full"
        style={{
          background: open ? "rgba(245,158,11,0.12)" : "rgba(245,158,11,0.07)",
          border: "1px solid rgba(245,158,11,0.3)",
          color: loading ? "#f59e0b80" : "#f59e0b",
        }}
      >
        {loading ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            AI ANALYZING ANOMALY...
          </>
        ) : open && explanation ? (
          <>▲ CLOSE AI EXPLANATION</>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" style={{ boxShadow: "0 0 4px #f59e0b" }} />
            🤖 AI EXPLAIN ANOMALY
          </>
        )}
      </button>

      {/* Explanation card */}
      {open && (
        <div
          className="mt-2 rounded border overflow-hidden animate-fade-in"
          style={{ background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.2)" }}
        >
          {/* Header */}
          <div
            className="px-3 py-1.5 flex items-center justify-between border-b"
            style={{ borderColor: "rgba(245,158,11,0.15)", background: "rgba(245,158,11,0.06)" }}
          >
            <div className="font-mono text-[8px] tracking-widest font-bold" style={{ color: "#f59e0b" }}>
              ⚠ AI ANOMALY ANALYSIS
            </div>
            <div className="flex items-center gap-2">
              {latencyMs != null && (
                <span className="font-mono text-[7px]" style={{ color: "#f59e0b50" }}>{latencyMs}ms</span>
              )}
              <span className="font-mono text-[7px] px-1 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                OnSpace AI
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="px-3 py-2.5">
            {loading && (
              <div className="flex items-center gap-2 py-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "#f59e0b", animation: `pulse 1s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
                <span className="font-mono text-[8px] text-sx-text-muted">Querying AI analyst...</span>
              </div>
            )}

            {error && !loading && (
              <div className="font-mono text-[9px] leading-relaxed" style={{ color: "#ef4444" }}>
                ⚠ AI unavailable: {error}
              </div>
            )}

            {explanation && !loading && (
              <div className="space-y-2">
                <p className="font-mono text-[9px] leading-relaxed" style={{ color: "#94a3b8" }}>
                  {explanation}
                </p>
                <div
                  className="flex items-center gap-1.5 pt-1 border-t"
                  style={{ borderColor: "rgba(245,158,11,0.12)" }}
                >
                  <span className="font-mono text-[7px]" style={{ color: "#f59e0b40" }}>
                    ENTITY: {entity.id.slice(0, 16)}... // {new Date(entity.ts).toUTCString().split(" ")[4]}Z
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
