// src/hooks/useEntityStream.ts
// Simulates real-time entity stream with periodic updates, propagation,
// event injection, and geofence violation alerts.

import { useState, useEffect, useCallback, useRef } from "react";
import type { SentinelEntity, StreamEvent, DomainKey, LayerState } from "@/types/entities";
import { generateWorldSnapshot, propagateEntities, generateNewEvent } from "@/lib/mockDataEngine";
import { DOMAIN_CONFIGS } from "@/constants/domains";
import { supabase } from "@/lib/supabase";

export interface EntityStreamState {
  entities: SentinelEntity[];
  events: StreamEvent[];
  layerStates: Record<DomainKey, LayerState>;
  isConnected: boolean;
  latencyMs: number;
  messageRate: number;
  totalEntityCount: number;
  lastSync: string;
}

const PROPAGATION_INTERVAL_MS = 3000;
const EVENT_INJECTION_INTERVAL_MS = 8000;
const LAYER_STATUS_INTERVAL_MS = 45000;
const GEOFENCE_CHECK_INTERVAL_MS = 12000;
const MAX_EVENTS = 60;

function buildInitialLayerStates(entities: SentinelEntity[]): Record<DomainKey, LayerState> {
  const counts: Partial<Record<DomainKey, number>> = {};
  for (const e of entities) {
    counts[e.domain] = (counts[e.domain] ?? 0) + 1;
  }

  const states: Partial<Record<DomainKey, LayerState>> = {};
  for (const [key] of Object.entries(DOMAIN_CONFIGS)) {
    const dk = key as DomainKey;
    states[dk] = {
      domain: dk,
      enabled: true,
      entityCount: counts[dk] ?? 0,
      lastUpdate: new Date().toISOString(),
      status: "live",
    };
  }
  return states as Record<DomainKey, LayerState>;
}

// ─── Geofence violation check ─────────────────────────────────────────────────

interface DbGeofence {
  id: string;
  name: string;
  fence_type: string;
  coordinates: { lat: number; lon: number }[];
  radius_km?: number;
  active: boolean;
  trigger_domains: string[];
  color: string;
}

/** Point-in-polygon (ray-casting) */
function pointInPolygon(lat: number, lon: number, polygon: { lat: number; lon: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lon, yi = polygon[i].lat;
    const xj = polygon[j].lon, yj = polygon[j].lat;
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Haversine distance in km */
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function entityViolatesFence(entity: SentinelEntity, fence: DbGeofence): boolean {
  if (!fence.active) return false;
  if (fence.trigger_domains.length > 0 && !fence.trigger_domains.includes(entity.domain)) return false;

  if (fence.fence_type === "CIRCLE") {
    const center = fence.coordinates[0];
    if (!center) return false;
    return distanceKm(entity.position.lat, entity.position.lon, center.lat, center.lon) <= (fence.radius_km ?? 50);
  }

  return pointInPolygon(entity.position.lat, entity.position.lon, fence.coordinates);
}

function makeGeofenceEvent(entity: SentinelEntity, fence: DbGeofence): StreamEvent {
  return {
    id: `gf-${fence.id}-${entity.id}-${Date.now()}`,
    entityId: entity.id,
    domain: entity.domain,
    severity: entity.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
    title: `GEOFENCE VIOLATION: ${fence.name}`,
    description: `${entity.label} (${entity.type.replace(/_/g, " ")}) detected inside restricted zone "${fence.name}"`,
    ts: new Date().toISOString(),
    position: entity.position,
    acknowledged: false,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEntityStream() {
  const [state, setState] = useState<EntityStreamState>({
    entities: [],
    events: [],
    layerStates: {} as Record<DomainKey, LayerState>,
    isConnected: false,
    latencyMs: 0,
    messageRate: 0,
    totalEntityCount: 0,
    lastSync: "",
  });

  const entitiesRef    = useRef<SentinelEntity[]>([]);
  const geofencesRef   = useRef<DbGeofence[]>([]);
  const violationTrack = useRef<Set<string>>(new Set()); // prevent re-firing same violation

  const propagationRef = useRef<ReturnType<typeof setInterval>>();
  const eventInjRef    = useRef<ReturnType<typeof setInterval>>();
  const statusRef      = useRef<ReturnType<typeof setInterval>>();
  const geofenceRef    = useRef<ReturnType<typeof setInterval>>();

  // Load geofences from DB (silently — don't block stream init)
  const refreshGeofences = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("geofences")
        .select("id,name,fence_type,coordinates,radius_km,active,trigger_domains,color")
        .eq("active", true);
      if (data) geofencesRef.current = data;
    } catch {
      // offline or no auth — no geofences to check
    }
  }, []);

  const injectNewEvent = useCallback(() => {
    const newEvent = generateNewEvent();
    setState((prev) => ({
      ...prev,
      events: [newEvent, ...prev.events].slice(0, MAX_EVENTS),
      latencyMs: Math.floor(Math.random() * 80 + 20),
      messageRate: Math.floor(Math.random() * 40 + 15),
    }));
  }, []);

  // Check active geofences against current entity positions
  const checkGeofences = useCallback(() => {
    const fences = geofencesRef.current;
    if (fences.length === 0) return;

    const entities = entitiesRef.current;
    const newEvents: StreamEvent[] = [];

    for (const fence of fences) {
      for (const entity of entities) {
        const violationKey = `${fence.id}:${entity.id}`;
        if (violationTrack.current.has(violationKey)) continue;

        if (entityViolatesFence(entity, fence)) {
          violationTrack.current.add(violationKey);
          newEvents.push(makeGeofenceEvent(entity, fence));

          // Clear violation tracking after 60s (allow re-trigger if entity stays)
          setTimeout(() => violationTrack.current.delete(violationKey), 60000);
        }
      }
    }

    if (newEvents.length > 0) {
      setState((prev) => ({
        ...prev,
        events: [...newEvents, ...prev.events].slice(0, MAX_EVENTS),
      }));
    }
  }, []);

  const propagate = useCallback(() => {
    const propagated = propagateEntities(entitiesRef.current);
    entitiesRef.current = propagated;

    setState((prev) => {
      const updatedLayerStates = { ...prev.layerStates };
      const counts: Partial<Record<DomainKey, number>> = {};
      for (const e of propagated) {
        counts[e.domain] = (counts[e.domain] ?? 0) + 1;
      }
      for (const dk of Object.keys(updatedLayerStates) as DomainKey[]) {
        updatedLayerStates[dk] = {
          ...updatedLayerStates[dk],
          entityCount: counts[dk] ?? 0,
          lastUpdate: new Date().toISOString(),
        };
      }

      return {
        ...prev,
        entities: propagated,
        layerStates: updatedLayerStates,
        totalEntityCount: propagated.length,
        lastSync: new Date().toISOString(),
        latencyMs: Math.floor(Math.random() * 60 + 15),
        messageRate: Math.floor(Math.random() * 50 + 20),
      };
    });
  }, []);

  const simulateStatusFlicker = useCallback(() => {
    setState((prev) => {
      const updatedLayerStates = { ...prev.layerStates };
      const domainKeys = Object.keys(updatedLayerStates) as DomainKey[];
      const target = domainKeys[Math.floor(Math.random() * domainKeys.length)];
      if (target && Math.random() < 0.2) {
        updatedLayerStates[target] = { ...updatedLayerStates[target], status: "degraded" };
        setTimeout(() => {
          setState((s) => ({
            ...s,
            layerStates: {
              ...s.layerStates,
              [target]: { ...s.layerStates[target], status: "live" },
            },
          }));
        }, 3000);
      }
      return { ...prev, layerStates: updatedLayerStates };
    });
  }, []);

  useEffect(() => {
    const snapshot = generateWorldSnapshot();
    entitiesRef.current = snapshot.entities;
    const initialLayerStates = buildInitialLayerStates(snapshot.entities);

    setState({
      entities: snapshot.entities,
      events: snapshot.events,
      layerStates: initialLayerStates,
      isConnected: true,
      latencyMs: 45,
      messageRate: 34,
      totalEntityCount: snapshot.entities.length,
      lastSync: snapshot.generatedAt,
    });

    // Load geofences immediately + refresh periodically
    refreshGeofences();

    propagationRef.current  = setInterval(propagate,               PROPAGATION_INTERVAL_MS);
    eventInjRef.current     = setInterval(injectNewEvent,          EVENT_INJECTION_INTERVAL_MS);
    statusRef.current       = setInterval(simulateStatusFlicker,   LAYER_STATUS_INTERVAL_MS);
    geofenceRef.current     = setInterval(() => {
      checkGeofences();
      // Refresh geofence list from DB periodically
      refreshGeofences();
    }, GEOFENCE_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(propagationRef.current);
      clearInterval(eventInjRef.current);
      clearInterval(statusRef.current);
      clearInterval(geofenceRef.current);
    };
  }, [propagate, injectNewEvent, simulateStatusFlicker, checkGeofences, refreshGeofences]);

  const acknowledgeEvent = useCallback((eventId: string) => {
    setState((prev) => ({
      ...prev,
      events: prev.events.map((e) =>
        e.id === eventId ? { ...e, acknowledged: true } : e
      ),
    }));
  }, []);

  const toggleLayer = useCallback((domain: DomainKey) => {
    setState((prev) => ({
      ...prev,
      layerStates: {
        ...prev.layerStates,
        [domain]: {
          ...prev.layerStates[domain],
          enabled: !prev.layerStates[domain]?.enabled,
        },
      },
    }));
  }, []);

  const getFilteredEntities = useCallback(
    (enabledDomains: Set<DomainKey>): SentinelEntity[] =>
      state.entities.filter((e) => enabledDomains.has(e.domain)),
    [state.entities]
  );

  return {
    ...state,
    acknowledgeEvent,
    toggleLayer,
    getFilteredEntities,
  };
}
