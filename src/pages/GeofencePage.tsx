// src/pages/GeofencePage.tsx
// Geofence manager — draw, name, classify, and persist AOI zones with violation tracking
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { DOMAIN_CONFIGS, DOMAIN_ORDER } from "@/constants/domains";
import type { DomainKey } from "@/types/entities";

interface Geofence {
  id: string;
  name: string;
  fence_type: string;
  coordinates: { lat: number; lon: number }[];
  radius_km?: number;
  color: string;
  active: boolean;
  classification: string;
  trigger_domains: string[];
  description?: string;
  created_by?: string;
  created_at: string;
}

const FENCE_COLORS = [
  { label: "RED ZONE",    value: "#ef4444" },
  { label: "AMBER ZONE",  value: "#f59e0b" },
  { label: "BLUE ZONE",   value: "#3b82f6" },
  { label: "GREEN ZONE",  value: "#10b981" },
  { label: "PURPLE ZONE", value: "#a855f7" },
  { label: "CYAN ZONE",   value: "#00d4ff" },
];

const PRESET_ZONES = [
  {
    name: "EASTERN UKRAINE AO",
    coordinates: [
      { lat: 51.5, lon: 28.5 }, { lat: 51.5, lon: 40.5 },
      { lat: 46.5, lon: 40.5 }, { lat: 46.5, lon: 28.5 },
    ],
    color: "#ef4444",
    classification: "SECRET",
    trigger_domains: ["conflict", "aviation", "sigint"],
    fence_type: "POLYGON",
  },
  {
    name: "TAIWAN STRAIT WATCH ZONE",
    coordinates: [
      { lat: 27.0, lon: 118.0 }, { lat: 27.0, lon: 123.0 },
      { lat: 22.0, lon: 123.0 }, { lat: 22.0, lon: 118.0 },
    ],
    color: "#f59e0b",
    classification: "TOP_SECRET",
    trigger_domains: ["maritime", "aviation", "nuclear"],
    fence_type: "POLYGON",
  },
  {
    name: "PERSIAN GULF MARITIME EXCLUSION",
    coordinates: [
      { lat: 30.0, lon: 46.0 }, { lat: 30.0, lon: 58.0 },
      { lat: 22.0, lon: 58.0 }, { lat: 22.0, lon: 46.0 },
    ],
    color: "#f97316",
    classification: "SECRET",
    trigger_domains: ["maritime", "nuclear"],
    fence_type: "POLYGON",
  },
  {
    name: "KOREAN PENINSULA DMZ BUFFER",
    coordinates: [
      { lat: 39.5, lon: 124.0 }, { lat: 39.5, lon: 130.0 },
      { lat: 36.5, lon: 130.0 }, { lat: 36.5, lon: 124.0 },
    ],
    color: "#a855f7",
    classification: "TOP_SECRET",
    trigger_domains: ["conflict", "nuclear", "aviation"],
    fence_type: "POLYGON",
  },
];

export function GeofencePage() {
  const { user } = useAuth();
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Geofence | null>(null);
  const [creating, setCreating] = useState(false);

  // Form state
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState("#ef4444");
  const [newClass, setNewClass] = useState("SECRET");
  const [newDomains, setNewDomains] = useState<Set<DomainKey>>(new Set(["conflict", "aviation"]));
  const [newType, setNewType] = useState<"POLYGON" | "CIRCLE">("POLYGON");
  const [newRadiusKm, setNewRadiusKm] = useState(100);
  const [newCenter, setNewCenter] = useState({ lat: 48.5, lon: 37.5 });

  useEffect(() => {
    loadGeofences();
  }, []);

  const loadGeofences = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("geofences").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setGeofences(data ?? []);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newName.trim() || !user) return;
    setCreating(true);
    try {
      const payload = {
        name: newName,
        description: newDesc || null,
        fence_type: newType,
        coordinates: newType === "CIRCLE"
          ? [{ lat: newCenter.lat, lon: newCenter.lon }]
          : PRESET_ZONES.find((z) => z.name === newName)?.coordinates ?? [{ lat: newCenter.lat, lon: newCenter.lon }],
        radius_km: newType === "CIRCLE" ? newRadiusKm : null,
        color: newColor,
        active: true,
        classification: newClass,
        trigger_domains: Array.from(newDomains),
        created_by: user.id,
      };
      const { data, error } = await supabase.from("geofences").insert(payload).select().single();
      if (error) throw error;
      setGeofences((prev) => [data, ...prev]);
      setNewName("");
      setNewDesc("");
      toast.success(`Geofence "${data.name}" created`);
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handlePreset = (preset: typeof PRESET_ZONES[0]) => {
    setNewName(preset.name);
    setNewColor(preset.color);
    setNewClass(preset.classification);
    setNewDomains(new Set(preset.trigger_domains as DomainKey[]));
    setNewType("POLYGON");
  };

  const handleToggleActive = async (fence: Geofence) => {
    const { data, error } = await supabase
      .from("geofences")
      .update({ active: !fence.active })
      .eq("id", fence.id)
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    setGeofences((prev) => prev.map((g) => g.id === fence.id ? data : g));
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("geofences").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setGeofences((prev) => prev.filter((g) => g.id !== id));
    if (selected?.id === id) setSelected(null);
    toast.success("Geofence removed");
  };

  const toggleDomain = (domain: DomainKey) => {
    setNewDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain); else next.add(domain);
      return next;
    });
  };

  const activeCount = geofences.filter((g) => g.active).length;

  return (
    <div className="flex h-full bg-sx-bg overflow-hidden">
      {/* Left: geofence list */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-sx-border">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-sx-border px-6 py-3 flex items-center justify-between" style={{ background: "#0d1424" }}>
          <div>
            <div className="font-display font-bold text-sx-cyan tracking-widest">GEOFENCE MANAGER</div>
            <div className="font-mono text-[9px] text-sx-text-muted">AOI ZONES // BOUNDARY MONITORING // VIOLATION TRACKING</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="font-mono text-lg font-bold text-sx-green">{activeCount}</div>
              <div className="font-mono text-[9px] text-sx-text-muted">ACTIVE</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-lg font-bold text-sx-cyan">{geofences.length}</div>
              <div className="font-mono text-[9px] text-sx-text-muted">TOTAL</div>
            </div>
          </div>
        </div>

        {/* Map canvas placeholder — visual representation */}
        <div className="flex-shrink-0 mx-4 mt-4 mb-3 rounded border border-sx-border-dim overflow-hidden" style={{ height: 240, background: "#080e1a", position: "relative" }}>
          {/* Grid */}
          <div className="absolute inset-0" style={{
            backgroundImage: "linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
          }} />
          {/* Zones preview */}
          {geofences.filter((g) => g.active).map((fence, i) => (
            <div
              key={fence.id}
              className="absolute rounded font-mono text-[8px] px-2 py-1 cursor-pointer transition-all"
              style={{
                border: `1px solid ${fence.color}60`,
                background: `${fence.color}10`,
                color: fence.color,
                top: `${10 + (i % 4) * 50}px`,
                left: `${10 + (Math.floor(i / 4) % 3) * 120}px`,
                maxWidth: 110,
              }}
              onClick={() => setSelected(fence)}
            >
              <div className="flex items-center gap-1 mb-0.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: fence.color }} />
                <span className="font-bold truncate">{fence.fence_type}</span>
              </div>
              <div className="truncate opacity-80">{fence.name.slice(0, 18)}</div>
            </div>
          ))}
          {geofences.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-sx-text-muted">
              NO GEOFENCES CONFIGURED — ADD ZONES USING THE PANEL ON THE RIGHT
            </div>
          )}
          <div className="absolute bottom-2 right-3 font-mono text-[8px]" style={{ color: "rgba(0,212,255,0.3)" }}>
            SCHEMATIC VIEW // GEOFENCE MAP
          </div>
        </div>

        {/* Geofence list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="text-center py-8 font-mono text-[10px] text-sx-text-muted">LOADING GEOFENCES...</div>
          ) : geofences.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl opacity-20 mb-3">◯</div>
              <div className="font-mono text-[10px] text-sx-text-muted">NO GEOFENCES DEFINED</div>
              <div className="font-mono text-[9px] text-sx-text-muted/60 mt-1">Use presets or create a custom zone</div>
            </div>
          ) : (
            geofences.map((fence) => {
              const isSelected = selected?.id === fence.id;
              return (
                <div
                  key={fence.id}
                  className="rounded border transition-all"
                  style={{
                    borderColor: isSelected ? `${fence.color}50` : "#1e3a5f",
                    background: isSelected ? `${fence.color}08` : "#0d1424",
                    borderLeft: `3px solid ${fence.active ? fence.color : "#1e3a5f"}`,
                  }}
                >
                  <button
                    className="w-full text-left px-4 py-3"
                    onClick={() => setSelected(isSelected ? null : fence)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: fence.color }} />
                          <span className="font-mono text-[11px] font-bold text-sx-text truncate">{fence.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[8px] px-1.5 py-0.5 rounded"
                            style={{ color: "#94a3b8", background: "#0f2040", border: "1px solid #1e3a5f" }}>
                            {fence.fence_type}
                          </span>
                          <span className="font-mono text-[8px] px-1.5 py-0.5 rounded"
                            style={{ color: "#f59e0b", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                            {fence.classification.replace("_", " ")}
                          </span>
                          {fence.radius_km && (
                            <span className="font-mono text-[8px] text-sx-text-muted">r={fence.radius_km}km</span>
                          )}
                          <span className="font-mono text-[8px]" style={{ color: fence.active ? "#10b981" : "#475569" }}>
                            {fence.active ? "● ACTIVE" : "○ INACTIVE"}
                          </span>
                        </div>
                        {fence.trigger_domains.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {fence.trigger_domains.map((d) => {
                              const cfg = DOMAIN_CONFIGS[d as DomainKey];
                              return cfg ? (
                                <span key={d} className="font-mono text-[8px] px-1 py-0.5 rounded"
                                  style={{ color: cfg.color, background: `${cfg.color}10`, border: `1px solid ${cfg.color}25` }}>
                                  {cfg.icon} {cfg.shortLabel}
                                </span>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleActive(fence); }}
                          className="font-mono text-[9px] px-2 py-0.5 rounded transition-all"
                          style={{
                            background: fence.active ? "rgba(16,185,129,0.08)" : "#080e1a",
                            border: `1px solid ${fence.active ? "rgba(16,185,129,0.3)" : "#1e3a5f"}`,
                            color: fence.active ? "#10b981" : "#475569",
                          }}
                        >
                          {fence.active ? "ACTIVE" : "INACTIVE"}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(fence.id); }}
                          className="font-mono text-[8px] text-sx-text-muted hover:text-sx-red transition-colors"
                        >
                          REMOVE
                        </button>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right: create form + selected detail */}
      <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden" style={{ background: "#0d1424" }}>
        <div className="flex-shrink-0 border-b border-sx-border px-4 py-3">
          <div className="font-mono text-[10px] text-sx-text-muted tracking-widest">
            {selected ? "ZONE DETAILS" : "CREATE GEOFENCE"}
          </div>
        </div>

        {selected ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="rounded border p-3" style={{ borderColor: `${selected.color}40`, background: `${selected.color}08` }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-sm" style={{ background: selected.color }} />
                <span className="font-display font-bold text-sx-text">{selected.name}</span>
              </div>
              {selected.description && (
                <div className="font-mono text-[9px] text-sx-text-muted">{selected.description}</div>
              )}
            </div>

            {[
              ["ZONE TYPE", selected.fence_type],
              ["CLASSIFICATION", selected.classification.replace("_", " ")],
              ["STATUS", selected.active ? "ACTIVE — MONITORING" : "INACTIVE"],
              ["RADIUS", selected.radius_km ? `${selected.radius_km} km` : "Polygon boundary"],
              ["VERTICES", `${selected.coordinates?.length ?? 0} coordinate points`],
              ["CREATED", new Date(selected.created_at).toUTCString().split(" ").slice(0, 4).join(" ")],
            ].map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-2 py-1 border-b border-sx-border-dim">
                <span className="font-mono text-[9px] text-sx-text-muted">{k}</span>
                <span className="font-mono text-[9px] text-sx-text text-right">{v}</span>
              </div>
            ))}

            <div>
              <div className="font-mono text-[9px] text-sx-text-muted mb-2">MONITORED DOMAINS</div>
              <div className="flex flex-wrap gap-1">
                {selected.trigger_domains.map((d) => {
                  const cfg = DOMAIN_CONFIGS[d as DomainKey];
                  return cfg ? (
                    <span key={d} className="font-mono text-[9px] px-2 py-0.5 rounded flex items-center gap-1"
                      style={{ color: cfg.color, background: `${cfg.color}10`, border: `1px solid ${cfg.color}25` }}>
                      {cfg.icon} {cfg.label}
                    </span>
                  ) : null;
                })}
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <button
                onClick={() => handleToggleActive(selected)}
                className="w-full py-2 rounded font-mono text-[10px] font-bold tracking-wider uppercase transition-all"
                style={{
                  background: selected.active ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)",
                  border: `1px solid ${selected.active ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`,
                  color: selected.active ? "#ef4444" : "#10b981",
                }}
              >
                {selected.active ? "DEACTIVATE ZONE" : "ACTIVATE ZONE"}
              </button>
              <button
                onClick={() => { handleDelete(selected.id); setSelected(null); }}
                className="w-full py-2 rounded font-mono text-[10px] font-bold tracking-wider uppercase transition-all"
                style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}
              >
                DELETE ZONE →
              </button>
              <button
                onClick={() => setSelected(null)}
                className="w-full py-1.5 rounded font-mono text-[9px] transition-all"
                style={{ color: "#475569", border: "1px solid #1e3a5f" }}
              >
                ← BACK TO CREATE
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Presets */}
            <div>
              <label className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-2 block">TACTICAL PRESETS</label>
              <div className="space-y-1">
                {PRESET_ZONES.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handlePreset(preset)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded text-left transition-all"
                    style={{ background: "#080e1a", border: "1px solid #1e3a5f" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${preset.color}40`)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1e3a5f")}
                  >
                    <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: preset.color }} />
                    <span className="font-mono text-[9px] text-sx-text-muted truncate">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-sx-border-dim pt-3">
              <label className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-1.5 block">ZONE NAME</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="OPERATION ZONE ALPHA..."
                className="w-full px-3 py-2 rounded font-mono text-[10px] outline-none"
                style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
              />
            </div>

            <div>
              <label className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-1.5 block">DESCRIPTION</label>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Zone purpose, AO notes..."
                rows={2}
                className="w-full px-3 py-2 rounded font-mono text-[10px] outline-none resize-none"
                style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
              />
            </div>

            <div>
              <label className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-1.5 block">ZONE COLOR</label>
              <div className="flex gap-1.5 flex-wrap">
                {FENCE_COLORS.map(({ label, value }) => (
                  <button
                    key={value}
                    onClick={() => setNewColor(value)}
                    className="w-8 h-8 rounded border-2 transition-all"
                    style={{
                      background: value,
                      borderColor: newColor === value ? "#fff" : "transparent",
                      opacity: newColor === value ? 1 : 0.6,
                    }}
                    title={label}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-1.5 block">FENCE TYPE</label>
              <div className="flex gap-1">
                {(["POLYGON", "CIRCLE"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setNewType(t)}
                    className="flex-1 py-1.5 rounded font-mono text-[9px] uppercase tracking-wider transition-all"
                    style={{
                      background: newType === t ? "rgba(0,212,255,0.12)" : "transparent",
                      color: newType === t ? "#00d4ff" : "#475569",
                      border: `1px solid ${newType === t ? "rgba(0,212,255,0.3)" : "#0f2040"}`,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {newType === "CIRCLE" && (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="font-mono text-[8px] text-sx-text-muted mb-1 block">RADIUS (km)</label>
                    <input
                      type="number"
                      value={newRadiusKm}
                      onChange={(e) => setNewRadiusKm(Number(e.target.value))}
                      className="w-full px-2 py-1.5 rounded font-mono text-[10px] outline-none"
                      style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-mono text-[8px] text-sx-text-muted mb-1 block">CENTER LAT</label>
                      <input
                        type="number"
                        value={newCenter.lat}
                        step={0.1}
                        onChange={(e) => setNewCenter((p) => ({ ...p, lat: Number(e.target.value) }))}
                        className="w-full px-2 py-1.5 rounded font-mono text-[10px] outline-none"
                        style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
                      />
                    </div>
                    <div>
                      <label className="font-mono text-[8px] text-sx-text-muted mb-1 block">CENTER LON</label>
                      <input
                        type="number"
                        value={newCenter.lon}
                        step={0.1}
                        onChange={(e) => setNewCenter((p) => ({ ...p, lon: Number(e.target.value) }))}
                        className="w-full px-2 py-1.5 rounded font-mono text-[10px] outline-none"
                        style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-1.5 block">CLASSIFICATION</label>
              <div className="flex gap-1">
                {[["UNCLASSIFIED", "#10b981"], ["SECRET", "#f59e0b"], ["TOP_SECRET", "#ef4444"]].map(([c, col]) => (
                  <button
                    key={c}
                    onClick={() => setNewClass(c)}
                    className="flex-1 py-1 rounded font-mono text-[7px] uppercase tracking-wider transition-all"
                    style={{
                      background: newClass === c ? `${col}15` : "transparent",
                      color: newClass === c ? col : "#334155",
                      border: `1px solid ${newClass === c ? `${col}40` : "#0f2040"}`,
                    }}
                  >
                    {c.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-1.5 block">
                TRIGGER DOMAINS ({newDomains.size})
              </label>
              <div className="space-y-1">
                {DOMAIN_ORDER.map((domain) => {
                  const cfg = DOMAIN_CONFIGS[domain];
                  const enabled = newDomains.has(domain);
                  return (
                    <button
                      key={domain}
                      onClick={() => toggleDomain(domain)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded transition-all text-left"
                      style={{
                        background: enabled ? `${cfg.color}08` : "transparent",
                        border: `1px solid ${enabled ? `${cfg.color}30` : "#0f2040"}`,
                      }}
                    >
                      <span className="text-sm">{cfg.icon}</span>
                      <span className="font-mono text-[9px] flex-1" style={{ color: enabled ? cfg.color : "#334155" }}>
                        {cfg.shortLabel}
                      </span>
                      <div
                        className="w-3 h-3 rounded-sm border flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: enabled ? cfg.color : "#1e3a5f", background: enabled ? cfg.color : "transparent" }}
                      >
                        {enabled && <span style={{ color: "#020617", fontSize: 8, fontWeight: "bold" }}>✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!selected && (
          <div className="flex-shrink-0 border-t border-sx-border p-4">
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !user}
              className="w-full py-2.5 rounded font-mono text-[10px] font-bold tracking-widest uppercase transition-all"
              style={{
                background: "rgba(0,212,255,0.12)",
                border: "1px solid rgba(0,212,255,0.3)",
                color: !newName.trim() || !user ? "#334155" : "#00d4ff",
                cursor: !newName.trim() || !user ? "not-allowed" : "pointer",
              }}
            >
              {!user ? "LOGIN TO CREATE" : creating ? "CREATING ZONE..." : "CREATE GEOFENCE →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
