// src/constants/domains.ts
import type { DomainConfig, DomainKey } from "@/types/entities";

export const DOMAIN_CONFIGS: Record<DomainKey, DomainConfig> = {
  aviation: {
    key: "aviation",
    label: "Aviation",
    shortLabel: "AVN",
    color: "#00d4ff",
    dimColor: "#0ea5e9",
    bgColor: "rgba(0,212,255,0.1)",
    icon: "✈",
    description: "Military & commercial airspace tracking via ADS-B",
    updateIntervalMs: 5000,
  },
  maritime: {
    key: "maritime",
    label: "Maritime",
    shortLabel: "MRT",
    color: "#3b82f6",
    dimColor: "#2563eb",
    bgColor: "rgba(59,130,246,0.1)",
    icon: "⛵",
    description: "Naval & commercial vessel tracking via AIS",
    updateIntervalMs: 10000,
  },
  orbital: {
    key: "orbital",
    label: "Orbital / Space",
    shortLabel: "ORB",
    color: "#a855f7",
    dimColor: "#9333ea",
    bgColor: "rgba(168,85,247,0.1)",
    icon: "🛰",
    description: "Satellites, ISR platforms, debris field tracking",
    updateIntervalMs: 30000,
  },
  seismic: {
    key: "seismic",
    label: "Seismic / CBRN",
    shortLabel: "SES",
    color: "#f59e0b",
    dimColor: "#d97706",
    bgColor: "rgba(245,158,11,0.1)",
    icon: "⚡",
    description: "Earthquake, volcanic, and CBRN event monitoring",
    updateIntervalMs: 60000,
  },
  conflict: {
    key: "conflict",
    label: "Conflict Zones",
    shortLabel: "CNF",
    color: "#ef4444",
    dimColor: "#dc2626",
    bgColor: "rgba(239,68,68,0.1)",
    icon: "⚔",
    description: "Kinetic events, armed conflict via ACLED/GDELT",
    updateIntervalMs: 30000,
  },
  weather: {
    key: "weather",
    label: "Weather / Climate",
    shortLabel: "MET",
    color: "#06b6d4",
    dimColor: "#0891b2",
    bgColor: "rgba(6,182,212,0.1)",
    icon: "🌪",
    description: "Severe weather, hurricane tracking, operational met",
    updateIntervalMs: 300000,
  },
  cyber: {
    key: "cyber",
    label: "Cyber / EW",
    shortLabel: "CYB",
    color: "#10b981",
    dimColor: "#059669",
    bgColor: "rgba(16,185,129,0.1)",
    icon: "⚿",
    description: "DDoS vectors, botnet activity, threat actor TTPs",
    updateIntervalMs: 15000,
  },
  nuclear: {
    key: "nuclear",
    label: "Nuclear / WMD",
    shortLabel: "NUC",
    color: "#f97316",
    dimColor: "#ea580c",
    bgColor: "rgba(249,115,22,0.1)",
    icon: "☢",
    description: "Nuclear facility status, radiation event monitoring",
    updateIntervalMs: 120000,
  },
  sigint: {
    key: "sigint",
    label: "SIGINT / EW",
    shortLabel: "SIG",
    color: "#ec4899",
    dimColor: "#db2777",
    bgColor: "rgba(236,72,153,0.1)",
    icon: "📡",
    description: "Signal intercept, RF emissions, electronic warfare",
    updateIntervalMs: 8000,
  },
};

export const DOMAIN_ORDER: DomainKey[] = [
  "aviation", "maritime", "orbital", "conflict", "seismic", "weather", "cyber", "nuclear", "sigint"
];

export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

export const CLASSIFICATION_COLORS: Record<string, string> = {
  UNCLASSIFIED: "#10b981",
  CONFIDENTIAL: "#3b82f6",
  SECRET: "#f59e0b",
  TOP_SECRET: "#ef4444",
};

export const HOTSPOT_ZONES = [
  { name: "Eastern Ukraine", lat: 48.5, lon: 37.5, radius: 300 },
  { name: "Taiwan Strait", lat: 24.5, lon: 120.0, radius: 200 },
  { name: "Red Sea (Bab-el-Mandeb)", lat: 12.5, lon: 43.5, radius: 250 },
  { name: "Korean Peninsula", lat: 38.0, lon: 127.0, radius: 200 },
  { name: "South China Sea", lat: 14.0, lon: 114.0, radius: 400 },
  { name: "Persian Gulf", lat: 26.0, lon: 52.0, radius: 300 },
  { name: "Sahel Region", lat: 14.0, lon: 5.0, radius: 400 },
  { name: "Myanmar", lat: 19.0, lon: 96.5, radius: 250 },
];
