// src/pages/KnowledgeGraphPage.tsx
// Entity relationship knowledge graph — SVG force-directed visualization
import { useEffect, useRef, useState, useMemo } from "react";
import { useEntityStream } from "@/hooks/useEntityStream";
import { DOMAIN_CONFIGS } from "@/constants/domains";
import { severityToColor } from "@/lib/threatAssessor";
import type { SentinelEntity } from "@/types/entities";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  domain: string;
  severity: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
}

interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

const RELATION_TYPES = [
  "OBSERVED_NEAR",
  "SAME_AIRSPACE",
  "SAME_MARITIME_ZONE",
  "LINKED_SIGNAL",
  "CORRELATED_EVENT",
  "SAME_THEATER",
];

function buildGraph(entities: SentinelEntity[], maxNodes: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const sample = entities.slice(0, maxNodes);
  const W = 900;
  const H = 600;

  const nodes: GraphNode[] = sample.map((e, i) => {
    const angle = (i / sample.length) * Math.PI * 2;
    const radius = 200 + Math.random() * 80;
    const cfg = DOMAIN_CONFIGS[e.domain as keyof typeof DOMAIN_CONFIGS];
    return {
      id: e.id,
      label: e.label,
      type: e.type,
      domain: e.domain,
      severity: e.severity,
      x: W / 2 + Math.cos(angle) * radius,
      y: H / 2 + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      r: e.severity === "CRITICAL" ? 16 : e.severity === "HIGH" ? 13 : 10,
      color: cfg?.color ?? "#475569",
    };
  });

  // Build edges based on proximity and domain correlation
  const edges: GraphEdge[] = [];
  const usedPairs = new Set<string>();

  for (let i = 0; i < sample.length; i++) {
    const a = sample[i];
    for (let j = i + 1; j < sample.length; j++) {
      const b = sample[j];
      const pairKey = `${a.id}-${b.id}`;
      if (usedPairs.has(pairKey)) continue;

      const dlat = a.position.lat - b.position.lat;
      const dlon = a.position.lon - b.position.lon;
      const dist = Math.sqrt(dlat * dlat + dlon * dlon);

      let relation = "";
      if (a.domain === b.domain && dist < 15) relation = "SAME_AIRSPACE";
      else if (a.domain === "sigint" && (b.severity === "CRITICAL" || b.severity === "HIGH")) relation = "LINKED_SIGNAL";
      else if (a.domain === "conflict" || b.domain === "conflict") relation = "CORRELATED_EVENT";
      else if (dist < 5) relation = "OBSERVED_NEAR";
      else if (dist < 20) relation = "SAME_THEATER";

      if (relation && Math.random() < 0.35) {
        edges.push({
          source: a.id,
          target: b.id,
          relation,
          weight: 1 / (dist + 1),
        });
        usedPairs.add(pairKey);
        if (edges.length >= 80) break;
      }
    }
    if (edges.length >= 80) break;
  }

  return { nodes, edges };
}

const RELATION_COLORS: Record<string, string> = {
  OBSERVED_NEAR: "#00d4ff",
  SAME_AIRSPACE: "#a855f7",
  SAME_MARITIME_ZONE: "#3b82f6",
  LINKED_SIGNAL: "#ec4899",
  CORRELATED_EVENT: "#ef4444",
  SAME_THEATER: "#f59e0b",
};

export function KnowledgeGraphPage() {
  const { entities } = useEntityStream();
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [filterDomain, setFilterDomain] = useState<string>("ALL");
  const [maxNodes, setMaxNodes] = useState(30);
  const [showLabels, setShowLabels] = useState(true);
  const frameRef = useRef<number>();
  const nodesRef = useRef<GraphNode[]>([]);

  const filtered = useMemo(
    () => filterDomain === "ALL" ? entities : entities.filter((e) => e.domain === filterDomain),
    [entities, filterDomain]
  );

  // Build graph on entity change
  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(filtered, maxNodes);
    nodesRef.current = n;
    setNodes([...n]);
    setEdges(e);
  }, [filtered, maxNodes]);

  // Simple force simulation
  useEffect(() => {
    if (nodes.length === 0) return;

    const W = 900;
    const H = 600;
    const edgeMap = new Map<string, string[]>();
    for (const e of edges) {
      if (!edgeMap.has(e.source)) edgeMap.set(e.source, []);
      if (!edgeMap.has(e.target)) edgeMap.set(e.target, []);
      edgeMap.get(e.source)!.push(e.target);
      edgeMap.get(e.target)!.push(e.source);
    }

    let tick = 0;
    const simulate = () => {
      const ns = nodesRef.current;
      if (tick++ > 200) return; // stop after convergence

      for (let i = 0; i < ns.length; i++) {
        const a = ns[i];
        a.vx *= 0.85;
        a.vy *= 0.85;

        // Center gravity
        a.vx += (W / 2 - a.x) * 0.003;
        a.vy += (H / 2 - a.y) * 0.003;

        // Repulsion
        for (let j = 0; j < ns.length; j++) {
          if (i === j) continue;
          const b = ns[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
          const force = 800 / (d * d);
          a.vx += (dx / d) * force;
          a.vy += (dy / d) * force;
        }

        // Attraction along edges
        const neighbors = edgeMap.get(a.id) ?? [];
        for (const nid of neighbors) {
          const b = ns.find((n) => n.id === nid);
          if (!b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
          const force = (d - 120) * 0.02;
          a.vx += (dx / d) * force;
          a.vy += (dy / d) * force;
        }

        a.x = Math.max(30, Math.min(W - 30, a.x + a.vx));
        a.y = Math.max(30, Math.min(H - 30, a.y + a.vy));
      }

      setNodes([...nodesRef.current]);
      frameRef.current = requestAnimationFrame(simulate);
    };

    frameRef.current = requestAnimationFrame(simulate);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [edges]);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const hoveredEdges = useMemo(() => {
    if (!hovered) return new Set<string>();
    return new Set(
      edges
        .filter((e) => e.source === hovered || e.target === hovered)
        .map((e) => `${e.source}-${e.target}`)
    );
  }, [hovered, edges]);

  const selectedEntity = selected ? entities.find((e) => e.id === selected.id) : null;

  return (
    <div className="flex h-full bg-sx-bg overflow-hidden">
      {/* Main graph view */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-sx-border px-6 py-3 flex items-center justify-between" style={{ background: "#0d1424" }}>
          <div>
            <div className="font-display font-bold text-sx-cyan tracking-widest">KNOWLEDGE GRAPH</div>
            <div className="font-mono text-[9px] text-sx-text-muted">ENTITY RELATIONSHIP INTELLIGENCE // LINK ANALYSIS</div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={filterDomain}
              onChange={(e) => setFilterDomain(e.target.value)}
              className="px-2 py-1.5 rounded font-mono text-[10px] outline-none"
              style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#94a3b8" }}
            >
              <option value="ALL">ALL DOMAINS</option>
              {Object.entries(DOMAIN_CONFIGS).map(([k, cfg]) => (
                <option key={k} value={k}>{cfg.label.toUpperCase()}</option>
              ))}
            </select>
            <select
              value={maxNodes}
              onChange={(e) => setMaxNodes(Number(e.target.value))}
              className="px-2 py-1.5 rounded font-mono text-[10px] outline-none"
              style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#94a3b8" }}
            >
              {[15, 25, 35, 50].map((n) => (
                <option key={n} value={n}>MAX {n} NODES</option>
              ))}
            </select>
            <button
              onClick={() => setShowLabels((v) => !v)}
              className="px-3 py-1.5 rounded font-mono text-[9px] transition-all"
              style={{
                background: showLabels ? "rgba(0,212,255,0.12)" : "#080e1a",
                border: showLabels ? "1px solid rgba(0,212,255,0.3)" : "1px solid #1e3a5f",
                color: showLabels ? "#00d4ff" : "#475569",
              }}
            >
              LABELS
            </button>
            <div className="text-center">
              <div className="font-mono text-sm font-bold text-sx-cyan">{nodes.length}</div>
              <div className="font-mono text-[8px] text-sx-text-muted">NODES</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-sm font-bold" style={{ color: "#a855f7" }}>{edges.length}</div>
              <div className="font-mono text-[8px] text-sx-text-muted">EDGES</div>
            </div>
          </div>
        </div>

        {/* SVG graph canvas */}
        <div className="flex-1 overflow-hidden relative" style={{ background: "#020617" }}>
          {/* Grid overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: "linear-gradient(rgba(0,212,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.025) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }} />

          <svg
            ref={svgRef}
            className="w-full h-full"
            viewBox="0 0 900 600"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {Object.entries(RELATION_COLORS).map(([rel, color]) => (
                <marker
                  key={rel}
                  id={`arrow-${rel}`}
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L0,6 L9,3 z" fill={color} opacity="0.6" />
                </marker>
              ))}
            </defs>

            {/* Edges */}
            {edges.map((edge) => {
              const src = nodeMap.get(edge.source);
              const tgt = nodeMap.get(edge.target);
              if (!src || !tgt) return null;
              const pairKey = `${edge.source}-${edge.target}`;
              const isHighlighted = hoveredEdges.has(pairKey);
              const color = RELATION_COLORS[edge.relation] ?? "#1e3a5f";
              return (
                <line
                  key={pairKey}
                  x1={src.x}
                  y1={src.y}
                  x2={tgt.x}
                  y2={tgt.y}
                  stroke={color}
                  strokeWidth={isHighlighted ? 2 : 0.75}
                  opacity={isHighlighted ? 0.85 : (hovered ? 0.1 : 0.3)}
                  strokeDasharray={edge.relation === "SAME_THEATER" ? "4 4" : "none"}
                  markerEnd={isHighlighted ? `url(#arrow-${edge.relation})` : "none"}
                  style={{ transition: "opacity 0.15s" }}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const isHov = hovered === node.id;
              const isSel = selected?.id === node.id;
              const color = node.color;
              const sColor = severityToColor(node.severity as any);
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelected(isSel ? null : node)}
                >
                  {/* Pulse ring for anomaly severity */}
                  {(node.severity === "CRITICAL" || node.severity === "HIGH") && (
                    <circle r={node.r + 8} fill="none" stroke={sColor} strokeWidth="0.75" opacity="0">
                      <animate attributeName="r" from={node.r + 3} to={node.r + 16} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {/* Selection ring */}
                  {isSel && (
                    <circle r={node.r + 10} fill="none" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.9">
                      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="6s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {/* Node circle */}
                  <circle
                    r={node.r + (isHov ? 3 : 0)}
                    fill={`${color}20`}
                    stroke={isSel ? "#00d4ff" : isHov ? color : `${color}80`}
                    strokeWidth={isSel ? 2 : isHov ? 1.5 : 1}
                    style={{ transition: "all 0.12s" }}
                  />
                  {/* Inner fill */}
                  <circle r={node.r * 0.6} fill={color} opacity="0.6" />
                  {/* Label */}
                  {(showLabels || isHov || isSel) && (
                    <text
                      y={node.r + 12}
                      textAnchor="middle"
                      fill={isHov || isSel ? color : "#475569"}
                      fontSize={isHov || isSel ? 9 : 7}
                      fontFamily="'Share Tech Mono',monospace"
                      fontWeight={isHov || isSel ? "bold" : "normal"}
                      style={{ pointerEvents: "none", transition: "all 0.12s" }}
                    >
                      {node.label.slice(0, 14)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div
            className="absolute bottom-4 left-4 rounded border border-sx-border-dim p-3 space-y-1.5"
            style={{ background: "rgba(13,20,36,0.9)", backdropFilter: "blur(4px)" }}
          >
            <div className="font-mono text-[8px] text-sx-text-muted tracking-widest mb-1">RELATIONSHIP TYPES</div>
            {Object.entries(RELATION_COLORS).map(([rel, color]) => (
              <div key={rel} className="flex items-center gap-2">
                <div className="w-4 h-0.5" style={{ background: color, opacity: 0.7 }} />
                <span className="font-mono text-[8px]" style={{ color }}>{rel.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>

          {/* Hover tooltip */}
          {hovered && (() => {
            const n = nodeMap.get(hovered);
            if (!n) return null;
            const connectedEdges = edges.filter((e) => e.source === hovered || e.target === hovered);
            return (
              <div
                className="absolute top-4 right-4 rounded border p-3 space-y-1.5 pointer-events-none"
                style={{
                  background: "rgba(13,20,36,0.95)",
                  borderColor: `${n.color}40`,
                  boxShadow: `0 0 16px ${n.color}20`,
                  minWidth: 180,
                }}
              >
                <div className="font-mono text-[10px] font-bold" style={{ color: n.color }}>{n.label}</div>
                <div className="font-mono text-[8px] text-sx-text-muted">{n.type.replace(/_/g, " ")}</div>
                <div className="font-mono text-[8px]" style={{ color: severityToColor(n.severity as any) }}>{n.severity}</div>
                <div className="font-mono text-[8px] text-sx-text-muted">{connectedEdges.length} CONNECTIONS</div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Right: selected node detail */}
      <div className="w-64 flex-shrink-0 flex flex-col overflow-hidden border-l border-sx-border" style={{ background: "#0d1424" }}>
        <div className="flex-shrink-0 border-b border-sx-border px-4 py-3">
          <div className="font-mono text-[10px] text-sx-text-muted tracking-widest">LINK ANALYSIS</div>
        </div>

        {selected && selectedEntity ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-3 animate-fade-in">
            <div className="rounded border p-3" style={{ borderColor: `${selected.color}40`, background: `${selected.color}06` }}>
              <div className="font-mono text-[10px] font-bold mb-1" style={{ color: selected.color }}>{selected.label}</div>
              <div className="font-mono text-[8px] text-sx-text-muted">{selected.type.replace(/_/g, " ")}</div>
              <div className="font-mono text-[9px] mt-1.5" style={{ color: severityToColor(selected.severity as any) }}>
                {selected.severity}
              </div>
            </div>

            {/* Connected nodes */}
            <div>
              <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-2">LINKED ENTITIES</div>
              <div className="space-y-1.5">
                {edges
                  .filter((e) => e.source === selected.id || e.target === selected.id)
                  .map((edge) => {
                    const otherId = edge.source === selected.id ? edge.target : edge.source;
                    const other = nodeMap.get(otherId);
                    if (!other) return null;
                    const relColor = RELATION_COLORS[edge.relation] ?? "#475569";
                    return (
                      <button
                        key={`${edge.source}-${edge.target}`}
                        onClick={() => setSelected(other)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-all hover:bg-sx-surface"
                        style={{ border: "1px solid #1e3a5f" }}
                      >
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: other.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-[9px] text-sx-text truncate">{other.label}</div>
                          <div className="font-mono text-[8px]" style={{ color: relColor }}>
                            {edge.relation.replace(/_/g, " ")}
                          </div>
                        </div>
                      </button>
                    );
                  }).filter(Boolean)}
              </div>
            </div>

            {/* Entity metadata */}
            <div>
              <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-2">ENTITY DATA</div>
              {[
                ["SOURCE", selectedEntity.source],
                ["CONFIDENCE", `${(selectedEntity.confidence * 100).toFixed(0)}%`],
                ["CLASSIFICATION", selectedEntity.classification.replace("_", " ")],
                ["DOMAIN", DOMAIN_CONFIGS[selectedEntity.domain]?.label ?? selectedEntity.domain],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-2 py-1 border-b border-sx-border-dim">
                  <span className="font-mono text-[8px] text-sx-text-muted">{k}</span>
                  <span className="font-mono text-[9px] text-sx-text text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="text-4xl opacity-20 mb-3">◉</div>
            <div className="font-mono text-[10px] text-sx-text-muted">CLICK A NODE TO INSPECT</div>
            <div className="font-mono text-[9px] text-sx-text-muted/60 mt-1">
              Hover to highlight connections
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
