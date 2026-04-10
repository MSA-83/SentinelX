// src/types/entities.ts
// Canonical Sentinel-X entity model — normalized from all upstream OSINT sources

export type DomainKey =
  | "aviation"
  | "maritime"
  | "orbital"
  | "seismic"
  | "conflict"
  | "weather"
  | "cyber"
  | "nuclear"
  | "sigint";

export type EntityType =
  | "AIRCRAFT_MILITARY"
  | "AIRCRAFT_COMMERCIAL"
  | "AIRCRAFT_UNKNOWN"
  | "VESSEL_WARSHIP"
  | "VESSEL_SUBMARINE"
  | "VESSEL_CARGO"
  | "VESSEL_TANKER"
  | "VESSEL_UNKNOWN"
  | "SATELLITE_ISR"
  | "SATELLITE_COMMS"
  | "SATELLITE_GNSS"
  | "SATELLITE_DEBRIS"
  | "EARTHQUAKE"
  | "WILDFIRE"
  | "CONFLICT_EVENT"
  | "CONFLICT_EXPLOSION"
  | "STORM_HURRICANE"
  | "STORM_TYPHOON"
  | "CYBER_ATTACK"
  | "CYBER_BOTNET"
  | "NUCLEAR_FACILITY"
  | "SIGINT_EMISSION"
  | "UNKNOWN";

export type SeverityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type ClassificationLevel = "UNCLASSIFIED" | "CONFIDENTIAL" | "SECRET" | "TOP_SECRET";

export interface GeoPoint {
  lat: number;
  lon: number;
  alt?: number; // meters
}

export interface SentinelEntity {
  id: string;
  type: EntityType;
  domain: DomainKey;
  label: string;
  position: GeoPoint;
  heading?: number;       // 0-360 degrees
  speed?: number;         // knots or km/h
  altitude?: number;      // feet or meters depending on domain
  severity: SeverityLevel;
  classification: ClassificationLevel;
  anomalyFlag: boolean;
  confidence: number;     // 0.0 - 1.0
  source: string;         // upstream data source identifier
  ts: string;             // ISO8601 timestamp
  ttl?: number;           // seconds before entity expires
  meta: Record<string, unknown>;
  track?: GeoPoint[];     // historical trail (last N positions)
}

export interface ThreatAssessment {
  globalThreatLevel: SeverityLevel;
  threatIndex: number;    // 0-100
  domainThreatLevels: Record<DomainKey, SeverityLevel>;
  criticalEntityCount: number;
  highEntityCount: number;
  anomalyCount: number;
  activeCrisisZones: string[];
  lastUpdated: string;
}

export interface StreamEvent {
  id: string;
  entityId?: string;
  domain: DomainKey;
  severity: SeverityLevel;
  title: string;
  description: string;
  ts: string;
  position?: GeoPoint;
  acknowledged: boolean;
}

export interface MissionWorkspace {
  id: string;
  name: string;
  classification: ClassificationLevel;
  activeDomains: DomainKey[];
  aoi?: {
    name: string;
    bounds: [number, number, number, number]; // [minLat, minLon, maxLat, maxLon]
  };
  filters: {
    minSeverity: SeverityLevel;
    anomalyOnly: boolean;
    entityTypes: EntityType[];
  };
  createdAt: string;
  operator: string;
}

export interface DomainConfig {
  key: DomainKey;
  label: string;
  shortLabel: string;
  color: string;
  dimColor: string;
  bgColor: string;
  icon: string;
  description: string;
  updateIntervalMs: number;
}

export interface LayerState {
  domain: DomainKey;
  enabled: boolean;
  entityCount: number;
  lastUpdate: string;
  status: "live" | "degraded" | "offline";
}
