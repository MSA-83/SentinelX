// src/pages/WorkspaceManagerPage.tsx
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { workspacesApi, type DbWorkspace } from "@/lib/api/workspaces";
import { useAuth } from "@/hooks/useAuth";
import { DOMAIN_CONFIGS, DOMAIN_ORDER } from "@/constants/domains";
import type { DomainKey } from "@/types/entities";

const CLASSIFICATION_COLORS: Record<string, string> = {
  UNCLASSIFIED: "#10b981",
  CONFIDENTIAL: "#3b82f6",
  SECRET: "#f59e0b",
  TOP_SECRET: "#ef4444",
};

export function WorkspaceManagerPage() {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<DbWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Form state
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newClass, setNewClass] = useState("SECRET");
  const [newDomains, setNewDomains] = useState<Set<DomainKey>>(new Set(DOMAIN_ORDER));

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await workspacesApi.list();
      setWorkspaces(data);
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !user) return;
    setCreating(true);
    try {
      const created = await workspacesApi.create({
        name: newName,
        classification: newClass,
        description: newDesc,
        active_domains: Array.from(newDomains),
        created_by: user.id,
      });
      setWorkspaces((prev) => [...prev, created]);
      setNewName("");
      setNewDesc("");
      toast.success(`Workspace "${created.name}" created`);
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await workspacesApi.remove(id);
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
      toast.success("Workspace deleted");
    } catch (err: unknown) {
      toast.error((err as Error).message);
    }
  };

  const toggleDomain = (domain: DomainKey) => {
    setNewDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  return (
    <div className="flex h-full bg-sx-bg overflow-hidden">
      {/* Left: workspace list */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-sx-border">
        <div className="flex-shrink-0 border-b border-sx-border px-6 py-3" style={{ background: "#0d1424" }}>
          <div className="font-display font-bold text-sx-cyan tracking-widest">WORKSPACE MANAGER</div>
          <div className="font-mono text-[9px] text-sx-text-muted">MISSION WORKSPACES // PERSISTENT OPERATIONAL CONTEXTS</div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-12 font-mono text-[10px] text-sx-text-muted">LOADING WORKSPACES...</div>
          ) : workspaces.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl opacity-20 mb-3">⊟</div>
              <div className="font-mono text-[10px] text-sx-text-muted">NO WORKSPACES CONFIGURED</div>
              <div className="font-mono text-[9px] text-sx-text-muted/60 mt-1">Create one using the form on the right</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {workspaces.map((ws) => {
                const classColor = CLASSIFICATION_COLORS[ws.classification] ?? "#475569";
                return (
                  <div
                    key={ws.id}
                    className="rounded border border-sx-border-dim bg-sx-panel p-4 flex flex-col gap-3 hover:border-sx-border transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display font-bold text-sx-text">{ws.name}</div>
                        {ws.description && (
                          <div className="font-mono text-[9px] text-sx-text-muted mt-0.5">{ws.description}</div>
                        )}
                      </div>
                      <span
                        className="font-mono text-[8px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ color: classColor, background: `${classColor}12`, border: `1px solid ${classColor}30` }}
                      >
                        {ws.classification.replace("_", " ")}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {ws.active_domains.map((d) => {
                        const cfg = DOMAIN_CONFIGS[d];
                        if (!cfg) return null;
                        return (
                          <span
                            key={d}
                            className="font-mono text-[8px] px-1.5 py-0.5 rounded flex items-center gap-1"
                            style={{ background: `${cfg.color}10`, border: `1px solid ${cfg.color}25`, color: cfg.color }}
                          >
                            {cfg.icon} {cfg.shortLabel}
                          </span>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between mt-auto">
                      <span className="font-mono text-[8px] text-sx-text-muted">
                        {new Date(ws.created_at).toUTCString().split(" ").slice(0, 4).join(" ")}
                      </span>
                      <button
                        onClick={() => handleDelete(ws.id)}
                        className="font-mono text-[9px] text-sx-text-muted hover:text-sx-red transition-colors"
                      >
                        DELETE
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: create form */}
      <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden" style={{ background: "#0d1424" }}>
        <div className="flex-shrink-0 border-b border-sx-border px-4 py-3">
          <div className="font-mono text-[10px] text-sx-text-muted tracking-widest">NEW WORKSPACE</div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-1.5 block">WORKSPACE NAME</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="OPERATION ALPHA..."
              className="w-full px-3 py-2 rounded font-mono text-[10px] outline-none"
              style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
            />
          </div>
          <div>
            <label className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-1.5 block">DESCRIPTION</label>
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Mission context, AO description..."
              rows={2}
              className="w-full px-3 py-2 rounded font-mono text-[10px] outline-none resize-none"
              style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
            />
          </div>
          <div>
            <label className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-1.5 block">CLASSIFICATION</label>
            <div className="flex gap-1">
              {["UNCLASSIFIED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"].map((c) => {
                const col = CLASSIFICATION_COLORS[c];
                return (
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
                );
              })}
            </div>
          </div>

          <div>
            <label className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-1.5 block">
              INTELLIGENCE DOMAINS ({newDomains.size} selected)
            </label>
            <div className="space-y-1">
              {DOMAIN_ORDER.map((domain) => {
                const cfg = DOMAIN_CONFIGS[domain];
                const enabled = newDomains.has(domain);
                return (
                  <button
                    key={domain}
                    onClick={() => toggleDomain(domain)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded transition-all"
                    style={{
                      background: enabled ? `${cfg.color}08` : "transparent",
                      border: `1px solid ${enabled ? `${cfg.color}30` : "#0f2040"}`,
                    }}
                  >
                    <span>{cfg.icon}</span>
                    <span className="font-mono text-[9px] flex-1 text-left" style={{ color: enabled ? cfg.color : "#334155" }}>
                      {cfg.label}
                    </span>
                    <div
                      className="w-3 h-3 rounded-sm border flex items-center justify-center"
                      style={{
                        borderColor: enabled ? cfg.color : "#1e3a5f",
                        background: enabled ? cfg.color : "transparent",
                      }}
                    >
                      {enabled && <span style={{ color: "#020617", fontSize: 8, fontWeight: "bold" }}>✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

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
            {!user ? "LOGIN TO CREATE" : creating ? "CREATING..." : "CREATE WORKSPACE →"}
          </button>
        </div>
      </div>
    </div>
  );
}
