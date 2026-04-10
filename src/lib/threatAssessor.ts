// src/lib/threatAssessor.ts
// Threat assessment engine — computes composite threat indices from entity state

import type { SentinelEntity, ThreatAssessment, SeverityLevel, DomainKey } from "@/types/entities";
import { SEVERITY_ORDER, HOTSPOT_ZONES } from "@/constants/domains";

const DOMAIN_WEIGHT: Record<DomainKey, number> = {
  conflict: 2.5,
  nuclear: 3.0,
  cyber: 2.0,
  aviation: 1.5,
  maritime: 1.5,
  orbital: 1.2,
  seismic: 1.0,
  weather: 0.8,
  sigint: 1.8,
};

const SEVERITY_SCORE: Record<SeverityLevel, number> = {
  CRITICAL: 20,
  HIGH: 10,
  MEDIUM: 4,
  LOW: 1,
  INFO: 0,
};

function indexToLevel(index: number): SeverityLevel {
  if (index >= 80) return "CRITICAL";
  if (index >= 60) return "HIGH";
  if (index >= 35) return "MEDIUM";
  if (index >= 15) return "LOW";
  return "INFO";
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

export function computeThreatAssessment(entities: SentinelEntity[]): ThreatAssessment {
  if (entities.length === 0) {
    return {
      globalThreatLevel: "INFO",
      threatIndex: 0,
      domainThreatLevels: {} as Record<DomainKey, SeverityLevel>,
      criticalEntityCount: 0,
      highEntityCount: 0,
      anomalyCount: 0,
      activeCrisisZones: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  // Per-domain scoring
  const domainScores: Partial<Record<DomainKey, number>> = {};
  const domainCounts: Partial<Record<DomainKey, number>> = {};

  for (const entity of entities) {
    const score = SEVERITY_SCORE[entity.severity] * (DOMAIN_WEIGHT[entity.domain] ?? 1.0);
    const anomalyBonus = entity.anomalyFlag ? score * 0.5 : 0;
    const confidenceMultiplier = entity.confidence;

    domainScores[entity.domain] = (domainScores[entity.domain] ?? 0) + (score + anomalyBonus) * confidenceMultiplier;
    domainCounts[entity.domain] = (domainCounts[entity.domain] ?? 0) + 1;
  }

  // Normalize domain scores to 0-100
  const domainThreatLevels: Partial<Record<DomainKey, SeverityLevel>> = {};
  let globalRawScore = 0;
  let totalWeight = 0;

  for (const [domain, rawScore] of Object.entries(domainScores)) {
    const dk = domain as DomainKey;
    const count = domainCounts[dk] ?? 1;
    const normalizedScore = Math.min(100, (rawScore / (count * 20)) * 100 * (DOMAIN_WEIGHT[dk] ?? 1));
    domainThreatLevels[dk] = indexToLevel(normalizedScore);

    const weight = DOMAIN_WEIGHT[dk] ?? 1;
    globalRawScore += normalizedScore * weight;
    totalWeight += weight;
  }

  const threatIndex = Math.min(100, Math.round(totalWeight > 0 ? globalRawScore / totalWeight : 0));

  // Identify active crisis zones
  const activeCrisisZones: string[] = [];
  for (const zone of HOTSPOT_ZONES) {
    const nearbyHighThreats = entities.filter((e) => {
      const dist = haversineKm(e.position.lat, e.position.lon, zone.lat, zone.lon);
      return dist <= zone.radius && SEVERITY_ORDER[e.severity] >= SEVERITY_ORDER["HIGH"];
    });
    if (nearbyHighThreats.length >= 2) {
      activeCrisisZones.push(zone.name);
    }
  }

  const criticalEntityCount = entities.filter((e) => e.severity === "CRITICAL").length;
  const highEntityCount = entities.filter((e) => e.severity === "HIGH").length;
  const anomalyCount = entities.filter((e) => e.anomalyFlag).length;

  return {
    globalThreatLevel: indexToLevel(threatIndex),
    threatIndex,
    domainThreatLevels: domainThreatLevels as Record<DomainKey, SeverityLevel>,
    criticalEntityCount,
    highEntityCount,
    anomalyCount,
    activeCrisisZones,
    lastUpdated: new Date().toISOString(),
  };
}

export function severityToColor(severity: SeverityLevel): string {
  switch (severity) {
    case "CRITICAL": return "#ef4444";
    case "HIGH": return "#f59e0b";
    case "MEDIUM": return "#fde047";
    case "LOW": return "#00d4ff";
    case "INFO": return "#475569";
  }
}

export function severityToBgColor(severity: SeverityLevel): string {
  switch (severity) {
    case "CRITICAL": return "rgba(239,68,68,0.15)";
    case "HIGH": return "rgba(245,158,11,0.15)";
    case "MEDIUM": return "rgba(253,224,71,0.1)";
    case "LOW": return "rgba(0,212,255,0.08)";
    case "INFO": return "rgba(71,85,105,0.1)";
  }
}

export function severityToClass(severity: SeverityLevel): string {
  switch (severity) {
    case "CRITICAL": return "severity-critical";
    case "HIGH": return "severity-high";
    case "MEDIUM": return "severity-medium";
    case "LOW": return "severity-low";
    case "INFO": return "severity-info";
  }
}
