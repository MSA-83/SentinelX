// src/hooks/useLiveFeeds.ts
// Polls the sentinel-feeds edge function for real-world OSINT data
// and merges it into SentinelEntity format for the entity stream

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { SentinelEntity, SeverityLevel, EntityType, DomainKey, ClassificationLevel } from "@/types/entities";
import { FunctionsHttpError } from "@supabase/supabase-js";

export interface LiveFeedStatus {
  domain: string;
  entityCount: number;
  latencyMs: number;
  error?: string;
  lastFetched: string;
  isLive: boolean;
}

export interface LiveFeedsState {
  entities: SentinelEntity[];
  feedStatuses: LiveFeedStatus[];
  isLoading: boolean;
  lastFetch: string | null;
  totalLiveEntities: number;
  errorCount: number;
}

const POLL_INTERVAL_MS = 60_000; // 1 minute — respect API rate limits
const DOMAIN_TYPE_MAP: Record<string, EntityType> = {
  EARTHQUAKE:      "EARTHQUAKE",
  WILDFIRE:        "WILDFIRE",
  STORM_HURRICANE: "STORM_HURRICANE",
  STORM_TYPHOON:   "STORM_TYPHOON",
  SATELLITE_ISR:   "SATELLITE_ISR",
  SATELLITE_COMMS: "SATELLITE_COMMS",
  SATELLITE_GNSS:  "SATELLITE_GNSS",
  CONFLICT_EVENT:  "CONFLICT_EVENT",
  CYBER_ATTACK:    "CYBER_ATTACK",
  VESSEL_CARGO:    "VESSEL_CARGO",
  AIRCRAFT_UNKNOWN:"AIRCRAFT_UNKNOWN",
};

// Convert raw feed entity to SentinelEntity format
function toSentinelEntity(raw: {
  id: string;
  domain: string;
  type: string;
  label: string;
  lat: number;
  lon: number;
  severity: string;
  source: string;
  ts: string;
  meta: Record<string, unknown>;
  heading?: number;
  speed?: number;
  altitude?: number;
  confidence: number;
}): SentinelEntity {
  return {
    id: raw.id,
    type: (DOMAIN_TYPE_MAP[raw.type] ?? "UNKNOWN") as EntityType,
    domain: raw.domain as DomainKey,
    label: raw.label,
    position: { lat: raw.lat, lon: raw.lon },
    severity: raw.severity as SeverityLevel,
    classification: "SECRET" as ClassificationLevel,
    anomalyFlag: raw.severity === "CRITICAL" || raw.severity === "HIGH",
    confidence: raw.confidence,
    source: raw.source,
    ts: raw.ts,
    heading: raw.heading,
    speed: raw.speed,
    altitude: raw.altitude,
    meta: { ...raw.meta, isLive: true },
  };
}

export function useLiveFeeds() {
  const [state, setState] = useState<LiveFeedsState>({
    entities: [],
    feedStatuses: [],
    isLoading: false,
    lastFetch: null,
    totalLiveEntities: 0,
    errorCount: 0,
  });

  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const mountedRef = useRef(true);

  const fetchFeeds = useCallback(async () => {
    if (!mountedRef.current) return;
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const { data, error } = await supabase.functions.invoke("sentinel-feeds", {
        body: {},
      });

      if (error) {
        let errorMessage = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const text = await error.context?.text();
            errorMessage = text || error.message;
          } catch {
            // use original message
          }
        }
        console.error("sentinel-feeds error:", errorMessage);
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
        return;
      }

      if (!data?.feeds || !mountedRef.current) return;

      const allEntities: SentinelEntity[] = [];
      const feedStatuses: LiveFeedStatus[] = [];

      for (const feed of data.feeds) {
        const convertedEntities = (feed.entities ?? []).map(toSentinelEntity);
        allEntities.push(...convertedEntities);
        feedStatuses.push({
          domain: feed.domain,
          entityCount: convertedEntities.length,
          latencyMs: feed.latencyMs ?? 0,
          error: feed.error,
          lastFetched: feed.fetchedAt ?? new Date().toISOString(),
          isLive: !feed.error && convertedEntities.length > 0,
        });
      }

      const errorCount = feedStatuses.filter((s) => s.error).length;

      setState({
        entities: allEntities,
        feedStatuses,
        isLoading: false,
        lastFetch: new Date().toISOString(),
        totalLiveEntities: allEntities.length,
        errorCount,
      });

      console.log(
        `[LiveFeeds] Fetched ${allEntities.length} live entities from ${feedStatuses.length} feeds (${errorCount} errors)`
      );
    } catch (err: unknown) {
      console.error("[LiveFeeds] Fetch error:", err);
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Initial fetch with a small delay to not block initial render
    const initTimeout = setTimeout(() => {
      fetchFeeds();
    }, 2000);

    // Poll every minute
    pollRef.current = setInterval(fetchFeeds, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearTimeout(initTimeout);
      clearInterval(pollRef.current);
    };
  }, [fetchFeeds]);

  const refreshNow = useCallback(() => {
    fetchFeeds();
  }, [fetchFeeds]);

  return {
    ...state,
    refreshNow,
  };
}
