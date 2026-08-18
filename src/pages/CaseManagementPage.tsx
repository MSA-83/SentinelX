// src/pages/CaseManagementPage.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
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

// ─── PDF export utility ────────────────────────────────────────────────────────

function exportCasePDF(c: Case, notes: CaseNote[]) {
  const dtg = new Date().toUTCString();

  const notesText = notes.length > 0
    ? notes.map((n, i) =>
        `[${(i + 1).toString().padStart(2, "0")}] ${new Date(n.created_at).toUTCString().split(" ").slice(1, 5).join(" ")} · ${n.note_type}\n${n.content}`
      ).join("\n\n")
    : "    No analyst notes recorded.";

  const html = `<!DOCTYPE html><html><head>
  <title>CASE REPORT // ${c.case_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; background: #020617; color: #e2e8f0; padding: 40px 48px; }
    .classified { color: #ef4444; font-size: 10px; text-align: center; letter-spacing: 0.25em; margin: 16px 0; font-weight: bold; }
    .header { border-bottom: 2px solid #1e3a5f; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { color: #00d4ff; font-size: 18px; letter-spacing: 0.12em; margin-bottom: 4px; }
    .header .meta { font-size: 10px; color: #475569; }
    .section { margin-bottom: 24px; }
    .section h2 { color: #475569; font-size: 11px; letter-spacing: 0.2em; border-bottom: 1px solid #0f2040; padding-bottom: 4px; margin-bottom: 10px; }
    .kv { display: grid; grid-template-columns: 160px 1fr; gap: 6px 16px; }
    .kv .k { color: #475569; font-size: 10px; }
    .kv .v { color: #94a3b8; font-size: 10px; }
    .notes-block { font-size: 10px; color: #94a3b8; line-height: 1.7; white-space: pre-wrap; background: #0a0f1e; border: 1px solid #1e3a5f; border-radius: 3px; padding: 12px 14px; }
    .tag { display: inline-block; background: #0f2040; border: 1px solid #1e3a5f; color: #475569; font-size: 9px; padding: 2px 6px; border-radius: 2px; margin-right: 4px; }
    .footer { border-top: 1px solid #1e3a5f; padding-top: 12px; margin-top: 32px; font-size: 9px; color: #1e3a5f; text-align: center; letter-spacing: 0.08em; }
    @media print { body { background: white; color: black; } .header h1 { color: #000; } .classified { color: #cc0000; } .kv .k, .kv .v { color: #333; } .notes-block { background: #f8f8f8; border-color: #ccc; color: #333; } .section h2 { color: #555; border-color: #ccc; } .tag { background: #eee; color: #555; } .footer { color: #999; } }
  </style>
</head><body>
  <div class="classified">⚠ ${c.classification.replace("_", " ")} // SENTINEL // NOFORN ⚠</div>
  
  <div class="header">
    <div class="meta">SENTINEL-X PLATFORM v6.3 // CASE INTELLIGENCE REPORT // DTG: ${dtg}</div>
    <h1>CASE REPORT // ${c.case_number}</h1>
    <div class="meta">${c.title.toUpperCase()}</div>
  </div>

  <div class="section">
    <h2>CASE METADATA</h2>
    <div class="kv">
      <span class="k">CASE NUMBER</span>  <span class="v">${c.case_number}</span>
      <span class="k">TITLE</span>        <span class="v">${c.title}</span>
      <span class="k">STATUS</span>       <span class="v">${c.status}</span>
      <span class="k">PRIORITY</span>     <span class="v">${c.priority}</span>
      <span class="k">CLASSIFICATION</span><span class="v">${c.classification.replace("_", " ")}</span>
      <span class="k">OPENED</span>       <span class="v">${new Date(c.created_at).toUTCString()}</span>
      ${c.closed_at ? `<span class="k">CLOSED</span><span class="v">${new Date(c.closed_at).toUTCString()}</span>` : ""}
    </div>
  </div>

  ${c.description ? `
  <div class="section">
    <h2>DESCRIPTION</h2>
    <div class="notes-block">${c.description}</div>
  </div>` : ""}

  <div class="section">
    <h2>INTELLIGENCE LINKS</h2>
    <div class="kv">
      <span class="k">LINKED ENTITIES</span><span class="v">${c.entity_ids.length > 0 ? c.entity_ids.join(", ") : "None"}</span>
      <span class="k">LINKED ALERTS</span> <span class="v">${c.alert_ids.length > 0 ? c.alert_ids.join(", ") : "None"}</span>
      <span class="k">EVIDENCE FILES</span><span class="v">${c.evidence_urls.length > 0 ? c.evidence_urls.join(", ") : "None"}</span>
    </div>
  </div>

  ${c.tags.length > 0 ? `
  <div class="section">
    <h2>TAGS</h2>
    <div>${c.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
  </div>` : ""}

  <div class="section">
    <h2>ANALYST TIMELINE (${notes.length} ENTRIES)</h2>
    <div class="notes-block">${notesText}</div>
  </div>

  <div class="footer">
    // SENTINEL-X CASE REPORT // ${c.case_number} // GENERATED: ${dtg} // ${c.classification.replace("_", " ")} //
  </div>
  
  <div class="classified">⚠ END OF DOCUMENT // SENTINEL-X PLATFORM ⚠</div>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (w) {
    w.onload = () => {
      w.print();
      URL.revokeObjectURL(url);
    };
  }
}

// ─── Main component ────────────────────────────────────────────────────────────

export function CaseManagementPage() {
  const { user } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [selected, setSelected] = useState<Case | null>(null);
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const location = useLocation();
  const autoOpenedRef = useRef(false);

  // New case form state
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState<Case["priority"]>("MEDIUM");
  const [newClassification, setNewClassification] = useState("SECRET");

  useEffect(() => { loadCases(); }, []);

  // Auto-select case passed via router state (e.g. from CREATE CASE in RightPanel)
  useEffect(() => {
    const openCaseId = (location.state as { openCaseId?: string } | null)?.openCaseId;
    if (!openCaseId || autoOpenedRef.current || loading) return;
    const target = cases.find((c) => c.id === openCaseId);
    if (target) {
      autoOpenedRef.current = true;
      setSelected(target);
      // Scroll the case into view after paint
      requestAnimationFrame(() => {
        document.getElementById(`case-row-${openCaseId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [cases, loading, location.state]);

  useEffect(() => {
    if (selected) loadNotes(selected.id);
    else setNotes([]);
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
      const updated = await casesApi.update(caseId, {
        status,
        closed_at: status === "CLOSED" ? new Date().toISOString() : undefined,
      });
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

  const handleExportPDF = useCallback(() => {
    if (!selected) return;
    setExporting(true);
    try {
      exportCasePDF(selected, notes);
      toast.success(`Case ${selected.case_number} PDF opened for printing`);
    } finally {
      setTimeout(() => setExporting(false), 800);
    }
  }, [selected, notes]);

  const filtered = cases.filter((c) => filterStatus === "ALL" || c.status === filterStatus);

  // Stats
  const openCount   = cases.filter((c) => c.status === "OPEN").length;
  const activeCount = cases.filter((c) => c.status === "ACTIVE").length;
  const critCount   = cases.filter((c) => c.priority === "CRITICAL").length;

  return (
    <div className="flex h-full bg-sx-bg overflow-hidden">
      {/* Left column: list + create */}
      <div className="flex flex-col w-80 flex-shrink-0 border-r border-sx-border overflow-hidden">
        {/* Header + stats */}
        <div
          className="flex-shrink-0 border-b border-sx-border px-4 py-3"
          style={{ background: "#0d1424" }}
        >
          <div className="font-display font-bold text-sx-cyan tracking-widest mb-2">CASE MANAGEMENT</div>
          <div className="flex items-center gap-4 mb-2">
            {[
              { label: "OPEN",     value: openCount,   color: "#00d4ff" },
              { label: "ACTIVE",   value: activeCount, color: "#10b981" },
              { label: "CRITICAL", value: critCount,   color: "#ef4444" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div className="font-mono font-bold text-base" style={{ color }}>{value}</div>
                <div className="font-mono text-[8px] text-sx-text-muted">{label}</div>
              </div>
            ))}
          </div>
          {/* Status filter */}
          <div className="flex gap-1">
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
            <div className="p-8 text-center font-mono text-[10px] text-sx-text-muted">LOADING CASES…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center font-mono text-[10px] text-sx-text-muted">NO CASES FOUND</div>
          ) : (
            filtered.map((c) => {
              const statusColor   = STATUS_COLORS[c.status] ?? "#475569";
              const priorityColor = PRIORITY_COLORS[c.priority] ?? "#475569";
              const isSelected    = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  id={`case-row-${c.id}`}
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
                      <span
                        className="font-mono text-[8px] px-1 py-0.5 rounded"
                        style={{ color: priorityColor, background: `${priorityColor}15`, border: `1px solid ${priorityColor}30` }}
                      >
                        {c.priority}
                      </span>
                      <span
                        className="font-mono text-[8px] px-1 py-0.5 rounded"
                        style={{ color: statusColor, background: `${statusColor}12`, border: `1px solid ${statusColor}25` }}
                      >
                        {c.status}
                      </span>
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
            placeholder="Case title…"
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
            {!user ? "LOGIN TO CREATE" : creating ? "CREATING…" : "OPEN CASE →"}
          </button>
        </div>
      </div>

      {/* Main: case detail */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Case header */}
          <div
            className="flex-shrink-0 border-b border-sx-border px-6 py-4"
            style={{ background: "#0d1424" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[9px] text-sx-text-muted mb-1">{selected.case_number}</div>
                <div className="font-display font-bold text-xl text-sx-text mb-1 truncate">{selected.title}</div>
                {selected.description && (
                  <div className="font-mono text-[10px] text-sx-text-muted line-clamp-2">{selected.description}</div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  {/* Export PDF button */}
                  <button
                    onClick={handleExportPDF}
                    disabled={exporting}
                    className="px-2.5 py-1 rounded font-mono text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
                    style={{
                      background: "rgba(168,85,247,0.08)",
                      border: "1px solid rgba(168,85,247,0.3)",
                      color: exporting ? "#334155" : "#a855f7",
                    }}
                    title="Export Case PDF Report"
                  >
                    ↓ {exporting ? "…" : "PDF"}
                  </button>

                  <span className="font-mono text-[9px] text-sx-text-muted">STATUS:</span>
                  <select
                    value={selected.status}
                    onChange={(e) => handleUpdateStatus(selected.id, e.target.value as Case["status"])}
                    className="font-mono text-[10px] rounded px-2 py-0.5 outline-none"
                    style={{
                      background: "#080e1a",
                      border: "1px solid #1e3a5f",
                      color: STATUS_COLORS[selected.status],
                    }}
                  >
                    {["OPEN", "ACTIVE", "PENDING", "CLOSED", "ARCHIVED"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-[8px] px-2 py-0.5 rounded"
                    style={{
                      color: PRIORITY_COLORS[selected.priority],
                      background: `${PRIORITY_COLORS[selected.priority]}12`,
                      border: `1px solid ${PRIORITY_COLORS[selected.priority]}30`,
                    }}
                  >
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
              <div
                className="flex-shrink-0 px-4 py-2 border-b border-sx-border-dim font-mono text-[9px] text-sx-text-muted tracking-widest"
                style={{ background: "#0a0f1e" }}
              >
                ANALYST TIMELINE — {notes.length} ENTRIES
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {notes.length === 0 ? (
                  <div className="text-center py-8 font-mono text-[10px] text-sx-text-muted">
                    NO NOTES YET — ADD THE FIRST TIMELINE ENTRY
                  </div>
                ) : (
                  notes.map((note, idx) => (
                    <div
                      key={note.id}
                      className="rounded border border-sx-border-dim bg-sx-surface p-3 animate-fade-in"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[8px] text-sx-text-muted w-5 text-right">{(idx + 1).toString().padStart(2, "0")}.</span>
                          <span
                            className="font-mono text-[8px] px-1.5 py-0.5 rounded text-sx-cyan bg-sx-cyan/10 border border-sx-cyan/20"
                          >
                            {note.note_type}
                          </span>
                        </div>
                        <span className="font-mono text-[8px] text-sx-text-muted">
                          {new Date(note.created_at).toUTCString().split(" ")[4]}Z
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-sx-text leading-relaxed whitespace-pre-wrap pl-7">
                        {note.content}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Note input */}
              <div
                className="flex-shrink-0 border-t border-sx-border-dim p-3 space-y-2"
                style={{ background: "#0a0f1e" }}
              >
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Enter analyst note, intelligence assessment, or action taken…"
                  rows={3}
                  className="w-full px-3 py-2 rounded font-mono text-[10px] outline-none resize-none"
                  style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#e2e8f0" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAddNote();
                  }}
                />
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[8px] text-sx-text-muted">
                    {!user ? "Login required" : "Ctrl+Enter to submit"}
                  </span>
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
                    {noteSubmitting ? "SUBMITTING…" : "ADD NOTE →"}
                  </button>
                </div>
              </div>
            </div>

            {/* Sidebar: case metadata */}
            <div
              className="w-60 flex-shrink-0 border-l border-sx-border overflow-y-auto p-3 space-y-3"
              style={{ background: "#0d1424" }}
            >
              <div className="font-mono text-[9px] text-sx-text-muted tracking-widest">CASE RECORD</div>
              {[
                ["CASE NO.",        selected.case_number],
                ["STATUS",         selected.status],
                ["PRIORITY",       selected.priority],
                ["CLASSIFICATION", selected.classification],
                ["ENTITIES",       selected.entity_ids.length.toString()],
                ["ALERTS LINKED",  selected.alert_ids.length.toString()],
                ["EVIDENCE FILES", selected.evidence_urls.length.toString()],
                ["NOTES",          notes.length.toString()],
                ["OPENED",         new Date(selected.created_at).toUTCString().split(" ").slice(0, 4).join(" ")],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[9px] text-sx-text-muted">{k}</span>
                  <span className="font-mono text-[9px] text-sx-text text-right">{v}</span>
                </div>
              ))}

              {selected.tags.length > 0 && (
                <div>
                  <div className="font-mono text-[9px] text-sx-text-muted mb-1.5">TAGS</div>
                  <div className="flex flex-wrap gap-1">
                    {selected.tags.map((tag) => (
                      <span
                        key={tag}
                        className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-sx-surface border border-sx-border-dim text-sx-text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Export section */}
              <div className="pt-2 border-t border-sx-border-dim">
                <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-2">EXPORT</div>
                <button
                  onClick={handleExportPDF}
                  disabled={exporting}
                  className="w-full py-2 rounded font-mono text-[9px] font-bold uppercase tracking-wider transition-all"
                  style={{
                    background: "rgba(168,85,247,0.08)",
                    border: "1px solid rgba(168,85,247,0.25)",
                    color: exporting ? "#334155" : "#a855f7",
                    cursor: exporting ? "not-allowed" : "pointer",
                  }}
                >
                  {exporting ? "GENERATING…" : "↓ PDF REPORT"}
                </button>
                <div className="font-mono text-[8px] text-sx-text-muted mt-1.5 text-center">
                  Includes metadata, timeline, and all analyst notes
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-5xl opacity-20 mb-4">📁</div>
          <div className="font-mono text-[11px] text-sx-text-muted">SELECT A CASE TO VIEW DETAILS</div>
          <div className="font-mono text-[9px] text-sx-text-muted/60 mt-1">
            Or open a new investigation using the form on the left
          </div>
          {cases.length > 0 && (
            <div className="mt-6 font-mono text-[9px] text-sx-text-muted">
              {cases.length} case{cases.length !== 1 ? "s" : ""} in database
            </div>
          )}
        </div>
      )}
    </div>
  );
}
