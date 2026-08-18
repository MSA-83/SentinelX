// src/hooks/useGeofences.ts
// Fetches active geofences from Supabase and provides breach detection utilities.
// Polls every 30 seconds to pick up newly created / toggled zones.

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export interface GeofenceRecord {
  id: string;
  name: string;
  fence_type: string; // "POLYGON" | "CIRCLE"
  coordinates: { lat: number; lon: number }[];
  radius_km?: number | null;
  color: string;
  active: boolean;
  classification: string; // "UNCLASSIFIED" | "SECRET" | "TOP_SECRET" | "CONFIDENTIAL"
  trigger_domains: string[];
  description?: string;
  created_at: string;
}

export interface GeofenceBreachEntry {
  fenceId: string;
  fenceName: string;
  entityId: string;
  entityLabel: string;
  detectedAt: string;
}

const POLL_INTERVAL_MS = 30_000;

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/** Ray-casting point-in-polygon */
export function pointInPolygon(
  lat: number,
  lon: number,
  polygon: { lat: number; lon: number }[]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lon, yi = polygon[i].lat;
    const xj = polygon[j].lon, yj = polygon[j].lat;
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Haversine distance km */
export function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Determine if a point is inside a geofence */
export function isInsideFence(
  lat: number,
  lon: number,
  fence: GeofenceRecord
): boolean {
  if (!fence.active) return false;

  if (fence.fence_type === "CIRCLE") {
    const center = fence.coordinates[0];
    if (!center) return false;
    return (
      haversineKm(lat, lon, center.lat, center.lon) <= (fence.radius_km ?? 50)
    );
  }

  return pointInPolygon(lat, lon, fence.coordinates);
}

// ─── Classification → display color ──────────────────────────────────────────

export function fenceClassificationColor(classification: string): string {
  switch (classification) {
    case "TOP_SECRET": return "#ef4444"; // red
    case "SECRET":     return "#ef4444"; // red
    case "CONFIDENTIAL": return "#f59e0b"; // amber
    default:           return "#22d3ee"; // cyan / unclassified
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGeofences() {
  const [geofences, setGeofences] = useState<GeofenceRecord[]>([]);
  const [loading,   setLoading]   = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const fetchGeofences = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("geofences")
        .select(
          "id,name,fence_type,coordinates,radius_km,color,active,classification,trigger_domains,description,created_at"
        )
        .eq("active", true)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setGeofences(data as GeofenceRecord[]);
      }
    } catch {
      // Auth not ready or offline — silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGeofences();
    timerRef.current = setInterval(fetchGeofences, POLL_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchGeofences]);

  return { geofences, loading, refresh: fetchGeofences };
}
