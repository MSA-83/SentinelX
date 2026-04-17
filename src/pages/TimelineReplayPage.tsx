// src/pages/TimelineReplayPage.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useEntityStream } from "@/hooks/useEntityStream";
import { DOMAIN_CONFIGS } from "@/constants/domains";
import { severityToColor } from "@/lib/threatAssessor";

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;

export function TimelineReplayPage() {
  const { events, entities } = useEntityStream();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [position, setPosition] = useState(0); // 0-100 percent
  const [currentIndex, setCurrentIndex] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval>>();

  const sortedEvents = [...events].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  const totalDuration = sortedEvents.length > 0
    ? new Date(sortedEvents[sortedEvents.length - 1].ts).getTime() - new Date(sortedEvents[0].ts).getTime()
    : 0;

  const visibleEvents = sortedEvents.slice(0, Math.floor((currentIndex / 100) * sortedEvents.length + 1));

  const tick = useCallback(() => {
    setPosition((prev) => {
      const next = prev + (0.5 * speed);
      if (next >= 100) {
        setPlaying(false);
        return 100;
      }
      return next;
    });
    setCurrentIndex((prev) => Math.min(prev + 1, sortedEvents.length - 1));
  }, [speed, sortedEvents.length]);

  useEffect(() => {
    if (playing) {
      tickRef.current = setInterval(tick, 200);
    } else {
      clearInterval(tickRef.current);
    }
    return () => clearInterval(tickRef.current);
  }, [playing, tick]);

  const handleSeek = (pct: number) => {
    setPosition(pct);
    setCurrentIndex(Math.floor((pct / 100) * (sortedEvents.length - 1)));
  };

  const handleReset = () => {
    setPlaying(false);
    setPosition(0);
    setCurrentIndex(0);
  };

  const currentTs = sortedEvents[currentIndex]?.ts
    ? new Date(sortedEvents[currentIndex].ts).toUTCString()
    : "—";

  return (
    <div className="flex flex-col h-full bg-sx-bg overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-sx-border px-6 py-3" style={{ background: "#0d1424" }}>
        <div className="font-display font-bold text-sx-cyan tracking-widest">TIMELINE REPLAY</div>
        <div className="font-mono text-[9px] text-sx-text-muted">4D PLAYBACK // HISTORICAL EVENT CORRELATION</div>
      </div>

      {/* Playback controls */}
      <div className="flex-shrink-0 border-b border-sx-border px-6 py-4" style={{ background: "#0a0f1e" }}>
        <div className="flex items-center gap-4 mb-4">
          {/* Play/Pause */}
          <button
            onClick={() => setPlaying((v) => !v)}
            className="w-10 h-10 rounded flex items-center justify-center font-bold text-xl transition-all"
            style={{
              background: playing ? "rgba(0,212,255,0.15)" : "rgba(0,212,255,0.1)",
              border: "1px solid rgba(0,212,255,0.35)",
              color: "#00d4ff",
            }}
          >
            {playing ? "⏸" : "⏵"}
          </button>

          {/* Stop/Reset */}
          <button
            onClick={handleReset}
            className="w-10 h-10 rounded flex items-center justify-center text-xl transition-all"
            style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#475569" }}
          >
            ⏹
          </button>

          {/* Speed selector */}
          <div className="flex items-center gap-1 rounded p-0.5" style={{ background: "#080e1a", border: "1px solid #0f2040" }}>
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className="px-2 py-1 rounded font-mono text-[9px] transition-all"
                style={{
                  background: speed === s ? "rgba(0,212,255,0.15)" : "transparent",
                  color: speed === s ? "#00d4ff" : "#475569",
                  border: speed === s ? "1px solid rgba(0,212,255,0.3)" : "1px solid transparent",
                }}
              >
                {s}×
              </button>
            ))}
          </div>

          {/* Current timestamp */}
          <div className="font-mono text-[10px]" style={{ color: "#94a3b8" }}>
            {currentTs}
          </div>

          <div className="ml-auto font-mono text-[10px] text-sx-text-muted">
            {visibleEvents.length} / {sortedEvents.length} EVENTS
          </div>
        </div>

        {/* Scrubber */}
        <div className="relative">
          <div
            className="relative h-3 rounded-full cursor-pointer"
            style={{ background: "#0f2040" }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = ((e.clientX - rect.left) / rect.width) * 100;
              handleSeek(Math.max(0, Math.min(100, pct)));
            }}
          >
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-all"
              style={{
                width: `${position}%`,
                background: "linear-gradient(90deg, #10b981, #00d4ff)",
                boxShadow: "0 0 8px rgba(0,212,255,0.4)",
              }}
            />
            {/* Event markers */}
            {sortedEvents.map((evt, i) => {
              const pct = totalDuration > 0
                ? ((new Date(evt.ts).getTime() - new Date(sortedEvents[0].ts).getTime()) / totalDuration) * 100
                : (i / sortedEvents.length) * 100;
              const color = severityToColor(evt.severity);
              return (
                <div
                  key={evt.id}
                  className="absolute top-0 h-full w-0.5 rounded"
                  style={{
                    left: `${pct}%`,
                    background: color,
                    opacity: i <= currentIndex ? 0.8 : 0.2,
                  }}
                  title={evt.title}
                />
              );
            })}
            {/* Playhead */}
            <div
              className="absolute top-1/2 w-4 h-4 rounded-full -translate-y-1/2 -translate-x-1/2 border-2 border-sx-cyan"
              style={{ left: `${position}%`, background: "#0d1424", boxShadow: "0 0 8px rgba(0,212,255,0.6)" }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-mono text-[8px] text-sx-text-muted">
              {sortedEvents[0]?.ts ? new Date(sortedEvents[0].ts).toUTCString().split(" ")[4] + "Z" : "—"}
            </span>
            <span className="font-mono text-[8px] text-sx-text-muted">
              {sortedEvents[sortedEvents.length - 1]?.ts ? new Date(sortedEvents[sortedEvents.length - 1].ts).toUTCString().split(" ")[4] + "Z" : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Event stream */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="font-mono text-[9px] text-sx-text-muted tracking-widest mb-3">
          EVENT STREAM — {visibleEvents.length} EVENTS RENDERED
        </div>
        <div className="space-y-1">
          {[...visibleEvents].reverse().map((evt, i) => {
            const cfg = DOMAIN_CONFIGS[evt.domain];
            const color = severityToColor(evt.severity);
            const isLatest = i === 0;
            const ts = new Date(evt.ts).toUTCString().split(" ")[4] + "Z";
            return (
              <div
                key={evt.id}
                className="flex items-start gap-3 px-3 py-2 rounded border transition-all"
                style={{
                  borderColor: isLatest ? `${color}40` : "#0f2040",
                  background: isLatest ? `${color}06` : "transparent",
                  borderLeft: `2px solid ${color}`,
                }}
              >
                <span className="font-mono text-[9px] text-sx-text-muted flex-shrink-0 w-16">{ts}</span>
                <span className="text-sm flex-shrink-0">{cfg?.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[10px] font-bold" style={{ color }}>{evt.title}</div>
                  <div className="font-mono text-[9px] text-sx-text-muted truncate">{evt.description}</div>
                </div>
                <span className="font-mono text-[8px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ color, background: `${color}12`, border: `1px solid ${color}25` }}>
                  {evt.severity}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
