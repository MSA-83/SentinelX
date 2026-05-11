// src/components/features/LiveFeedBadge.tsx
// Compact live data feed indicator — shows which real-world feeds are active

import type { LiveFeedStatus } from "@/hooks/useLiveFeeds";

interface LiveFeedBadgeProps {
  feedStatuses: LiveFeedStatus[];
  totalLiveEntities: number;
  isLoading: boolean;
  lastFetch: string | null;
  onRefresh?: () => void;
}

const DOMAIN_ICONS: Record<string, string> = {
  seismic:  "🌍",
  weather:  "🌩️",
  orbital:  "🛰️",
  conflict: "⚠️",
  cyber:    "💻",
  aviation: "✈️",
  maritime: "🚢",
};

const DOMAIN_LABELS: Record<string, string> = {
  seismic:  "USGS",
  weather:  "OWM",
  orbital:  "N2YO",
  conflict: "NEWS/FIRMS",
  cyber:    "SHODAN",
  aviation: "AVWX",
  maritime: "GFW",
};

export function LiveFeedBadge({
  feedStatuses,
  totalLiveEntities,
  isLoading,
  lastFetch,
  onRefresh,
}: LiveFeedBadgeProps) {
  const liveCount = feedStatuses.filter((s) => s.isLive).length;
  const errorCount = feedStatuses.filter((s) => s.error).length;
  const lastFetchTime = lastFetch
    ? new Date(lastFetch).toUTCString().split(" ")[4] + "Z"
    : null;

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded"
      style={{
        background: "rgba(0,212,255,0.04)",
        border: "1px solid rgba(0,212,255,0.12)",
      }}
    >
      {/* Live indicator */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isLoading ? (
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: "#f59e0b",
              animation: "pulse 1s infinite",
              boxShadow: "0 0 4px #f59e0b",
            }}
          />
        ) : totalLiveEntities > 0 ? (
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: "#10b981",
              animation: "pulse 2s infinite",
              boxShadow: "0 0 4px #10b981",
            }}
          />
        ) : (
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "#334155" }}
          />
        )}
        <span
          className="font-mono text-[8px] font-bold tracking-widest"
          style={{
            color: isLoading ? "#f59e0b" : totalLiveEntities > 0 ? "#10b981" : "#475569",
          }}
        >
          {isLoading ? "FETCHING" : `LIVE:${totalLiveEntities}`}
        </span>
      </div>

      {/* Feed status dots */}
      {feedStatuses.length > 0 && (
        <div className="flex items-center gap-1">
          {feedStatuses.map((status) => (
            <div
              key={status.domain}
              title={`${DOMAIN_LABELS[status.domain] ?? status.domain.toUpperCase()}: ${status.isLive ? `${status.entityCount} entities (${status.latencyMs}ms)` : status.error ?? "No data"}`}
              className="w-1.5 h-1.5 rounded-full transition-all"
              style={{
                background: status.error ? "#ef4444" : status.isLive ? "#10b981" : "#334155",
                boxShadow: status.isLive ? `0 0 3px #10b981` : "none",
              }}
            />
          ))}
        </div>
      )}

      {/* Error badge */}
      {errorCount > 0 && (
        <span
          className="font-mono text-[7px] px-1 rounded"
          style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          {errorCount}↯
        </span>
      )}

      {/* Last fetch time */}
      {lastFetchTime && !isLoading && (
        <span className="font-mono text-[7px]" style={{ color: "rgba(71,85,105,0.6)" }}>
          {lastFetchTime}
        </span>
      )}

      {/* Refresh button */}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="font-mono text-[8px] transition-colors"
          style={{ color: isLoading ? "#334155" : "rgba(0,212,255,0.4)" }}
          title="Refresh live feeds"
        >
          ↻
        </button>
      )}
    </div>
  );
}
