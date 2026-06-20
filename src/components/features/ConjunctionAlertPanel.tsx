// src/components/features/ConjunctionAlertPanel.tsx
// Space-Track Conjunction Alert Panel — CDM data with Pc, TCA, miss distance
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";

interface CDM {
  id: string;
  sat1Name: string;
  sat2Name: string;
  sat1NoradId: string;
  sat2NoradId: string;
  probabilityOfCollision: number;
  missDistanceKm: number;
  tcaUtc: string;
  relativeVelocityKms?: number;
  creationDate?: string;
  severity: string;
  altitudeKm?: number;
}

interface DebrisObject {
  id: string;
  satName: string;
  noradId: string;
  apogeeKm: number;
  perigeeKm: number;
  inclination: number;
  country: string;
  launchDate: string;
  rcsSize: string;
}

interface SpaceTrackState {
  cdms: CDM[];
  debris: DebrisObject[];
  loading: boolean;
  lastFetch: string | null;
  error: string | null;
  nextFetch: number;
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH:     "#f59e0b",
  MEDIUM:   "#fde047",
  LOW:      "#10b981",
  INFO:     "#94a3b8",
};

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const COUNTDOWN_TICK   = 1000;

function formatTCA(tcaUtc: string): { display: string; hoursAway: number } {
  const tca = new Date(tcaUtc);
  const now = Date.now();
  const diffMs = tca.getTime() - now;
  const hoursAway = diffMs / 3600000;

  if (diffMs < 0) {
    return { display: "PASSED", hoursAway };
  }
  if (diffMs < 3600000) {
    const min = Math.floor(diffMs / 60000);
    const sec = Math.floor((diffMs % 60000) / 1000);
    return { display: `T-${min}m ${sec}s`, hoursAway };
  }
  const h = Math.floor(hoursAway);
  const m = Math.floor((hoursAway - h) * 60);
  return { display: `T-${h}h ${m}m`, hoursAway };
}

function formatPc(pc: number): string {
  if (pc === 0) return "< 1e-6";
  if (pc < 0.001) return pc.toExponential(2);
  return `${(pc * 100).toFixed(3)}%`;
}

interface ConjunctionAlertPanelProps {
  onClose: () => void;
}

export function ConjunctionAlertPanel({ onClose }: ConjunctionAlertPanelProps) {
  const [state, setState] = useState<SpaceTrackState>({
    cdms: [], debris: [], loading: true, lastFetch: null, error: null, nextFetch: 0,
  });
  const [activeTab, setActiveTab] = useState<"cdm" | "debris" | "stats">("cdm");
  const [filter, setFilter] = useState<"ALL" | "HIGH_Pc" | "CRITICAL">("ALL");
  const [countdown, setCountdown] = useState(POLL_INTERVAL_MS / 1000);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!mountedRef.current) return;
    setState((p) => ({ ...p, loading: true, error: null }));

    try {
      const res = await supabase.functions.invoke("sentinel-feeds", {
        body: { domain: "spacetrack" } as Record<string, unknown>,
      });

      if (res.error) {
        let msg = res.error.message;
        if (res.error instanceof FunctionsHttpError) {
          try { const t = await res.error.context?.text(); msg = t || msg; } catch { /**/ }
        }
        throw new Error(msg);
      }

      const feedData = res.data;
      const feed = feedData?.feeds?.[0];
      const entities = feed?.entities ?? [];

      // Parse CDMs and debris from returned entities
      const cdms: CDM[] = entities
        .filter((e: { meta?: { conjunctionType?: string } }) => e.meta?.conjunctionType === "CDM")
        .map((e: {
          id: string;
          meta: {
            sat1Name?: string;
            sat2Name?: string;
            sat1NoradId?: string;
            sat2NoradId?: string;
            probabilityOfCollision?: number;
            missDistanceKm?: number;
            tcaUtc?: string;
            relativeVelocityKms?: number;
            creationDate?: string;
            altitudeKm?: number;
          };
          severity: string;
        }): CDM => ({
          id: e.id,
          sat1Name:               e.meta?.sat1Name ?? "OBJECT-A",
          sat2Name:               e.meta?.sat2Name ?? "OBJECT-B",
          sat1NoradId:            e.meta?.sat1NoradId ?? "?",
          sat2NoradId:            e.meta?.sat2NoradId ?? "?",
          probabilityOfCollision: e.meta?.probabilityOfCollision ?? 0,
          missDistanceKm:         e.meta?.missDistanceKm ?? 999,
          tcaUtc:                 e.meta?.tcaUtc ?? new Date().toISOString(),
          relativeVelocityKms:    e.meta?.relativeVelocityKms,
          creationDate:           e.meta?.creationDate,
          severity:               e.severity,
          altitudeKm:             e.meta?.altitudeKm,
        }))
        .sort((a: CDM, b: CDM) => b.probabilityOfCollision - a.probabilityOfCollision);

      const debris: DebrisObject[] = entities
        .filter((e: { meta?: { objectType?: string } }) => e.meta?.objectType === "DEBRIS")
        .map((e: {
          id: string;
          meta: {
            noradId?: string;
            satName?: string;
            apogeeKm?: number;
            perigeeKm?: number;
            inclination?: number;
            country?: string;
            launchDate?: string;
            rcsSize?: string;
          };
        }): DebrisObject => ({
          id:          e.id,
          noradId:     e.meta?.noradId ?? "?",
          satName:     e.meta?.satName ?? "UNKNOWN",
          apogeeKm:    e.meta?.apogeeKm ?? 0,
          perigeeKm:   e.meta?.perigeeKm ?? 0,
          inclination: e.meta?.inclination ?? 0,
          country:     e.meta?.country ?? "?",
          launchDate:  e.meta?.launchDate ?? "?",
          rcsSize:     e.meta?.rcsSize ?? "?",
        }));

      if (mountedRef.current) {
        setState({
          cdms,
          debris,
          loading: false,
          lastFetch: new Date().toISOString(),
          error: null,
          nextFetch: Date.now() + POLL_INTERVAL_MS,
        });
        setCountdown(POLL_INTERVAL_MS / 1000);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setState((p) => ({
          ...p,
          loading: false,
          error: (err as Error).message,
          nextFetch: Date.now() + POLL_INTERVAL_MS,
        }));
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchData]);

  // Countdown ticker
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, COUNTDOWN_TICK);
    return () => clearInterval(tick);
  }, []);

  const filteredCdms = state.cdms.filter((c) => {
    if (filter === "HIGH_Pc") return c.probabilityOfCollision > 0.0001;
    if (filter === "CRITICAL") return c.probabilityOfCollision > 0.001;
    return true;
  });

  const critCount = state.cdms.filter((c) => c.probabilityOfCollision > 0.001).length;
  const highCount = state.cdms.filter((c) => c.probabilityOfCollision > 0.0001 && c.probabilityOfCollision <= 0.001).length;

  return (
    <div
      className="fixed top-14 right-0 bottom-8 z-[500] flex flex-col border-l border-sx-border animate-slide-in-right"
      style={{
        width: 380,
        background: "#0a0f1e",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.8)",
      }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 border-b border-sx-border px-4 py-3"
        style={{ background: "#080e1a" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  background: critCount > 0 ? "#ef4444" : "#f59e0b",
                  boxShadow: critCount > 0 ? "0 0 6px #ef4444" : "0 0 4px #f59e0b",
                  animation: critCount > 0 ? "pulse 1.5s infinite" : undefined,
                }}
              />
              <span className="font-mono font-bold text-[11px] text-sx-cyan tracking-widest">
                SPACE-TRACK CDM ALERT
              </span>
            </div>
            <div className="font-mono text-[8px] text-sx-text-muted">
              CONJUNCTION DATA MESSAGES // SPACE DOMAIN AWARENESS
            </div>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-sx-text-muted hover:text-sx-text text-xs px-1 mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-4 mt-3">
          {[
            { label: "CDMs", value: state.cdms.length, color: "#00d4ff" },
            { label: "CRITICAL Pc", value: critCount, color: "#ef4444" },
            { label: "HIGH Pc", value: highCount, color: "#f59e0b" },
            { label: "DEBRIS", value: state.debris.length, color: "#94a3b8" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <div className="font-mono text-base font-bold leading-none" style={{ color }}>{value}</div>
              <div className="font-mono text-[7px] text-sx-text-muted mt-0.5">{label}</div>
            </div>
          ))}
          <div className="ml-auto text-right">
            <div className="font-mono text-[8px] text-sx-text-muted">NEXT POLL</div>
            <div className="font-mono text-[9px] text-sx-cyan">T-{countdown}s</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-sx-border px-2 py-1.5 gap-1">
        {(["cdm", "debris", "stats"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-1.5 rounded font-mono text-[9px] uppercase tracking-wider transition-all"
            style={{
              background: activeTab === tab ? "rgba(0,212,255,0.1)" : "transparent",
              color:      activeTab === tab ? "#00d4ff" : "#475569",
              border:     `1px solid ${activeTab === tab ? "rgba(0,212,255,0.25)" : "transparent"}`,
            }}
          >
            {tab === "cdm" ? `CONJUNCTIONS (${state.cdms.length})` : tab === "debris" ? `DEBRIS (${state.debris.length})` : "STATS"}
          </button>
        ))}
        <button
          onClick={fetchData}
          disabled={state.loading}
          className="px-2 py-1 rounded font-mono text-[8px] transition-all"
          style={{
            background: "#080e1a",
            border: "1px solid rgba(0,212,255,0.15)",
            color: state.loading ? "#334155" : "#00d4ff",
          }}
          title="Refresh Space-Track data"
        >
          {state.loading ? "..." : "↻"}
        </button>
      </div>

      {/* Error banner */}
      {state.error && (
        <div className="flex-shrink-0 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
          <div className="font-mono text-[8px] text-amber-400">
            ⚠ {state.error.length > 80 ? state.error.slice(0, 80) + "…" : state.error}
          </div>
          <div className="font-mono text-[7px] text-amber-400/60 mt-0.5">
            Showing simulated CDM data from OrbitalGlobePage fallback
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* CDM Tab */}
        {activeTab === "cdm" && (
          <div className="flex flex-col h-full">
            {/* Filter bar */}
            <div className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-sx-border-dim">
              {(["ALL", "HIGH_Pc", "CRITICAL"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="px-2 py-0.5 rounded font-mono text-[8px] uppercase transition-all"
                  style={{
                    background: filter === f ? "rgba(0,212,255,0.1)" : "transparent",
                    color:      filter === f ? "#00d4ff" : "#475569",
                    border:     `1px solid ${filter === f ? "rgba(0,212,255,0.2)" : "transparent"}`,
                  }}
                >
                  {f === "HIGH_Pc" ? "Pc > 1e-4" : f === "CRITICAL" ? "Pc > 1e-3" : "ALL"}
                </button>
              ))}
              <span className="ml-auto font-mono text-[8px] text-sx-text-muted">{filteredCdms.length} CDMs</span>
            </div>

            {state.loading && state.cdms.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="font-mono text-[9px] text-sx-cyan animate-pulse tracking-widest">
                    QUERYING SPACE-TRACK.ORG…
                  </div>
                  <div className="font-mono text-[8px] text-sx-text-muted">
                    Authenticating + fetching CDMs
                  </div>
                </div>
              </div>
            ) : filteredCdms.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="font-mono text-[9px] text-sx-text-muted">NO CDMs MATCH FILTER</div>
                  <div className="font-mono text-[8px] text-sx-text-muted/60">
                    {state.error ? "Check edge function logs" : "No high-Pc events detected"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-sx-border-dim">
                {filteredCdms.map((cdm) => {
                  const color = SEV_COLOR[cdm.severity] ?? "#94a3b8";
                  const { display: tcaDisplay, hoursAway } = formatTCA(cdm.tcaUtc);
                  const isImminent = hoursAway > 0 && hoursAway < 24;

                  return (
                    <div
                      key={cdm.id}
                      className="px-4 py-3 space-y-2"
                      style={{
                        background: cdm.severity === "CRITICAL" ? "rgba(239,68,68,0.03)" : "transparent",
                        borderLeft: `2px solid ${color}`,
                      }}
                    >
                      {/* Header row */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-mono text-[8px] px-1 py-0.5 rounded font-bold"
                            style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
                          >
                            {cdm.severity}
                          </span>
                          {isImminent && (
                            <span
                              className="font-mono text-[7px] px-1 py-0.5 rounded"
                              style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", animation: "pulse 1.5s infinite" }}
                            >
                              ⚡ IMMINENT
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[8px] text-sx-text-muted">
                          CDM#{cdm.id.split("-").pop()?.slice(0, 6)}
                        </span>
                      </div>

                      {/* Satellites */}
                      <div className="space-y-0.5">
                        <div className="font-mono text-[10px] font-bold" style={{ color }}>{cdm.sat1Name}</div>
                        <div className="font-mono text-[8px] text-sx-text-muted pl-2">
                          × <span className="text-sx-text">{cdm.sat2Name}</span>
                        </div>
                        <div className="font-mono text-[7px] text-sx-text-muted/60">
                          NORADs: {cdm.sat1NoradId} × {cdm.sat2NoradId}
                        </div>
                      </div>

                      {/* Key metrics */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded p-1.5 text-center" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(30,58,95,0.5)" }}>
                          <div className="font-mono text-[9px] font-bold" style={{ color }}>
                            {formatPc(cdm.probabilityOfCollision)}
                          </div>
                          <div className="font-mono text-[7px] text-sx-text-muted mt-0.5">Pc</div>
                        </div>
                        <div className="rounded p-1.5 text-center" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(30,58,95,0.5)" }}>
                          <div className="font-mono text-[9px] font-bold text-sx-text">
                            {cdm.missDistanceKm.toFixed(2)} km
                          </div>
                          <div className="font-mono text-[7px] text-sx-text-muted mt-0.5">MISS DIST</div>
                        </div>
                        <div className="rounded p-1.5 text-center" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(30,58,95,0.5)" }}>
                          <div
                            className="font-mono text-[9px] font-bold"
                            style={{ color: isImminent ? "#ef4444" : "#94a3b8" }}
                          >
                            {tcaDisplay}
                          </div>
                          <div className="font-mono text-[7px] text-sx-text-muted mt-0.5">TCA</div>
                        </div>
                      </div>

                      {/* Extra metrics */}
                      <div className="flex items-center justify-between text-[8px] font-mono text-sx-text-muted">
                        {cdm.relativeVelocityKms && (
                          <span>Δv: {Number(cdm.relativeVelocityKms).toFixed(2)} km/s</span>
                        )}
                        {cdm.altitudeKm && (
                          <span>Alt: {Math.round(cdm.altitudeKm)} km</span>
                        )}
                        {cdm.creationDate && (
                          <span>Created: {new Date(cdm.creationDate).toUTCString().split(" ")[4]}Z</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Debris Tab */}
        {activeTab === "debris" && (
          <div className="divide-y divide-sx-border-dim">
            {state.debris.length === 0 ? (
              <div className="flex items-center justify-center p-12">
                <div className="font-mono text-[9px] text-sx-text-muted text-center">
                  {state.loading ? "LOADING DEBRIS CATALOG…" : "NO DEBRIS DATA"}
                </div>
              </div>
            ) : state.debris.map((obj) => (
              <div key={obj.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[10px] font-bold text-sx-amber truncate max-w-[200px]">
                    {obj.satName.trim()}
                  </span>
                  <span
                    className="font-mono text-[7px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}
                  >
                    DEBRIS
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {[
                    ["NORAD ID", obj.noradId],
                    ["COUNTRY", obj.country],
                    ["APOGEE", `${Math.round(obj.apogeeKm)} km`],
                    ["PERIGEE", `${Math.round(obj.perigeeKm)} km`],
                    ["INCL", `${Number(obj.inclination).toFixed(1)}°`],
                    ["RCS", obj.rcsSize || "UNKNOWN"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between">
                      <span className="font-mono text-[7px] text-sx-text-muted">{k}</span>
                      <span className="font-mono text-[8px] text-sx-text">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === "stats" && (
          <div className="p-4 space-y-4">
            <div className="font-mono text-[9px] text-sx-text-muted tracking-widest">
              CONJUNCTION ANALYSIS SUMMARY
            </div>

            {/* Pc distribution */}
            <div className="rounded border border-sx-border-dim bg-sx-surface p-3 space-y-2">
              <div className="font-mono text-[9px] text-sx-text-muted">Pc DISTRIBUTION</div>
              {[
                { label: "CRITICAL (Pc > 1e-3)",  count: critCount,                         color: "#ef4444" },
                { label: "HIGH (Pc > 1e-4)",       count: highCount,                         color: "#f59e0b" },
                { label: "ELEVATED (Pc > 1e-5)",   count: state.cdms.filter(c => c.probabilityOfCollision > 0.00001 && c.probabilityOfCollision <= 0.0001).length, color: "#fde047" },
                { label: "MONITOR (Pc ≤ 1e-5)",    count: state.cdms.filter(c => c.probabilityOfCollision <= 0.00001).length, color: "#94a3b8" },
              ].map(({ label, count, color }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-[8px]" style={{ color }}>{label}</span>
                    <span className="font-mono text-[8px] text-sx-text">{count}</span>
                  </div>
                  <div className="h-1 rounded-full bg-sx-border-dim overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: state.cdms.length > 0 ? `${(count / state.cdms.length) * 100}%` : "0%",
                        background: color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Data freshness */}
            <div className="rounded border border-sx-border-dim bg-sx-surface p-3 space-y-2">
              <div className="font-mono text-[9px] text-sx-text-muted">DATA PROVENANCE</div>
              {[
                ["SOURCE",       "SPACE-TRACK.ORG / 18 SDS"],
                ["CDM CLASS",    "CDM_PUBLIC"],
                ["LOOKBACK",     "7 DAYS"],
                ["MIN Pc FILTER","1.0 × 10⁻⁵"],
                ["POLL INTERVAL","5 MINUTES"],
                ["LAST FETCH",   state.lastFetch ? new Date(state.lastFetch).toUTCString().split(" ")[4] + "Z" : "PENDING"],
                ["TOTAL CDMs",   String(state.cdms.length)],
                ["TOTAL DEBRIS", String(state.debris.length)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="font-mono text-[8px] text-sx-text-muted">{k}</span>
                  <span className="font-mono text-[9px] text-sx-text">{v}</span>
                </div>
              ))}
            </div>

            {/* CDMs sorted by Pc */}
            {state.cdms.slice(0, 5).length > 0 && (
              <div className="rounded border border-sx-border-dim bg-sx-surface overflow-hidden">
                <div className="px-3 py-1.5 border-b border-sx-border-dim">
                  <span className="font-mono text-[9px] text-sx-text-muted">TOP 5 BY Pc</span>
                </div>
                {state.cdms.slice(0, 5).map((cdm, i) => (
                  <div key={cdm.id} className="px-3 py-1.5 flex items-center gap-2 border-b border-sx-border-dim last:border-0">
                    <span className="font-mono text-[8px] text-sx-text-muted w-4">{i + 1}.</span>
                    <span className="font-mono text-[8px] text-sx-text flex-1 truncate">{cdm.sat1Name}</span>
                    <span className="font-mono text-[8px]" style={{ color: SEV_COLOR[cdm.severity] }}>
                      {formatPc(cdm.probabilityOfCollision)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="font-mono text-[8px] text-sx-text-muted/60 leading-relaxed border-t border-sx-border-dim pt-3">
              Data sourced from Space-Track.org 18th Space Defense Squadron. Conjunction assessments
              are probabilistic — operators should consult authoritative conjunction screening tools
              before maneuver decisions. Classification: UNCLASSIFIED.
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex-shrink-0 border-t border-sx-border px-4 py-2 flex items-center justify-between"
        style={{ background: "#080e1a" }}
      >
        <div className="font-mono text-[8px] text-sx-text-muted">
          {state.lastFetch
            ? `FETCHED: ${new Date(state.lastFetch).toUTCString().split(" ")[4]}Z`
            : state.loading ? "FETCHING…" : "AWAITING DATA"}
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: state.loading ? "#f59e0b" : state.error ? "#ef4444" : "#10b981",
              boxShadow: state.loading ? "0 0 4px #f59e0b" : state.error ? "0 0 4px #ef4444" : "0 0 4px #10b981",
            }}
          />
          <span className="font-mono text-[8px] text-sx-text-muted">
            {state.loading ? "POLLING" : state.error ? "DEGRADED" : "NOMINAL"}
          </span>
        </div>
      </div>
    </div>
  );
}
