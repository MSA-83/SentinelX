// src/hooks/useEntityStream.ts
// Simulates real-time entity stream with periodic updates, propagation,
// and event injection — mirrors the architecture of the real WebSocket backend

import { useState, useEffect, useCallback, useRef } from "react";
import type { SentinelEntity, StreamEvent, DomainKey, LayerState } from "@/types/entities";
import { generateWorldSnapshot, propagateEntities, generateNewEvent } from "@/lib/mockDataEngine";
import { DOMAIN_CONFIGS } from "@/constants/domains";

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
const MAX_EVENTS = 60;

function buildInitialLayerStates(entities: SentinelEntity[]): Record<DomainKey, LayerState> {
  const counts: Partial<Record<DomainKey, number>> = {};
  for (const e of entities) {
    counts[e.domain] = (counts[e.domain] ?? 0) + 1;
  }

  const states: Partial<Record<DomainKey, LayerState>> = {};
  for (const [key, config] of Object.entries(DOMAIN_CONFIGS)) {
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

  const entitiesRef = useRef<SentinelEntity[]>([]);
  const propagationRef = useRef<ReturnType<typeof setInterval>>();
  const eventInjectorRef = useRef<ReturnType<typeof setInterval>>();
  const statusRef = useRef<ReturnType<typeof setInterval>>();

  const injectNewEvent = useCallback(() => {
    const newEvent = generateNewEvent();
    setState((prev) => ({
      ...prev,
      events: [newEvent, ...prev.events].slice(0, MAX_EVENTS),
      latencyMs: Math.floor(Math.random() * 80 + 20),
      messageRate: Math.floor(Math.random() * 40 + 15),
    }));
  }, []);

  const propagate = useCallback(() => {
    const propagated = propagateEntities(entitiesRef.current);
    entitiesRef.current = propagated;

    setState((prev) => {
      // Recompute layer entity counts
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
      // Random domain briefly degrades then recovers
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
    // Initialize with world snapshot
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

    propagationRef.current = setInterval(propagate, PROPAGATION_INTERVAL_MS);
    eventInjectorRef.current = setInterval(injectNewEvent, EVENT_INJECTION_INTERVAL_MS);
    statusRef.current = setInterval(simulateStatusFlicker, LAYER_STATUS_INTERVAL_MS);

    return () => {
      clearInterval(propagationRef.current);
      clearInterval(eventInjectorRef.current);
      clearInterval(statusRef.current);
    };
  }, [propagate, injectNewEvent, simulateStatusFlicker]);

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
    (enabledDomains: Set<DomainKey>): SentinelEntity[] => {
      return state.entities.filter((e) => enabledDomains.has(e.domain));
    },
    [state.entities]
  );

  return {
    ...state,
    acknowledgeEvent,
    toggleLayer,
    getFilteredEntities,
  };
}
