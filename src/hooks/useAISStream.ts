// src/hooks/useAISStream.ts
// Real-time AIS maritime vessel tracking via AIS Stream WebSocket
// Token is fetched server-side then used to establish direct WebSocket
// to minimise exposure while enabling real-time streaming.

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { SentinelEntity, SeverityLevel, ClassificationLevel } from "@/types/entities";
import { FunctionsHttpError } from "@supabase/supabase-js";

export interface AISVessel {
  mmsi: string;
  name: string;
  shipType: number;
  lat: number;
  lon: number;
  speed: number;
  course: number;
  heading: number;
  status: number;
  timestamp: string;
  callsign?: string;
  destination?: string;
  draught?: number;
  length?: number;
  flag?: string;
}

export interface AISStreamState {
  vessels: AISVessel[];
  entities: SentinelEntity[];
  connected: boolean;
  messageCount: number;
  lastMessage: string | null;
  error: string | null;
  reconnecting: boolean;
}

// Key geographic bounding boxes for coverage
const BOUNDING_BOXES = [
  // Strait of Hormuz / Persian Gulf
  [[24.0, 56.0], [26.5, 59.5]],
  // Taiwan Strait
  [[23.5, 119.5], [26.5, 122.5]],
  // Black Sea
  [[41.0, 28.0], [46.5, 41.5]],
  // South China Sea (Spratlys)
  [[10.0, 113.5], [15.0, 118.5]],
  // Strait of Malacca
  [[1.0, 103.0], [4.5, 105.5]],
  // Suez Canal approach
  [[28.0, 32.0], [32.0, 34.5]],
  // Mediterranean (Eastern)
  [[33.0, 20.0], [37.0, 36.0]],
  // North Sea
  [[52.0, 2.0], [58.0, 10.0]],
];

const SHIP_TYPE_LABELS: Record<number, string> = {
  0:  "UNKNOWN",
  30: "FISHING",
  31: "TOWING",
  32: "TOWING",
  33: "DREDGING",
  34: "DIVING",
  35: "MILITARY",
  36: "SAILING",
  37: "PLEASURE",
  50: "PILOT",
  51: "SAR",
  52: "TUG",
  53: "PORT TENDER",
  55: "LAW ENFORCEMENT",
  60: "PASSENGER",
  70: "CARGO",
  71: "CARGO",
  72: "CARGO",
  79: "CARGO",
  80: "TANKER",
  81: "TANKER",
  89: "TANKER",
};

const NAV_STATUS: Record<number, string> = {
  0: "UNDERWAY",
  1: "AT ANCHOR",
  2: "NOT UNDER COMMAND",
  3: "RESTRICTED MANOEUVRABILITY",
  5: "MOORED",
  7: "FISHING",
  8: "UNDERWAY SAILING",
  15: "DEFAULT",
};

function shipTypeSeverity(type: number, status: number, speed: number): SeverityLevel {
  if (type === 35) return "HIGH";    // Military
  if (type === 55) return "MEDIUM";  // Law enforcement
  if (status === 2 || status === 3) return "MEDIUM"; // Navigation compromised
  if (speed > 25) return "MEDIUM";   // Very fast vessel
  if (type >= 80 && type <= 89 && speed > 0) return "LOW"; // Tanker underway
  return "INFO" as SeverityLevel;
}

function vesselToEntity(v: AISVessel): SentinelEntity {
  const typeLabel = SHIP_TYPE_LABELS[v.shipType] ?? SHIP_TYPE_LABELS[Math.floor(v.shipType / 10) * 10] ?? "VESSEL";
  const severity = shipTypeSeverity(v.shipType, v.status, v.speed);

  return {
    id: `ais-${v.mmsi}`,
    type: v.shipType === 35 ? "VESSEL_WARSHIP" : v.shipType >= 80 ? "VESSEL_TANKER" : "VESSEL_CARGO",
    domain: "maritime",
    label: v.name || `VESSEL-${v.mmsi}`,
    position: { lat: v.lat, lon: v.lon },
    severity,
    classification: "UNCLASSIFIED" as ClassificationLevel,
    anomalyFlag: severity === "HIGH" || severity === "CRITICAL",
    confidence: 0.95,
    source: `AIS-STREAM:${v.mmsi}`,
    ts: v.timestamp,
    heading: v.heading || v.course,
    speed: v.speed,
    meta: {
      isLive: true,
      mmsi: v.mmsi,
      callsign: v.callsign,
      destination: v.destination,
      shipType: typeLabel,
      navStatus: NAV_STATUS[v.status] ?? "UNKNOWN",
      draught: v.draught,
      length: v.length,
      flag: v.flag,
    },
  };
}

const RECONNECT_DELAY_MS = 5000;
const MAX_VESSELS = 150;

export function useAISStream(enabled = true) {
  const [state, setState] = useState<AISStreamState>({
    vessels: [],
    entities: [],
    connected: false,
    messageCount: 0,
    lastMessage: null,
    error: null,
    reconnecting: false,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const vesselMapRef = useRef<Map<string, AISVessel>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const msgCountRef = useRef(0);

  // Fetch AIS token from edge function (server-side key delivery)
  const getAISToken = useCallback(async (): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("sentinel-feeds", {
        body: { action: "get_ais_token" },
      });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          try { const t = await error.context?.text(); console.warn("AIS token error:", t); } catch { /**/ }
        }
        // Fall back to empty (WebSocket will fail gracefully)
        return null;
      }
      return data?.token ?? null;
    } catch {
      return null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (!mountedRef.current || !enabled) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const token = await getAISToken();
    if (!token || !mountedRef.current) return;

    console.log("[AIS] Connecting to AIS Stream WebSocket...");
    setState((prev) => ({ ...prev, reconnecting: false, error: null }));

    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      console.log("[AIS] Connected to AIS Stream");

      // Subscribe to all configured bounding boxes
      ws.send(JSON.stringify({
        APIKey: token,
        BoundingBoxes: BOUNDING_BOXES,
        FilterMessageTypes: ["PositionReport", "ShipStaticData"],
      }));

      setState((prev) => ({ ...prev, connected: true, error: null, reconnecting: false }));
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data);
        const msgType = msg.MessageType;

        if (msgType === "PositionReport") {
          const pr = msg.Message?.PositionReport;
          const meta = msg.MetaData;
          if (!pr || !meta) return;

          const mmsi = String(pr.UserID ?? meta.MMSI);
          if (!mmsi || mmsi === "0") return;

          const lat = pr.Latitude ?? 0;
          const lon = pr.Longitude ?? 0;
          if (lat === 0 && lon === 0) return; // invalid position

          const existing = vesselMapRef.current.get(mmsi);
          const vessel: AISVessel = {
            mmsi,
            name: meta.ShipName?.trim() || existing?.name || `MMSI-${mmsi}`,
            shipType: existing?.shipType ?? 0,
            lat,
            lon,
            speed: (pr.SpeedOverGround ?? 0) / 10, // 0.1 knot units
            course: pr.CourseOverGround ?? 0,
            heading: pr.TrueHeading ?? pr.CourseOverGround ?? 0,
            status: pr.NavigationalStatus ?? 15,
            timestamp: msg.MetaData?.time_utc ?? new Date().toISOString(),
            callsign: existing?.callsign,
            destination: existing?.destination,
            draught: existing?.draught,
            length: existing?.length,
            flag: existing?.flag,
          };

          vesselMapRef.current.set(mmsi, vessel);
          msgCountRef.current++;

          if (msgCountRef.current % 5 === 0) {
            const vessels = Array.from(vesselMapRef.current.values()).slice(-MAX_VESSELS);
            const entities = vessels.map(vesselToEntity);
            setState((prev) => ({
              ...prev,
              vessels,
              entities,
              messageCount: msgCountRef.current,
              lastMessage: new Date().toISOString(),
            }));
          }
        }

        if (msgType === "ShipStaticData") {
          const sd = msg.Message?.ShipStaticData;
          const meta = msg.MetaData;
          if (!sd || !meta) return;

          const mmsi = String(sd.UserID ?? meta.MMSI);
          const existing = vesselMapRef.current.get(mmsi);
          if (!existing) return; // only update position-tracked vessels

          vesselMapRef.current.set(mmsi, {
            ...existing,
            name: sd.Name?.trim() || existing.name,
            shipType: sd.Type ?? existing.shipType,
            callsign: sd.CallSign?.trim(),
            destination: sd.Destination?.trim(),
            draught: sd.Draught,
            length: sd.Dimension?.A + sd.Dimension?.B,
          });
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = (e) => {
      console.error("[AIS] WebSocket error", e);
    };

    ws.onclose = (e) => {
      if (!mountedRef.current) return;
      console.log(`[AIS] Disconnected (code ${e.code}). Reconnecting in ${RECONNECT_DELAY_MS}ms...`);
      setState((prev) => ({
        ...prev,
        connected: false,
        reconnecting: true,
        error: e.code !== 1000 ? `Disconnected (${e.code})` : null,
      }));

      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, RECONNECT_DELAY_MS);
    };
  }, [enabled, getAISToken]);

  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      // Delay initial connection to not block initial render
      const initTimer = setTimeout(connect, 3000);
      return () => {
        clearTimeout(initTimer);
        mountedRef.current = false;
        clearTimeout(reconnectTimerRef.current);
        if (wsRef.current) {
          wsRef.current.onclose = null;
          wsRef.current.close(1000, "Component unmounted");
        }
      };
    }

    return () => {
      mountedRef.current = false;
    };
  }, [connect, enabled]);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimerRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close(1000, "Manual disconnect");
      wsRef.current = null;
    }
    setState((prev) => ({ ...prev, connected: false, reconnecting: false }));
  }, []);

  return { ...state, disconnect, reconnect: connect };
}
