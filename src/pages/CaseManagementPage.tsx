// src/pages/CaseManagementPage.tsx
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { casesApi, type Case, type CaseNote } from "@/lib/api/cases";
import { useAuth } from "@/hooks/useAuth";
import { severityToColor } from "@/lib/threatAssessor";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "#00d4ff", ACTIVE: "#10b981", PENDING: "#f59e0b",
  CLOSED: "#475569", ARCHIVED: "#334155",
};
const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444", HIGH: "#f59e0b", MEDIUM: "#fde047", LOW: "#00d4ff",
};

export function CaseManagementPage() {
  const { user } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [selected, setSelected] = useState<Case | null>(null);
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  // New case form state
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState<Case["priority"]>("MEDIUM");
  const [newClassification, setNewClassification] = useState("SECRET");

  useEffect(() => {
    loadCases();
  }, []);

  useEffect(() => {
    if (selected) loadNotes(selected.id);
  }, [selected]);

  const loadCases = async () => {
    setLoading(true);
    try {
      const data = await casesApi.list();
      setCases(data);
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadNotes = async (caseId: string) => {
    try {
      const data = await casesApi.getNotes(caseId);
      setNotes(data);
    } catch (err: unknown) {
      toast.error((err as Error).message);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !user) return;
    setCreating(true);
    try {
      const created = await casesApi.create({
        title: newTitle,
        description: newDesc,
        priority: newPriority,
        classification: newClassification,
        status: "OPEN",
        created_by: user.id,
      });
      setCases((prev) => [created, ...prev]);
      setNewTitle("");
      setNewDesc("");
      setCreating(false);
      toast.success(`Case ${created.case_number} created`);
    } catch (err: unknown) {
      toast.error((err as Error).message);
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (caseId: string, status: Case["status"]) => {
    try {
      const updated = await casesApi.update(caseId, { status, closed_at: status === "CLOSED" ? new Date().toISOString() : undefined });
      setCases((prev) => prev.map((c) => (c.id === caseId ? updated : c)));
      if (selected?.id === caseId) setSelected(updated);
      toast.success(`Status updated to ${status}`);
    } catch (err: unknown) {
      toast.error((err as Error).message);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !selected || !user) return;
    setNoteSubmitting(true);
    try {
      const note = await casesApi.addNote(selected.id, newNote, user.id);
      setNotes((prev) => [...prev, note]);
      setNewNote("");
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setNoteSubmitting(false);
    }
  };

  const filtered = cases.filter((c) => {
    if (filterStatus !== "ALL" && c.status !== filterStatus) return false;
    if (filterPriority !== "ALL" && c.priority !== filterPriority) return false;
    return true;
  });

  return (
    <div className="flex h-full bg-sx-bg overflow-hidden">
      {/* Left column: list + create */}
      <div className="flex flex-col w-80 flex-shrink-0 border-r border-sx-border overflow-hidden">
        {/* Header + filters */}
        <div className="flex-shrink-0 border-b border-sx-border px-4 py-3" style={{ background: "#0d1424" }}>
          <div className="font-display font-bold text-sx-cyan tracking-widest mb-2">CASE MANAGEMENT</div>
          <div className="flex gap-1 mb-2">
            {["ALL", "OPEN", "ACTIVE", "CLOSED"].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className="flex-1 py-0.5 rounded font-mono text-[9px] uppercase transition-all"
                style={{
                  background: filterStatus === s ? "rgba(0,212,255,0.12)" : "transparent",
                  color: filterStatus === s ? "#00d4ff" : "#475569",
                  border: filterStatus === s ? "1px solid rgba(0,212,255,0.25)" : "1px solid transparent",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Case list */}
        <div className="flex-1 overflow-y-auto divide-y divide-sx-border-dim">
          {loading ? (
            <div className="p-8 text-center font-mono text-[10px] text-sx-text-muted">LOADING CASES...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center font-mono text-[10px] text-sx-text-muted">NO CASES FOUND</div>
          ) : (
            filtered.map((c) => {
              const statusColor = STATUS_COLORS[c.status] ?? "#475569";
              const priorityColor = PRIORITY_COLORS[c.priority] ?? "#475569";
              const isSelected = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelected(isSelected ? null : c)}
                  className="w-full text-left px-4 py-3 transition-all"
                  style={{
                    background: isSelected ? "rgba(0,212,255,0.04)" : "transparent",
                    borderLeft: isSelected ? "2px solid #00d4ff" : "2px solid transparent",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-[9px]" style={{ color: "#475569" }}>{c.case_number}</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[8px] px-1 py-0.5 rounded" style={{ color: priorityColor, background: `${priorityColor}15`, border: `1px solid ${priorityColor}30` }}>{c.priority}</span>
                      <span className="font-mono text-[8px] px-1 py-0.5 rounded" style={{ color: statusColor, background: `${statusColor}12`, border: `1px solid ${statusColor}25` }}>{c.status}</span>
                    </div>
                  </div>
                  <div className="font-mono text-[11px] text-sx-text font-bold truncate mb-0.5">{c.title}</div>
                  <div className="font-mono text-[9px] text-sx-text-muted">
                    {new Date(c.created_at).toUTCString().split(" ")[4]}Z · {c.classification}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Create new case */}
        <div className="flex-shrink-0 border-t border-sx-border p-3 space-y-2" style={{ background: "#0a0f1e" }}>
          <div className="font-mono text-[9px] text-sx-text-muted tracking-widest">NEW INVESTIGATION</div>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Case title..."
            className="w-full px-2 py-1.5 rounded font-mono text-[10px] outline-none"
            style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
          />
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-2 py-1.5 rounded font-mono text-[10px] outline-none"
            style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
          />
          <div className="flex gap-1">
            {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setNewPriority(p)}
                className="flex-1 py-0.5 rounded font-mono text-[8px] transition-all"
                style={{
                  background: newPriority === p ? `${PRIORITY_COLORS[p]}15` : "transparent",
                  color: newPriority === p ? PRIORITY_COLORS[p] : "#475569",
                  border: `1px solid ${newPriority === p ? `${PRIORITY_COLORS[p]}40` : "#0f2040"}`,
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !newTitle.trim() || !user}
            className="w-full py-1.5 rounded font-mono text-[10px] font-bold tracking-widest uppercase transition-all"
            style={{
              background: "rgba(0,212,255,0.12)",
              border: "1px solid rgba(0,212,255,0.3)",
              color: creating || !newTitle.trim() ? "#334155" : "#00d4ff",
              cursor: creating || !newTitle.trim() ? "not-allowed" : "pointer",
            }}
          >
            {!user ? "LOGIN TO CREATE" : creating ? "CREATING..." : "OPEN CASE →"}
          </button>
        </div>
      </div>

      {/* Main: case detail */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Case header */}
          <div className="flex-shrink-0 border-b border-sx-border px-6 py-4" style={{ background: "#0d1424" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-mono text-[9px] text-sx-text-muted mb-1">{selected.case_number}</div>
                <div className="font-display font-bold text-xl text-sx-text mb-1">{selected.title}</div>
                {selected.description && (
                  <div className="font-mono text-[10px] text-sx-text-muted">{selected.description}</div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] text-sx-text-muted">STATUS:</span>
                  <select
                    value={selected.status}
                    onChange={(e) => handleUpdateStatus(selected.id, e.target.value as Case["status"])}
                    className="font-mono text-[10px] rounded px-2 py-0.5 outline-none"
                    style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: STATUS_COLORS[selected.status] }}
                  >
                    {["OPEN", "ACTIVE", "PENDING", "CLOSED", "ARCHIVED"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[8px] px-2 py-0.5 rounded" style={{ color: PRIORITY_COLORS[selected.priority], background: `${PRIORITY_COLORS[selected.priority]}12`, border: `1px solid ${PRIORITY_COLORS[selected.priority]}30` }}>
                    {selected.priority}
                  </span>
                  <span className="font-mono text-[8px] text-sx-text-muted">{selected.classification}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline / notes */}
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-shrink-0 px-4 py-2 border-b border-sx-border-dim font-mono text-[9px] text-sx-text-muted tracking-widest" style={{ background: "#0a0f1e" }}>
                ANALYST NOTES — {notes.length} ENTRIES
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {notes.length === 0 ? (
                  <div className="text-center py-8 font-mono text-[10px] text-sx-text-muted">NO NOTES YET — ADD THE FIRST ENTRY</div>
                ) : (
                  notes.map((note) => (
                    <div key={note.id} className="rounded border border-sx-border-dim bg-sx-surface p-3 animate-fade-in">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[8px] px-1.5 py-0.5 rounded text-sx-cyan bg-sx-cyan/10 border border-sx-cyan/20">{note.note_type}</span>
                        <span className="font-mono text-[8px] text-sx-text-muted">
                          {new Date(note.created_at).toUTCString().split(" ")[4]}Z
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-sx-text leading-relaxed whitespace-pre-wrap">{note.content}</div>
                    </div>
                  ))
                )}
              </div>
              {/* Note input */}
              <div className="flex-shrink-0 border-t border-sx-border-dim p-3 space-y-2" style={{ background: "#0a0f1e" }}>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Enter analyst note, intelligence assessment, or action taken..."
                  rows={3}
                  className="w-full px-3 py-2 rounded font-mono text-[10px] outline-none resize-none"
                  style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
                />
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-sx-text-muted">{!user ? "Login required to add notes" : ""}</span>
                  <button
                    onClick={handleAddNote}
                    disabled={noteSubmitting || !newNote.trim() || !user}
                    className="px-4 py-1.5 rounded font-mono text-[10px] font-bold tracking-wider uppercase transition-all"
                    style={{
                      background: "rgba(0,212,255,0.12)",
                      border: "1px solid rgba(0,212,255,0.3)",
                      color: !newNote.trim() || !user ? "#334155" : "#00d4ff",
                      cursor: !newNote.trim() || !user ? "not-allowed" : "pointer",
                    }}
                  >
                    {noteSubmitting ? "SUBMITTING..." : "ADD NOTE →"}
                  </button>
                </div>
              </div>
            </div>

            {/* Sidebar: case metadata */}
            <div className="w-60 flex-shrink-0 border-l border-sx-border overflow-y-auto p-3 space-y-3" style={{ background: "#0d1424" }}>
              <div className="font-mono text-[9px] text-sx-text-muted tracking-widest">CASE METADATA</div>
              {[
                ["CASE NO.", selected.case_number],
                ["STATUS", selected.status],
                ["PRIORITY", selected.priority],
                ["CLASSIFICATION", selected.classification],
                ["ENTITIES", selected.entity_ids.length.toString()],
                ["ALERTS LINKED", selected.alert_ids.length.toString()],
                ["EVIDENCE FILES", selected.evidence_urls.length.toString()],
                ["OPENED", new Date(selected.created_at).toUTCString().split(" ").slice(0, 4).join(" ")],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[9px] text-sx-text-muted">{k}</span>
                  <span className="font-mono text-[9px] text-sx-text text-right">{v}</span>
                </div>
              ))}
              {selected.tags.length > 0 && (
                <div>
                  <div className="font-mono text-[9px] text-sx-text-muted mb-1">TAGS</div>
                  <div className="flex flex-wrap gap-1">
                    {selected.tags.map((tag) => (
                      <span key={tag} className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-sx-surface border border-sx-border-dim text-sx-text-muted">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-5xl opacity-20 mb-4">📁</div>
          <div className="font-mono text-[11px] text-sx-text-muted">SELECT A CASE TO VIEW DETAILS</div>
          <div className="font-mono text-[9px] text-sx-text-muted/60 mt-1">Or create a new investigation using the form on the left</div>
        </div>
      )}
    </div>
  );
}
