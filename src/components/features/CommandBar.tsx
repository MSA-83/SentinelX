// src/components/features/CommandBar.tsx
// Ctrl+K floating command palette — entity search, action dispatch, domain shortcuts
// Military-style command interface with fuzzy match and keyboard navigation

import { useState, useEffect, useRef, useCallback } from "react";
import type { SentinelEntity, DomainKey } from "@/types/entities";
import { DOMAIN_CONFIGS } from "@/constants/domains";
import { severityToColor } from "@/lib/threatAssessor";

interface CommandBarProps {
  open: boolean;
  onClose: () => void;
  entities: SentinelEntity[];
  onEntitySelect: (entity: SentinelEntity) => void;
  onDomainToggle: (domain: DomainKey) => void;
  enabledDomains: Set<DomainKey>;
}

type ResultType = "entity" | "action" | "domain";

interface CommandResult {
  id: string;
  type: ResultType;
  label: string;
  sublabel?: string;
  icon?: string;
  color?: string;
  entity?: SentinelEntity;
  domain?: DomainKey;
  action?: () => void;
}

const STATIC_ACTIONS: Array<Omit<CommandResult, "id">> = [
  { type: "action", label: "ACKNOWLEDGE ALL ALERTS", sublabel: "Clear all unacknowledged events", icon: "✓", color: "#10b981" },
  { type: "action", label: "PAN TO UKRAINE", sublabel: "Center map on Eastern Europe AO", icon: "⊕", color: "#00d4ff" },
  { type: "action", label: "PAN TO TAIWAN STRAIT", sublabel: "Center map on INDOPACOM AO", icon: "⊕", color: "#00d4ff" },
  { type: "action", label: "PAN TO RED SEA", sublabel: "Center map on CENTCOM AO", icon: "⊕", color: "#00d4ff" },
  { type: "action", label: "TOGGLE ALL LAYERS", sublabel: "Enable or disable all intelligence domains", icon: "⊞", color: "#a855f7" },
  { type: "action", label: "GENERATE SITREP", sublabel: "Auto-generate situation report from current picture", icon: "📋", color: "#f59e0b" },
  { type: "action", label: "EXPORT INTEL PACKAGE", sublabel: "Export current entities as GeoJSON", icon: "↓", color: "#00d4ff" },
];

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  // character sequence match
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    while (ti < t.length && t[ti] !== q[qi]) ti++;
    if (ti >= t.length) return false;
    ti++;
  }
  return true;
}

function scoreMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  return 30;
}

export function CommandBar({
  open,
  onClose,
  entities,
  onEntitySelect,
  onDomainToggle,
  enabledDomains,
}: CommandBarProps) {
  const [query,       setQuery]       = useState("");
  const [results,     setResults]     = useState<CommandResult[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);

  const buildResults = useCallback((q: string): CommandResult[] => {
    if (!q.trim()) {
      // Default: show domain toggles + top actions
      const domainResults: CommandResult[] = Object.entries(DOMAIN_CONFIGS).map(([key, cfg]) => ({
        id: `dom-${key}`,
        type: "domain" as const,
        label: `${enabledDomains.has(key as DomainKey) ? "DISABLE" : "ENABLE"} ${cfg.label.toUpperCase()} LAYER`,
        sublabel: cfg.description,
        icon: cfg.icon,
        color: cfg.color,
        domain: key as DomainKey,
      }));
      const actionResults: CommandResult[] = STATIC_ACTIONS.map((a, i) => ({
        ...a,
        id: `act-${i}`,
      }));
      return [...actionResults, ...domainResults].slice(0, 8);
    }

    // Search entities
    const matched = entities
      .filter((e) => fuzzyMatch(q, e.label) || fuzzyMatch(q, e.id) || fuzzyMatch(q, e.type))
      .sort((a, b) => scoreMatch(q, b.label) - scoreMatch(q, a.label))
      .slice(0, 6)
      .map((e) => ({
        id: `ent-${e.id}`,
        type: "entity" as const,
        label: e.label,
        sublabel: `${e.type.replace(/_/g, " ")} · ${e.severity} · ${e.source}`,
        icon: DOMAIN_CONFIGS[e.domain]?.icon,
        color: severityToColor(e.severity),
        entity: e,
      }));

    // Search domains
    const domains = Object.entries(DOMAIN_CONFIGS)
      .filter(([k, cfg]) => fuzzyMatch(q, cfg.label) || fuzzyMatch(q, k))
      .map(([key, cfg]) => ({
        id: `dom-${key}`,
        type: "domain" as const,
        label: `${enabledDomains.has(key as DomainKey) ? "DISABLE" : "ENABLE"} ${cfg.label.toUpperCase()}`,
        sublabel: cfg.description,
        icon: cfg.icon,
        color: cfg.color,
        domain: key as DomainKey,
      }));

    // Search actions
    const actions = STATIC_ACTIONS.filter((a) => fuzzyMatch(q, a.label))
      .map((a, i) => ({ ...a, id: `act-${i}` }));

    return [...matched, ...actions, ...domains].slice(0, 10);
  }, [entities, enabledDomains]);

  useEffect(() => {
    setResults(buildResults(query));
    setHighlighted(0);
  }, [query, buildResults]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, results.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
      if (e.key === "Enter") {
        const r = results[highlighted];
        if (r) handleSelect(r);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, results, highlighted, onClose]);

  const handleSelect = (result: CommandResult) => {
    if (result.entity) { onEntitySelect(result.entity); onClose(); }
    else if (result.domain) { onDomainToggle(result.domain); onClose(); }
    else if (result.action) { result.action(); onClose(); }
    else onClose();
  };

  // Scroll highlighted item into view
  useEffect(() => {
    const el = listRef.current?.children[highlighted] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[500] flex items-start justify-center"
      style={{ paddingTop: "10vh", background: "rgba(2,6,23,0.82)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-sm overflow-hidden"
        style={{
          background: "#0d1424",
          border: "1px solid #1e3a5f",
          boxShadow: "0 0 0 1px rgba(0,212,255,0.12), 0 24px 64px rgba(0,0,0,0.8), 0 0 40px rgba(0,212,255,0.06)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: "#1e3a5f" }}
        >
          <span style={{ color: "#00d4ff", fontSize: 14, opacity: 0.7 }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SEARCH ENTITIES / ACTIONS / DOMAINS…"
            className="flex-1 bg-transparent outline-none"
            style={{
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: 12,
              color: "#e2e8f0",
              letterSpacing: "0.08em",
            }}
            spellCheck={false}
            autoComplete="off"
          />
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono"
            style={{ background: "#1e3a5f", color: "#475569" }}
          >
            ESC
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: "60vh" }}>
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center font-mono text-[10px]" style={{ color: "#475569" }}>
              NO MATCHING ENTITIES OR COMMANDS
            </div>
          ) : (
            results.map((result, i) => (
              <button
                key={result.id}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setHighlighted(i)}
                className="w-full text-left flex items-center gap-3 px-4 py-2.5 transition-all border-b"
                style={{
                  background: i === highlighted ? "rgba(0,212,255,0.07)" : "transparent",
                  borderColor: "#0f2040",
                  borderLeftWidth: i === highlighted ? 2 : 0,
                  borderLeftColor: result.color ?? "#00d4ff",
                  paddingLeft: i === highlighted ? 14 : 16,
                }}
              >
                {/* Icon */}
                <span style={{ fontSize: 14, width: 20, textAlign: "center", flexShrink: 0 }}>
                  {result.icon}
                </span>

                {/* Labels */}
                <div className="flex-1 min-w-0">
                  <div
                    className="font-mono text-[11px] font-bold truncate"
                    style={{ color: result.color ?? "#e2e8f0", letterSpacing: "0.06em" }}
                  >
                    {result.label}
                  </div>
                  {result.sublabel && (
                    <div className="font-mono text-[9px] truncate mt-0.5" style={{ color: "#475569" }}>
                      {result.sublabel}
                    </div>
                  )}
                </div>

                {/* Type badge */}
                <div
                  className="flex-shrink-0 font-mono text-[8px] px-1.5 py-0.5 rounded tracking-wider"
                  style={{
                    background: `${result.color ?? "#475569"}18`,
                    color: result.color ?? "#475569",
                    border: `1px solid ${result.color ?? "#475569"}30`,
                  }}
                >
                  {result.type === "entity" ? "ENTITY" : result.type === "domain" ? "LAYER" : "CMD"}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-2 border-t"
          style={{ borderColor: "#0f2040" }}
        >
          <div className="flex items-center gap-3">
            {[["↑↓", "NAVIGATE"], ["↵", "SELECT"], ["ESC", "CLOSE"]].map(([key, label]) => (
              <div key={key} className="flex items-center gap-1">
                <kbd
                  className="px-1.5 py-0.5 rounded font-mono text-[8px]"
                  style={{ background: "#1e3a5f", color: "#94a3b8" }}
                >
                  {key}
                </kbd>
                <span className="font-mono text-[8px]" style={{ color: "#334155" }}>{label}</span>
              </div>
            ))}
          </div>
          <div className="font-mono text-[8px]" style={{ color: "#1e3a5f" }}>
            {results.length} RESULTS · SENTINEL-X COMMAND INTERFACE
          </div>
        </div>
      </div>
    </div>
  );
}
