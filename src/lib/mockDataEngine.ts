// src/lib/mockDataEngine.ts
// Realistic mock data simulation engine — generates plausible entity data
// with movement, anomaly injection, and event generation

import type {
  SentinelEntity,
  StreamEvent,
  DomainKey,
  EntityType,
  SeverityLevel,
  GeoPoint,
} from "@/types/entities";
import { HOTSPOT_ZONES } from "@/constants/domains";

// ─── Utility helpers ─────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 11).toUpperCase();
}

function isoNow(): string {
  return new Date().toISOString();
}

function isoOffset(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

// Biased random — pulls toward hotspot zones for realism
function hotspotBiasedPosition(): GeoPoint {
  if (Math.random() < 0.35) {
    const zone = pickRandom(HOTSPOT_ZONES);
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (zone.radius / 111); // approx km→deg
    return {
      lat: zone.lat + Math.sin(angle) * dist,
      lon: zone.lon + Math.cos(angle) * dist,
    };
  }
  return {
    lat: randomBetween(-70, 80),
    lon: randomBetween(-170, 170),
  };
}

function clampLat(lat: number): number {
  return Math.max(-85, Math.min(85, lat));
}

function wrapLon(lon: number): number {
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

// ─── Aviation entities ────────────────────────────────────────────────────────

const MILITARY_CALLSIGNS = [
  "HAVOC11", "RAPTOR07", "VIPER33", "GHOST01", "REAPER09",
  "EAGLE21", "COBRA15", "TALON44", "SHADOW77", "PREDATOR02",
  "DARK30", "WOLF88", "FURY14", "IRON52", "STEEL66",
  "NATO01", "AWACS04", "RIVET11", "SPAR05", "REACH99",
];

const COMMERCIAL_CALLSIGNS = [
  "UAE123", "BAW445", "DLH882", "AFR291", "SIA304",
  "QTR017", "FDX880", "KAL902", "EVA773", "AAL101",
];

const AIRCRAFT_TYPES = ["F-22A", "F-35A", "Su-57", "MiG-29", "Tu-95MS", "B-52H", "C-17A", "P-8A Poseidon", "RQ-4 Global Hawk", "MQ-9 Reaper"];

function generateAviationEntities(count: number): SentinelEntity[] {
  return Array.from({ length: count }, (_, i) => {
    const isMilitary = Math.random() < 0.35;
    const isAnomaly = Math.random() < 0.08;
    const pos = hotspotBiasedPosition();
    const heading = randomInt(0, 359);
    const speed = isMilitary ? randomInt(400, 1200) : randomInt(350, 600);
    const altitude = randomInt(15000, 45000);

    return {
      id: `AVN-${randomId()}`,
      type: isMilitary ? "AIRCRAFT_MILITARY" : "AIRCRAFT_COMMERCIAL",
      domain: "aviation",
      label: isMilitary ? pickRandom(MILITARY_CALLSIGNS) : pickRandom(COMMERCIAL_CALLSIGNS),
      position: pos,
      heading,
      speed,
      altitude,
      severity: isAnomaly ? pickRandom(["HIGH", "CRITICAL"] as SeverityLevel[]) : "LOW",
      classification: isMilitary ? "CONFIDENTIAL" : "UNCLASSIFIED",
      anomalyFlag: isAnomaly,
      confidence: randomBetween(0.7, 0.99),
      source: isMilitary ? "ADSB-Exchange" : "OpenSky-Network",
      ts: isoOffset(randomInt(0, 120)),
      meta: {
        aircraftType: isMilitary ? pickRandom(AIRCRAFT_TYPES) : "B737/A320",
        squawk: randomInt(1000, 7777).toString().padStart(4, "0"),
        registration: `${pickRandom(["US","UK","FR","DE","RU"])}-${randomId().slice(0,5)}`,
        origin: pickRandom(["EGLL", "KJFK", "RJTT", "OMDB", "LFPG", "UUEE", "KLAX"]),
        iff: isMilitary ? `Mode-5 ${isAnomaly ? "SPOOFED" : "OK"}` : "N/A",
        squadron: isMilitary ? `${randomInt(1, 99)}th Fighter Wing` : undefined,
      },
      track: [],
    };
  });
}

// ─── Maritime entities ────────────────────────────────────────────────────────

const VESSEL_NAMES = [
  "VARYAG", "ADMIRAL KUZNETSOV", "USS GERALD FORD", "HMS QUEEN ELIZABETH",
  "LIAONING", "SHANDONG", "INS VIKRAMADITYA",
  "EVER GIVEN", "MAERSK EINDHOVEN", "CMA CGM MARCO POLO",
  "STENA IMPERO", "FRONT ALTAIR", "STELLAR BANNER",
];

function generateMaritimeEntities(count: number): SentinelEntity[] {
  return Array.from({ length: count }, () => {
    const isWarship = Math.random() < 0.2;
    const isDarkFleet = Math.random() < 0.06;
    const pos = (() => {
      // Bias toward shipping lanes and naval hotspots
      const lanes = [
        { lat: 12.5, lon: 43.5 },  // Red Sea / Bab-el-Mandeb
        { lat: 1.3, lon: 104.0 },   // Strait of Malacca
        { lat: 37.0, lon: -9.5 },   // Strait of Gibraltar
        { lat: 24.5, lon: 120.0 },  // Taiwan Strait
        { lat: 57.0, lon: 3.0 },    // North Sea
        { lat: 26.0, lon: 52.0 },   // Persian Gulf
      ];
      if (Math.random() < 0.4) {
        const lane = pickRandom(lanes);
        return {
          lat: clampLat(lane.lat + randomBetween(-3, 3)),
          lon: wrapLon(lane.lon + randomBetween(-5, 5)),
        };
      }
      return {
        lat: randomBetween(-60, 70),
        lon: randomBetween(-170, 170),
      };
    })();

    return {
      id: `MRT-${randomId()}`,
      type: isWarship ? "VESSEL_WARSHIP" : isDarkFleet ? "VESSEL_UNKNOWN" : "VESSEL_CARGO",
      domain: "maritime",
      label: pickRandom(VESSEL_NAMES),
      position: pos,
      heading: randomInt(0, 359),
      speed: isWarship ? randomInt(15, 35) : randomInt(8, 20),
      severity: isDarkFleet ? "HIGH" : isWarship ? "MEDIUM" : "LOW",
      classification: isWarship ? "CONFIDENTIAL" : "UNCLASSIFIED",
      anomalyFlag: isDarkFleet,
      confidence: isDarkFleet ? randomBetween(0.4, 0.7) : randomBetween(0.8, 0.99),
      source: "AISStream.io",
      ts: isoOffset(randomInt(0, 300)),
      meta: {
        mmsi: randomInt(100000000, 999999999).toString(),
        imo: `IMO${randomInt(1000000, 9999999)}`,
        flag: pickRandom(["RU", "CN", "US", "UK", "IR", "UNKNOWN", "PA", "LR"]),
        length: randomInt(80, 400),
        aisGap: isDarkFleet ? `${randomInt(2, 72)}h gap detected` : "None",
        cargoType: isWarship ? "WARSHIP" : pickRandom(["Crude Oil", "Bulk Grain", "Container", "LNG"]),
        port: pickRandom(["Bandar Abbas", "Tartus", "Zhanjiang", "Severomorsk", "Norfolk VA"]),
      },
    };
  });
}

// ─── Orbital entities ─────────────────────────────────────────────────────────

const SATELLITE_NAMES = [
  "USA-326 (KH-11)", "LACROSSE-5", "TRUMPET-3", "MISTY-2", "ONYX-4",
  "COSMOS-2560", "YAOGAN-30", "LUCH-5A", "MERIDIAN-9",
  "STARLINK-4521", "ONEWEB-0387", "GPS-IIF-12", "GLONASS-M 755",
];

function generateOrbitalEntities(count: number): SentinelEntity[] {
  return Array.from({ length: count }, () => {
    const isISR = Math.random() < 0.3;
    const isDebris = Math.random() < 0.15;
    const lat = randomBetween(-85, 85);
    const lon = randomBetween(-170, 170);
    const altitude = isDebris ? randomInt(200, 800) : randomInt(400, 36000);

    return {
      id: `ORB-${randomId()}`,
      type: isDebris ? "SATELLITE_DEBRIS" : isISR ? "SATELLITE_ISR" : "SATELLITE_COMMS",
      domain: "orbital",
      label: pickRandom(SATELLITE_NAMES),
      position: { lat, lon, alt: altitude * 1000 },
      heading: randomInt(0, 359),
      speed: randomInt(7, 8),
      altitude,
      severity: isISR ? "MEDIUM" : "LOW",
      classification: isISR ? "SECRET" : "UNCLASSIFIED",
      anomalyFlag: Math.random() < 0.05,
      confidence: randomBetween(0.85, 0.99),
      source: "CelesTrak/Space-Track",
      ts: isoOffset(randomInt(0, 600)),
      meta: {
        noradId: randomInt(10000, 99999).toString(),
        inclination: `${randomBetween(0, 98).toFixed(1)}°`,
        period: `${randomBetween(90, 1440).toFixed(0)} min`,
        apogee: `${altitude + randomInt(0, 100)} km`,
        perigee: `${altitude - randomInt(0, 50)} km`,
        country: pickRandom(["USA", "RUS", "CHN", "ISR", "EU", "IND"]),
        mission: isISR ? "SIGINT/IMINT Collection" : isDebris ? "Defunct/Debris" : "Communications",
      },
    };
  });
}

// ─── Seismic / CBRN entities ──────────────────────────────────────────────────

function generateSeismicEntities(count: number): SentinelEntity[] {
  const events = [
    { lat: 35.7, lon: 139.7, label: "M4.2 Tokyo Region", mag: 4.2 },
    { lat: 37.8, lon: 22.4, label: "M3.8 Corinth Gulf", mag: 3.8 },
    { lat: -33.5, lon: -70.7, label: "M5.1 Chile Central", mag: 5.1 },
    { lat: 34.0, lon: 135.8, label: "M3.4 Osaka Region", mag: 3.4 },
    { lat: 38.7, lon: 43.1, label: "M4.7 Eastern Turkey", mag: 4.7 },
    { lat: 38.2, lon: 141.8, label: "M5.9 Tohoku Coast", mag: 5.9 },
    { lat: -6.2, lon: 107.0, label: "M4.1 Java, Indonesia", mag: 4.1 },
    { lat: 44.4, lon: 26.1, label: "M3.6 Vrancea Romania", mag: 3.6 },
  ];

  return events.slice(0, count).map((ev) => ({
    id: `SES-${randomId()}`,
    type: "EARTHQUAKE" as const,
    domain: "seismic" as const,
    label: ev.label,
    position: { lat: clampLat(ev.lat + randomBetween(-0.5, 0.5)), lon: wrapLon(ev.lon + randomBetween(-0.5, 0.5)) },
    severity: (ev.mag >= 6 ? "HIGH" : ev.mag >= 5 ? "MEDIUM" : "LOW") as SeverityLevel,
    classification: "UNCLASSIFIED" as const,
    anomalyFlag: ev.mag >= 5.5,
    confidence: 0.99,
    source: "USGS-ANSS",
    ts: isoOffset(randomInt(0, 3600)),
    meta: {
      magnitude: ev.mag,
      depth: `${randomInt(5, 50)} km`,
      type: "Tectonic",
      usgs_id: `us${randomId().toLowerCase()}`,
      tsunami: ev.mag >= 7 ? "WATCH ISSUED" : "No",
    },
  }));
}

// ─── Conflict entities ────────────────────────────────────────────────────────

const CONFLICT_EVENTS = [
  { name: "Kinetic Strike", lat: 48.5, lon: 37.5, sev: "CRITICAL" as SeverityLevel },
  { name: "Artillery Exchange", lat: 47.8, lon: 36.2, sev: "HIGH" as SeverityLevel },
  { name: "IED Detonation", lat: 33.3, lon: 44.4, sev: "HIGH" as SeverityLevel },
  { name: "Armed Clash", lat: 15.5, lon: 38.5, sev: "MEDIUM" as SeverityLevel },
  { name: "VBIED Incident", lat: 33.9, lon: 35.5, sev: "HIGH" as SeverityLevel },
  { name: "Drone Strike", lat: 48.1, lon: 38.0, sev: "CRITICAL" as SeverityLevel },
  { name: "Naval Incident", lat: 12.5, lon: 43.5, sev: "HIGH" as SeverityLevel },
  { name: "Ground Offensive", lat: 49.0, lon: 35.0, sev: "CRITICAL" as SeverityLevel },
  { name: "Missile Launch", lat: 40.3, lon: 125.5, sev: "CRITICAL" as SeverityLevel },
  { name: "Armed Protest", lat: 19.4, lon: 5.3, sev: "MEDIUM" as SeverityLevel },
];

function generateConflictEntities(count: number): SentinelEntity[] {
  return CONFLICT_EVENTS.slice(0, count).map((ev) => ({
    id: `CNF-${randomId()}`,
    type: "CONFLICT_EVENT" as const,
    domain: "conflict" as const,
    label: ev.name,
    position: {
      lat: clampLat(ev.lat + randomBetween(-0.3, 0.3)),
      lon: wrapLon(ev.lon + randomBetween(-0.3, 0.3)),
    },
    severity: ev.sev,
    classification: "CONFIDENTIAL" as const,
    anomalyFlag: ev.sev === "CRITICAL",
    confidence: randomBetween(0.65, 0.92),
    source: "ACLED/GDELT",
    ts: isoOffset(randomInt(0, 7200)),
    meta: {
      source_type: pickRandom(["Social Media", "SIGINT", "HUMINT", "SAR Imagery"]),
      casualties: ev.sev === "CRITICAL" ? `Est. ${randomInt(5, 50)} KIA` : "Unknown",
      actor1: pickRandom(["State Forces", "NSAGs", "PMC", "Rebel Group"]),
      actor2: pickRandom(["Civilians", "Opposing Forces", "Unknown"]),
      verified: Math.random() > 0.3,
      acled_id: randomInt(10000, 99999).toString(),
    },
  }));
}

// ─── Cyber entities ───────────────────────────────────────────────────────────

const CYBER_EVENTS = [
  { src: "194.165.16.0/24", dst: "10.0.0.0/8", type: "DDoS", sev: "HIGH" as SeverityLevel },
  { src: "45.153.160.0/22", dst: "Critical Infrastructure", type: "Ransomware C2", sev: "CRITICAL" as SeverityLevel },
  { src: "185.220.101.0/24", dst: "Government Networks", type: "Tor Exit - APT", sev: "HIGH" as SeverityLevel },
  { src: "91.108.4.0/22", dst: "Financial Sector", type: "Credential Stuffing", sev: "MEDIUM" as SeverityLevel },
  { src: "5.188.206.0/24", dst: "Energy Grid SCADA", type: "ICS Intrusion", sev: "CRITICAL" as SeverityLevel },
];

function generateCyberEntities(count: number): SentinelEntity[] {
  const origins: GeoPoint[] = [
    { lat: 55.7, lon: 37.6 },   // Moscow
    { lat: 39.9, lon: 116.4 },  // Beijing
    { lat: 35.7, lon: 51.4 },   // Tehran
    { lat: 38.0, lon: 127.0 },  // Pyongyang
    { lat: 37.6, lon: -77.5 },  // Richmond VA (TOR)
  ];

  return CYBER_EVENTS.slice(0, count).map((ev) => {
    const pos = pickRandom(origins);
    return {
      id: `CYB-${randomId()}`,
      type: "CYBER_ATTACK" as const,
      domain: "cyber" as const,
      label: ev.type,
      position: { lat: pos.lat + randomBetween(-2, 2), lon: pos.lon + randomBetween(-2, 2) },
      severity: ev.sev,
      classification: "SECRET" as const,
      anomalyFlag: ev.sev === "CRITICAL",
      confidence: randomBetween(0.55, 0.88),
      source: "Shodan/GreyNoise",
      ts: isoOffset(randomInt(0, 900)),
      meta: {
        srcIP: ev.src,
        targetSector: ev.dst,
        attackVector: ev.type,
        iocCount: randomInt(3, 47),
        cve: Math.random() > 0.5 ? `CVE-2024-${randomInt(1000, 9999)}` : "0-day suspected",
        attribution: pickRandom(["APT29", "APT41", "Lazarus Group", "Sandworm", "Unknown"]),
        volume: `${randomInt(10, 500)} Gbps`,
      },
    };
  });
}

// ─── Nuclear / WMD entities ──────────────────────────────────────────────────

const NUCLEAR_FACILITIES = [
  { name: "KALININGRAD ISKANDER SITE", lat: 54.71, lon: 20.5, sev: "HIGH" as SeverityLevel },
  { name: "YONGBYON REACTOR (DPRK)", lat: 39.79, lon: 125.75, sev: "CRITICAL" as SeverityLevel },
  { name: "NATANZ ENRICHMENT (IR)", lat: 33.72, lon: 51.73, sev: "HIGH" as SeverityLevel },
  { name: "SEVERODVINSK SUBMARINE BASE", lat: 64.56, lon: 39.83, sev: "MEDIUM" as SeverityLevel },
  { name: "LANCHENG SILO FIELD (CN)", lat: 40.23, lon: 97.12, sev: "MEDIUM" as SeverityLevel },
];

function generateNuclearEntities(count: number): SentinelEntity[] {
  return NUCLEAR_FACILITIES.slice(0, count).map((fac) => ({
    id: `NUC-${randomId()}`,
    type: "NUCLEAR_FACILITY" as const,
    domain: "nuclear" as const,
    label: fac.name,
    position: {
      lat: clampLat(fac.lat + randomBetween(-0.05, 0.05)),
      lon: wrapLon(fac.lon + randomBetween(-0.05, 0.05)),
    },
    severity: fac.sev,
    classification: "TOP_SECRET" as const,
    anomalyFlag: fac.sev === "CRITICAL",
    confidence: randomBetween(0.7, 0.95),
    source: "NRO/CTBTO",
    ts: isoOffset(randomInt(0, 3600)),
    meta: {
      facilityType: pickRandom(["Enrichment", "Reactor", "Launch Site", "Storage", "Submarine Base"]),
      activity: fac.sev === "CRITICAL" ? "ELEVATED" : "NOMINAL",
      thermalSignature: fac.sev === "CRITICAL" ? "ANOMALOUS" : "BASELINE",
      lastImagery: isoOffset(randomInt(3600, 86400)),
      vehicleCount: randomInt(5, 80),
      ctbto: `IMS Station ${randomInt(10, 99)}`,
    },
  }));
}

// ─── SIGINT entities ──────────────────────────────────────────────────────────

function generateSigintEntities(count: number): SentinelEntity[] {
  return Array.from({ length: count }, () => {
    const pos = hotspotBiasedPosition();
    return {
      id: `SIG-${randomId()}`,
      type: "SIGINT_EMISSION" as const,
      domain: "sigint" as const,
      label: `EMITTER-${randomId().slice(0, 4)}`,
      position: pos,
      severity: pickRandom(["HIGH", "MEDIUM", "LOW", "LOW"] as SeverityLevel[]),
      classification: "SECRET" as const,
      anomalyFlag: Math.random() < 0.15,
      confidence: randomBetween(0.5, 0.9),
      source: "SIGINT Collection",
      ts: isoOffset(randomInt(0, 300)),
      meta: {
        frequency: `${randomBetween(100, 18000).toFixed(1)} MHz`,
        bandwidth: `${randomBetween(0.1, 40).toFixed(1)} MHz`,
        modulation: pickRandom(["BPSK", "QPSK", "QAM-64", "OFDM", "FSK", "AM"]),
        powerDbm: randomInt(-100, 0),
        emitterType: pickRandom(["Radar", "Comms", "Jammer", "Navigation", "Unknown"]),
        bearing: `${randomInt(0, 359)}°`,
      },
    };
  });
}

// ─── Event stream generator ───────────────────────────────────────────────────

const EVENT_TEMPLATES = [
  { title: "AIRCRAFT SQUAWK 7700 DETECTED", domain: "aviation", sev: "HIGH" as SeverityLevel },
  { title: "AIS SIGNAL LOSS — DARK VESSEL", domain: "maritime", sev: "HIGH" as SeverityLevel },
  { title: "KINETIC IMPACT DETECTED", domain: "conflict", sev: "CRITICAL" as SeverityLevel },
  { title: "BALLISTIC TRAJECTORY COMPUTED", domain: "orbital", sev: "CRITICAL" as SeverityLevel },
  { title: "M5+ SEISMIC EVENT", domain: "seismic", sev: "MEDIUM" as SeverityLevel },
  { title: "ICS/SCADA INTRUSION ATTEMPT", domain: "cyber", sev: "CRITICAL" as SeverityLevel },
  { title: "GPS JAMMING ANOMALY", domain: "sigint", sev: "HIGH" as SeverityLevel },
  { title: "HURRICANE CAT-4 LANDFALL IMMINENT", domain: "weather", sev: "HIGH" as SeverityLevel },
  { title: "MILITARY BUILDUP CONFIRMED", domain: "conflict", sev: "HIGH" as SeverityLevel },
  { title: "SATELLITE CONJUNCTION WARNING", domain: "orbital", sev: "MEDIUM" as SeverityLevel },
  { title: "FORMATION FLIGHT — UNSCHEDULED", domain: "aviation", sev: "MEDIUM" as SeverityLevel },
  { title: "RADIOACTIVE SOURCE DETECTED", domain: "nuclear", sev: "CRITICAL" as SeverityLevel },
  { title: "NAVAL BLOCKADE PATTERN", domain: "maritime", sev: "HIGH" as SeverityLevel },
  { title: "APT LATERAL MOVEMENT", domain: "cyber", sev: "HIGH" as SeverityLevel },
  { title: "TSUNAMI WATCH ISSUED", domain: "seismic", sev: "HIGH" as SeverityLevel },
];

const EVENT_DETAILS: Record<string, string[]> = {
  aviation: ["Squawk 7700 emergency. Aircraft deviating from FPL. ATC notified.", "Military formation crossing FIR boundary without clearance. NORAD tracking.", "Unknown aircraft shadowing commercial flight — ISR posture suspected."],
  maritime: ["Vessel dark for 18h in restricted waters. Last known pos: Strait of Hormuz.", "Warship operating in EEZ without notification. FONOPS assessment underway.", "VLCC conducting STS transfer in international waters. Sanctions evasion suspected."],
  conflict: ["Multiple BPMD explosions detected via acoustic monitoring grid.", "Satellite imagery shows convoy movement toward LOC. Est. 40 vehicles.", "SIGINT confirms C2 communications surge preceding ground offensive."],
  orbital: ["TLE update shows maneuver inconsistent with stated mission profile.", "Debris field expanding — 237 trackable objects post-fragmentation event.", "Rendezvous and proximity operations detected near US satellite."],
  seismic: ["USGS confirms magnitude 5.9 — shallow depth, high damage potential.", "Infrasound sensors detected low-frequency signature. Underground event possible.", "CBRN alert: seismic signature inconsistent with natural tectonic activity."],
  cyber: ["Sandworm TTPs confirmed. Targeting power grid SCADA systems.", "BGP hijack detected — 4,200 prefixes affected. Attribution: AS12389.", "Zero-day exploit circulating in darknet. Patch not yet available."],
  sigint: ["High-power jamming on L1/L2 GPS frequencies. Source triangulated.", "Encrypted burst transmission on SATCOM frequency allocated to adversary.", "Electronic order of battle update: new emitter type identified."],
  weather: ["Rapid intensification: CAT-3 to CAT-5 in 24h. Track toward major port.", "SIGMET issued: severe turbulence FL240-FL390 across theater of operations.", "Polar vortex disruption affecting logistics routes — grounding conditions."],
  nuclear: ["Elevated thermal signature at facility. Reactor activity change detected.", "CTBTO station reports elevated Cs-137. Source location being triangulated.", "Increased vehicle activity at weapons storage facility."],
};

function generateEvents(count: number): StreamEvent[] {
  return Array.from({ length: count }, (_, i) => {
    const template = EVENT_TEMPLATES[i % EVENT_TEMPLATES.length];
    const details = EVENT_DETAILS[template.domain as keyof typeof EVENT_DETAILS] ?? [];
    const detail = pickRandom(details);
    return {
      id: `EVT-${randomId()}`,
      domain: template.domain as DomainKey,
      severity: template.sev,
      title: template.title,
      description: detail,
      ts: isoOffset(randomInt(0, 14400)),
      position: hotspotBiasedPosition(),
      acknowledged: Math.random() < 0.3,
    };
  });
}

// ─── Main engine export ───────────────────────────────────────────────────────

export interface WorldSnapshot {
  entities: SentinelEntity[];
  events: StreamEvent[];
  generatedAt: string;
}

export function generateWorldSnapshot(): WorldSnapshot {
  const entities: SentinelEntity[] = [
    ...generateAviationEntities(65),
    ...generateMaritimeEntities(48),
    ...generateOrbitalEntities(32),
    ...generateSeismicEntities(8),
    ...generateConflictEntities(10),
    ...generateCyberEntities(5),
    ...generateNuclearEntities(5),
    ...generateSigintEntities(12),
  ];

  const events = generateEvents(30);

  return {
    entities,
    events,
    generatedAt: isoNow(),
  };
}

// Simulate entity movement — called on each update tick
export function propagateEntities(entities: SentinelEntity[]): SentinelEntity[] {
  return entities.map((entity) => {
    if (!entity.heading || !entity.speed) return entity;

    // Aviation and maritime entities move
    if (entity.domain !== "aviation" && entity.domain !== "maritime") return entity;

    const speedDeg = (entity.speed / 3600) * (entity.domain === "aviation" ? 0.0089 : 0.005) * 5;
    const headingRad = (entity.heading * Math.PI) / 180;

    const newLat = clampLat(entity.position.lat + Math.cos(headingRad) * speedDeg);
    const newLon = wrapLon(entity.position.lon + Math.sin(headingRad) * speedDeg);

    // Small heading drift
    const headingDrift = (Math.random() - 0.5) * 2;
    const newHeading = (entity.heading + headingDrift + 360) % 360;

    const track = entity.track ?? [];
    const updatedTrack = [...track.slice(-8), entity.position];

    return {
      ...entity,
      position: { lat: newLat, lon: newLon, alt: entity.position.alt },
      heading: newHeading,
      track: updatedTrack,
      ts: isoNow(),
    };
  });
}

export function generateNewEvent(): StreamEvent {
  const template = pickRandom(EVENT_TEMPLATES);
  const details = EVENT_DETAILS[template.domain as keyof typeof EVENT_DETAILS] ?? [];
  return {
    id: `EVT-${randomId()}`,
    domain: template.domain as DomainKey,
    severity: template.sev,
    title: template.title,
    description: pickRandom(details),
    ts: isoNow(),
    position: hotspotBiasedPosition(),
    acknowledged: false,
  };
}
