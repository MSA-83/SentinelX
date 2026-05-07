// src/components/features/NotificationCenter.tsx
// Real-time notification center with bell icon, toast queue, and dropdown history

import { useState, useEffect, useRef, useCallback } from "react";
import type { StreamEvent } from "@/types/entities";
import { DOMAIN_CONFIGS } from "@/constants/domains";
import { severityToColor } from "@/lib/threatAssessor";
import { alertsApi } from "@/lib/api/alerts";
import { useAuth } from "@/hooks/useAuth";

interface NotificationCenterProps {
  events: StreamEvent[];
  onAcknowledge: (eventId: string) => void;
}

const MAX_HISTORY = 20;

interface Toast {
  id: string;
  event: StreamEvent;
  exiting: boolean;
}

export function NotificationCenter({ events, onAcknowledge }: NotificationCenterProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [persistedAlerts, setPersistedAlerts] = useState<typeof alertsApi extends { list: (...args: any[]) => Promise<infer T> } ? T : never[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const persistQueueRef = useRef<Set<string>>(new Set());

  const unacknowledged = events.filter((e) => !e.acknowledged);
  const critHighCount = unacknowledged.filter(
    (e) => e.severity === "CRITICAL" || e.severity === "HIGH"
  ).length;

  // Detect new CRITICAL/HIGH events and queue toasts + persist
  useEffect(() => {
    for (const evt of events) {
      if (seenRef.current.has(evt.id)) continue;
      seenRef.current.add(evt.id);

      if (evt.severity === "CRITICAL" || evt.severity === "HIGH") {
        // Add toast
        setToasts((prev) => {
          const toast: Toast = { id: evt.id, event: evt, exiting: false };
          return [toast, ...prev].slice(0, 5);
        });

        // Persist to DB (deduplicated)
        if (user && !persistQueueRef.current.has(evt.id)) {
          persistQueueRef.current.add(evt.id);
          alertsApi.persist(evt).catch(() => {});
        }
      }
    }
  }, [events, user]);

  // Auto-dismiss toasts after 6 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts
      .filter((t) => !t.exiting)
      .map((t) =>
        setTimeout(() => {
          setToasts((prev) =>
            prev.map((tt) => (tt.id === t.id ? { ...tt, exiting: true } : tt))
          );
          setTimeout(() => {
            setToasts((prev) => prev.filter((tt) => tt.id !== t.id));
          }, 300);
        }, 6000)
      );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  // Load persisted alerts from DB when opening dropdown
  const loadPersistedAlerts = useCallback(async () => {
    try {
      const data = await alertsApi.list(20);
      setPersistedAlerts(data as any);
    } catch {}
  }, []);

  useEffect(() => {
    if (open) loadPersistedAlerts();
  }, [open, loadPersistedAlerts]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const dismissToast = (id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
  };

  const handleAckAll = () => {
    unacknowledged.forEach((e) => onAcknowledge(e.id));
  };

  const handleDbAck = async (alertId: string) => {
    if (!user) return;
    try {
      await alertsApi.acknowledge(alertId, user.id);
      setPersistedAlerts((prev: any[]) =>
        prev.map((a: any) => (a.id === alertId ? { ...a, acknowledged: true } : a))
      );
    } catch {}
  };

  return (
    <>
      {/* Bell button */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="relative flex items-center justify-center w-8 h-8 rounded transition-all"
          style={{
            background: open ? "rgba(0,212,255,0.12)" : "transparent",
            border: open ? "1px solid rgba(0,212,255,0.3)" : "1px solid transparent",
          }}
          title="Notification Center"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8 1a5 5 0 0 0-5 5v3L1.5 11h13L13 9V6a5 5 0 0 0-5-5Z"
              stroke={critHighCount > 0 ? "#ef4444" : "#475569"}
              strokeWidth="1.2"
              fill={critHighCount > 0 ? "rgba(239,68,68,0.1)" : "none"}
            />
            <path
              d="M6.5 12.5a1.5 1.5 0 0 0 3 0"
              stroke={critHighCount > 0 ? "#ef4444" : "#475569"}
              strokeWidth="1.2"
            />
          </svg>

          {/* Badge */}
          {critHighCount > 0 && (
            <span
              className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full font-mono text-[9px] font-bold"
              style={{
                background: "#ef4444",
                color: "#fff",
                boxShadow: "0 0 6px rgba(239,68,68,0.6)",
                animation: "pulse 1.5s infinite",
              }}
            >
              {critHighCount > 9 ? "9+" : critHighCount}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className="absolute top-10 right-0 w-80 rounded border overflow-hidden z-[500] animate-fade-in"
            style={{
              background: "#0d1424",
              border: "1px solid #1e3a5f",
              boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-2.5 border-b"
              style={{ borderColor: "#0f2040", background: "#0a0f1e" }}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-sx-cyan tracking-widest">
                  NOTIFICATION CENTER
                </span>
                {critHighCount > 0 && (
                  <span
                    className="font-mono text-[9px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
                  >
                    {critHighCount} UNACKED
                  </span>
                )}
              </div>
              <button
                onClick={handleAckAll}
                className="font-mono text-[9px] text-sx-text-muted hover:text-sx-cyan transition-colors"
              >
                ACK ALL
              </button>
            </div>

            {/* In-app events (live) */}
            <div className="max-h-64 overflow-y-auto divide-y divide-sx-border-dim">
              {unacknowledged.length === 0 && (
                <div className="px-4 py-6 text-center font-mono text-[9px] text-sx-text-muted">
                  NO UNACKNOWLEDGED ALERTS
                </div>
              )}
              {unacknowledged.slice(0, MAX_HISTORY).map((evt) => {
                const cfg = DOMAIN_CONFIGS[evt.domain];
                const color = severityToColor(evt.severity);
                const ts = new Date(evt.ts).toUTCString().split(" ")[4] + "Z";
                return (
                  <div
                    key={evt.id}
                    className="px-4 py-2.5 flex items-start gap-3 hover:bg-sx-surface/50 transition-all"
                    style={{ borderLeft: `2px solid ${color}` }}
                  >
                    <span className="text-sm flex-shrink-0 mt-0.5">{cfg?.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10px] font-bold truncate" style={{ color }}>
                        {evt.title}
                      </div>
                      <div className="font-mono text-[9px] text-sx-text-muted truncate">{evt.description}</div>
                      <div className="font-mono text-[8px] text-sx-text-muted mt-0.5">{ts}</div>
                    </div>
                    <button
                      onClick={() => onAcknowledge(evt.id)}
                      className="flex-shrink-0 font-mono text-[8px] px-1.5 py-0.5 rounded transition-all hover:text-sx-green"
                      style={{ color: "#334155" }}
                      title="Acknowledge"
                    >
                      ACK
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Divider */}
            <div
              className="px-4 py-1.5 flex items-center justify-between border-t border-b"
              style={{ borderColor: "#0f2040", background: "#0a0f1e" }}
            >
              <span className="font-mono text-[9px] text-sx-text-muted tracking-widest">PERSISTED HISTORY</span>
              <span className="font-mono text-[8px] text-sx-text-muted">{persistedAlerts.length} records</span>
            </div>

            <div className="max-h-40 overflow-y-auto divide-y divide-sx-border-dim">
              {(persistedAlerts as any[]).length === 0 ? (
                <div className="px-4 py-4 text-center font-mono text-[9px] text-sx-text-muted">
                  NO PERSISTED ALERTS YET
                </div>
              ) : (
                (persistedAlerts as any[]).map((alert: any) => {
                  const cfg = DOMAIN_CONFIGS[alert.domain as keyof typeof DOMAIN_CONFIGS];
                  const color = severityToColor(alert.severity);
                  return (
                    <div
                      key={alert.id}
                      className="px-4 py-2 flex items-start gap-2"
                      style={{
                        borderLeft: `2px solid ${alert.acknowledged ? "#334155" : color}`,
                        opacity: alert.acknowledged ? 0.5 : 1,
                      }}
                    >
                      <span className="text-xs">{cfg?.icon ?? "○"}</span>
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-mono text-[9px] truncate"
                          style={{ color: alert.acknowledged ? "#475569" : color }}
                        >
                          {alert.title}
                        </div>
                        <div className="font-mono text-[8px] text-sx-text-muted">
                          {new Date(alert.created_at).toUTCString().split(" ").slice(1, 5).join(" ")}
                        </div>
                      </div>
                      {!alert.acknowledged && (
                        <button
                          onClick={() => handleDbAck(alert.id)}
                          className="font-mono text-[8px] text-sx-text-muted hover:text-sx-green transition-colors"
                        >
                          ACK
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-4 py-2 border-t" style={{ borderColor: "#0f2040" }}>
              <div className="font-mono text-[8px] text-sx-text-muted text-center">
                CRITICAL/HIGH EVENTS AUTO-PERSISTED TO DATABASE
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast notifications */}
      <div
        className="fixed bottom-4 right-4 z-[600] flex flex-col gap-2 pointer-events-none"
        style={{ maxWidth: 320 }}
      >
        {toasts.map((toast) => {
          const cfg = DOMAIN_CONFIGS[toast.event.domain];
          const color = severityToColor(toast.event.severity);
          return (
            <div
              key={toast.id}
              className="rounded border pointer-events-auto"
              style={{
                background: "#0d1424",
                borderColor: color + "50",
                borderLeft: `3px solid ${color}`,
                boxShadow: `0 4px 16px rgba(0,0,0,0.7), 0 0 12px ${color}15`,
                opacity: toast.exiting ? 0 : 1,
                transform: toast.exiting ? "translateX(100%)" : "translateX(0)",
                transition: "opacity 0.3s, transform 0.3s",
              }}
            >
              <div className="flex items-start gap-3 px-3 py-2.5">
                <span className="text-lg flex-shrink-0">{cfg?.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="font-mono text-[8px] font-bold px-1 py-0.5 rounded"
                      style={{ color, background: `${color}15` }}
                    >
                      {toast.event.severity}
                    </span>
                    <span className="font-mono text-[8px] text-sx-text-muted">
                      {cfg?.shortLabel}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] font-bold" style={{ color }}>
                    {toast.event.title}
                  </div>
                  <div className="font-mono text-[9px] text-sx-text-muted truncate">
                    {toast.event.description}
                  </div>
                </div>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="flex-shrink-0 text-sx-text-muted hover:text-sx-text transition-colors mt-0.5"
                  style={{ fontSize: 14 }}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
