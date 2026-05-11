// supabase/functions/sentinel-feeds/index.ts
// Real-world data feed aggregator for SENTINEL-X
// Pulls live data from: USGS, OpenWeatherMap, N2YO, NewsAPI, NASA FIRMS, Shodan, AVWX, GFW

import { corsHeaders as baseCors } from "../_shared/cors.ts";

const corsHeaders = {
  ...baseCors,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ─── Type definitions ──────────────────────────────────────────────────────────

interface LiveEntity {
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
}

interface FeedResult {
  domain: string;
  entities: LiveEntity[];
  fetchedAt: string;
  error?: string;
  latencyMs: number;
}

// ─── Severity calculators ──────────────────────────────────────────────────────

function earthquakeSeverity(mag: number): string {
  if (mag >= 7.0) return "CRITICAL";
  if (mag >= 6.0) return "HIGH";
  if (mag >= 5.0) return "MEDIUM";
  if (mag >= 4.0) return "LOW";
  return "INFO";
}

function windSeverity(windKph: number): string {
  if (windKph >= 120) return "CRITICAL";
  if (windKph >= 80)  return "HIGH";
  if (windKph >= 50)  return "MEDIUM";
  return "LOW";
}

function newsSeverity(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("war") || t.includes("attack") || t.includes("missile") || t.includes("nuclear")) return "CRITICAL";
  if (t.includes("conflict") || t.includes("military") || t.includes("troops") || t.includes("explosion")) return "HIGH";
  if (t.includes("crisis") || t.includes("tension") || t.includes("protest") || t.includes("strike")) return "MEDIUM";
  return "LOW";
}

function shodanSeverity(ports: number[]): string {
  const critical = [22, 23, 3389, 5900, 5985, 445];
  const high = [21, 25, 110, 143, 1433, 3306, 5432, 6379, 27017];
  if (ports.some((p) => critical.includes(p))) return "CRITICAL";
  if (ports.some((p) => high.includes(p))) return "HIGH";
  return "MEDIUM";
}

// ─── USGS Earthquake Feed ──────────────────────────────────────────────────────

async function fetchSeismic(): Promise<FeedResult> {
  const t0 = Date.now();
  try {
    const url = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&orderby=time&limit=25";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
    const data = await res.json();

    const entities: LiveEntity[] = (data.features ?? []).map((f: any) => ({
      id: `usgs-${f.id}`,
      domain: "seismic",
      type: "EARTHQUAKE",
      label: `M${f.properties.mag.toFixed(1)} ${f.properties.place ?? "Unknown"}`,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      severity: earthquakeSeverity(f.properties.mag),
      source: "USGS-FDSNWS",
      ts: new Date(f.properties.time).toISOString(),
      confidence: 0.98,
      meta: {
        magnitude: f.properties.mag,
        depth: f.geometry.coordinates[2],
        place: f.properties.place,
        felt: f.properties.felt,
        alert: f.properties.alert,
        url: f.properties.url,
      },
    }));

    console.log(`USGS: ${entities.length} earthquakes`);
    return { domain: "seismic", entities, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    console.error("USGS error:", err);
    return { domain: "seismic", entities: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

// ─── OpenWeatherMap Severe Weather ────────────────────────────────────────────

async function fetchWeather(): Promise<FeedResult> {
  const t0 = Date.now();
  const apiKey = Deno.env.get("OPENWEATHERMAP_API_KEY");
  if (!apiKey) return { domain: "weather", entities: [], fetchedAt: new Date().toISOString(), latencyMs: 0, error: "No API key" };

  // Monitor high-risk weather cities / ocean areas
  const locations = [
    { name: "Bay of Bengal", lat: 15, lon: 90 },
    { name: "Gulf of Mexico", lat: 25, lon: -90 },
    { name: "Philippine Sea", lat: 18, lon: 130 },
    { name: "Arabian Sea", lat: 18, lon: 65 },
    { name: "North Atlantic", lat: 45, lon: -40 },
    { name: "South China Sea", lat: 15, lon: 115 },
    { name: "Caribbean", lat: 15, lon: -75 },
    { name: "Western Pacific", lat: 20, lon: 150 },
  ];

  try {
    const results = await Promise.allSettled(
      locations.map((loc) =>
        fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${loc.lat}&lon=${loc.lon}&appid=${apiKey}&units=metric`,
          { signal: AbortSignal.timeout(6000) }
        ).then((r) => r.json())
      )
    );

    const entities: LiveEntity[] = [];
    results.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      const d = r.value;
      if (!d?.wind) return;
      const windKph = (d.wind.speed ?? 0) * 3.6;
      const sev = windSeverity(windKph);
      if (sev === "INFO") return; // skip calm conditions

      const weatherId = d.weather?.[0]?.id ?? 800;
      let wtype = "STORM_HURRICANE";
      if (weatherId >= 200 && weatherId < 300) wtype = "STORM_HURRICANE"; // thunderstorm
      else if (weatherId >= 700 && weatherId < 800) wtype = "WILDFIRE"; // atmospheric
      else wtype = "STORM_TYPHOON";

      entities.push({
        id: `owm-${d.id ?? i}-${Date.now()}`,
        domain: "weather",
        type: wtype,
        label: `${d.weather?.[0]?.main ?? "STORM"} — ${locations[i].name}`,
        lat: locations[i].lat,
        lon: locations[i].lon,
        severity: sev,
        source: "OPENWEATHERMAP",
        ts: new Date().toISOString(),
        confidence: 0.85,
        heading: d.wind?.deg ?? 0,
        speed: Math.round(windKph / 1.852), // kph -> knots
        meta: {
          windKph: windKph.toFixed(1),
          windGust: d.wind?.gust ? `${(d.wind.gust * 3.6).toFixed(1)} km/h` : null,
          temp: d.main?.temp,
          humidity: d.main?.humidity,
          pressure: d.main?.pressure,
          description: d.weather?.[0]?.description,
          cloudCover: d.clouds?.all,
          visibility: d.visibility,
        },
      });
    });

    console.log(`OpenWeatherMap: ${entities.length} weather events`);
    return { domain: "weather", entities, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    console.error("OpenWeatherMap error:", err);
    return { domain: "weather", entities: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

// ─── N2YO Satellite Tracking ──────────────────────────────────────────────────

async function fetchOrbital(): Promise<FeedResult> {
  const t0 = Date.now();
  const apiKey = Deno.env.get("N2YO_API_KEY");
  if (!apiKey) return { domain: "orbital", entities: [], fetchedAt: new Date().toISOString(), latencyMs: 0, error: "No API key" };

  // Track ISS + key military satellites visible from equatorial plane
  // catIds: 25544=ISS, 43013=GPS BIIR-2, 40534=USA-265 (reconnaissance), 37348=NROL-49, 41836=USA-276
  const catIds = [25544, 43013, 40534, 37348, 41836, 27424, 28884, 32384, 36411, 39533];

  try {
    const results = await Promise.allSettled(
      catIds.slice(0, 6).map((id) =>
        fetch(
          `https://api.n2yo.com/rest/v1/satellite/positions/${id}/0/0/0/1/&apiKey=${apiKey}`,
          { signal: AbortSignal.timeout(8000) }
        ).then((r) => r.json())
      )
    );

    const entities: LiveEntity[] = [];
    results.forEach((r) => {
      if (r.status !== "fulfilled") return;
      const d = r.value;
      if (!d?.info || !d?.positions?.[0]) return;
      const pos = d.positions[0];

      const isMilitary = d.info.satname?.includes("USA") || d.info.satname?.includes("NROL") || d.info.satname?.includes("LACROSSE");
      const isISS = d.info.satid === 25544;

      entities.push({
        id: `n2yo-${d.info.satid}`,
        domain: "orbital",
        type: isMilitary ? "SATELLITE_ISR" : isISS ? "SATELLITE_COMMS" : "SATELLITE_GNSS",
        label: d.info.satname ?? `SAT-${d.info.satid}`,
        lat: pos.satlatitude,
        lon: pos.satlongitude,
        altitude: Math.round(pos.sataltitude * 3280.84), // km -> feet
        severity: isMilitary ? "HIGH" : "LOW",
        source: "N2YO",
        ts: new Date(pos.timestamp * 1000).toISOString(),
        confidence: 0.97,
        meta: {
          satId: d.info.satid,
          satName: d.info.satname,
          altitudeKm: pos.sataltitude,
          azimuth: pos.azimuth,
          elevation: pos.elevation,
          ra: pos.ra,
          dec: pos.dec,
          timestamp: pos.timestamp,
          transactionsCount: d.info.transactionscount,
        },
      });
    });

    console.log(`N2YO: ${entities.length} satellites`);
    return { domain: "orbital", entities, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    console.error("N2YO error:", err);
    return { domain: "orbital", entities: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

// ─── NASA FIRMS Fire/Hotspot Feed ─────────────────────────────────────────────

async function fetchWildfire(): Promise<FeedResult> {
  const t0 = Date.now();
  const apiKey = Deno.env.get("NASA_FIRMS_API_KEY");
  if (!apiKey) return { domain: "conflict", entities: [], fetchedAt: new Date().toISOString(), latencyMs: 0, error: "No API key" };

  try {
    // VIIRS active fires (last 24h, worldwide)
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_SNPP_NRT/-180,-90,180,90/1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`FIRMS HTTP ${res.status}`);
    const text = await res.text();

    const lines = text.trim().split("\n").slice(1); // skip header
    const entities: LiveEntity[] = [];

    // Sample up to 30 most recent/intense fires
    const sampled = lines.slice(0, 60).filter((_, i) => i % 2 === 0).slice(0, 30);
    sampled.forEach((line, i) => {
      const cols = line.split(",");
      if (cols.length < 9) return;
      const lat = parseFloat(cols[0]);
      const lon = parseFloat(cols[1]);
      const brightness = parseFloat(cols[2] ?? "300");
      const frp = parseFloat(cols[12] ?? "0"); // fire radiative power MW

      if (isNaN(lat) || isNaN(lon)) return;

      const sev = frp > 200 ? "CRITICAL" : frp > 80 ? "HIGH" : frp > 20 ? "MEDIUM" : "LOW";

      entities.push({
        id: `firms-${i}-${Math.round(lat * 100)}-${Math.round(lon * 100)}`,
        domain: "conflict", // mapped to conflict domain (wildfire/hazard)
        type: "WILDFIRE",
        label: `WILDFIRE — FRP ${frp.toFixed(0)} MW`,
        lat,
        lon,
        severity: sev,
        source: "NASA-FIRMS-VIIRS",
        ts: new Date().toISOString(),
        confidence: 0.92,
        meta: {
          brightness,
          frpMW: frp,
          satellite: cols[7] ?? "SNPP",
          dayNight: cols[8] ?? "D",
          acqusitionDate: cols[5],
          acqusitionTime: cols[6],
        },
      });
    });

    console.log(`NASA FIRMS: ${entities.length} fire hotspots`);
    return { domain: "conflict", entities, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    console.error("NASA FIRMS error:", err);
    return { domain: "conflict", entities: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

// ─── NewsAPI Conflict Events ───────────────────────────────────────────────────

async function fetchConflict(): Promise<FeedResult> {
  const t0 = Date.now();
  const apiKey = Deno.env.get("NEWS_API_KEY");
  if (!apiKey) return { domain: "conflict", entities: [], fetchedAt: new Date().toISOString(), latencyMs: 0, error: "No API key" };

  // Known conflict coordinates for geocoding news
  const conflictZones: Record<string, [number, number]> = {
    ukraine: [49.0, 32.0], russia: [55.75, 37.6], gaza: [31.35, 34.45],
    israel: [31.5, 34.75], taiwan: [23.5, 121.0], china: [35.0, 105.0],
    iran: [32.0, 53.0], north: [40.0, 127.0], korea: [37.5, 127.0],
    myanmar: [17.0, 96.0], sudan: [15.5, 32.5], somalia: [5.0, 46.0],
    yemen: [15.5, 48.5], syria: [35.0, 38.5], iraq: [33.0, 44.5],
    afghanistan: [33.0, 65.0], pakistan: [30.0, 70.0], india: [22.0, 78.0],
    haiti: [19.0, -72.5], venezuela: [7.0, -66.0], congo: [-4.0, 20.0],
    ethiopia: [9.0, 40.0], mali: [17.0, -4.0], nigeria: [10.0, 8.0],
  };

  try {
    const q = encodeURIComponent("military attack conflict war airstrike troops");
    const url = `https://newsapi.org/v2/everything?q=${q}&language=en&sortBy=publishedAt&pageSize=20&apiKey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`NewsAPI HTTP ${res.status}`);
    const data = await res.json();

    const entities: LiveEntity[] = [];
    let placed = 0;

    for (const article of (data.articles ?? []).slice(0, 20)) {
      if (placed >= 12) break;
      const title = (article.title ?? "").toLowerCase();
      const desc = (article.description ?? "").toLowerCase();
      const combined = `${title} ${desc}`;

      // Find a conflict zone mentioned
      let matched: [number, number] | null = null;
      let matchedKey = "";
      for (const [key, coords] of Object.entries(conflictZones)) {
        if (combined.includes(key)) {
          matched = coords;
          matchedKey = key;
          break;
        }
      }

      if (!matched) continue;

      // Add small jitter so articles don't stack
      const jLat = matched[0] + (Math.random() - 0.5) * 2;
      const jLon = matched[1] + (Math.random() - 0.5) * 2;

      const sev = newsSeverity(article.title ?? "");
      entities.push({
        id: `news-${Buffer.from(article.url ?? placed.toString()).toString("base64").slice(0, 12)}`,
        domain: "conflict",
        type: "CONFLICT_EVENT",
        label: (article.title ?? "CONFLICT EVENT").slice(0, 50),
        lat: jLat,
        lon: jLon,
        severity: sev,
        source: `NEWSAPI:${article.source?.name ?? "UNKNOWN"}`,
        ts: article.publishedAt ?? new Date().toISOString(),
        confidence: 0.6,
        meta: {
          headline: article.title,
          source: article.source?.name,
          url: article.url,
          region: matchedKey.toUpperCase(),
          publishedAt: article.publishedAt,
        },
      });
      placed++;
    }

    console.log(`NewsAPI: ${entities.length} conflict events`);
    return { domain: "conflict", entities, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    console.error("NewsAPI error:", err);
    return { domain: "conflict", entities: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

// ─── Shodan Cyber Threat Feed ─────────────────────────────────────────────────

async function fetchCyber(): Promise<FeedResult> {
  const t0 = Date.now();
  const apiKey = Deno.env.get("SHODAN_API_KEY");
  if (!apiKey) return { domain: "cyber", entities: [], fetchedAt: new Date().toISOString(), latencyMs: 0, error: "No API key" };

  try {
    // Search for exposed critical infrastructure (SCADA/ICS/OT systems)
    const queries = [
      "product:Modbus",
      "port:102 S7",
      "DNP3",
    ];

    const results = await Promise.allSettled(
      queries.map((q) =>
        fetch(
          `https://api.shodan.io/shodan/host/search?query=${encodeURIComponent(q)}&key=${apiKey}&minify=false&page=1`,
          { signal: AbortSignal.timeout(8000) }
        ).then((r) => r.json())
      )
    );

    const entities: LiveEntity[] = [];
    const seenIPs = new Set<string>();

    results.forEach((r, qi) => {
      if (r.status !== "fulfilled") return;
      const data = r.value;
      if (!data?.matches) return;

      for (const host of (data.matches ?? []).slice(0, 8)) {
        if (!host.ip_str || seenIPs.has(host.ip_str)) continue;
        if (!host.location?.latitude || !host.location?.longitude) continue;
        seenIPs.add(host.ip_str);

        const ports: number[] = host.ports ?? [];
        const sev = shodanSeverity(ports);

        entities.push({
          id: `shodan-${host.ip_str.replace(/\./g, "-")}`,
          domain: "cyber",
          type: "CYBER_ATTACK",
          label: `EXPOSED ICS — ${host.ip_str} [${host.org ?? "UNKNOWN"}]`,
          lat: host.location.latitude,
          lon: host.location.longitude,
          severity: sev,
          source: "SHODAN",
          ts: host.timestamp ?? new Date().toISOString(),
          confidence: 0.78,
          meta: {
            ip: host.ip_str,
            org: host.org,
            isp: host.isp,
            country: host.location?.country_name,
            city: host.location?.city,
            ports,
            product: host.product,
            version: host.version,
            vulns: host.vulns ? Object.keys(host.vulns).slice(0, 5) : [],
            queryType: queries[qi],
          },
        });
      }
    });

    console.log(`Shodan: ${entities.length} exposed ICS systems`);
    return { domain: "cyber", entities, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    console.error("Shodan error:", err);
    return { domain: "cyber", entities: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

// ─── AVWX Aviation Weather (NOTAMs / METARs for military fields) ──────────────

async function fetchAviation(): Promise<FeedResult> {
  const t0 = Date.now();
  const apiKey = Deno.env.get("AVWX_API_KEY");
  if (!apiKey) return { domain: "aviation", entities: [], fetchedAt: new Date().toISOString(), latencyMs: 0, error: "No API key" };

  // Major military/international airfields near conflict zones
  const stations = ["URWW", "UKHH", "OKBK", "OIIE", "ZBAA", "RKSO", "VVNB", "DNMM"];

  try {
    const results = await Promise.allSettled(
      stations.slice(0, 5).map((icao) =>
        fetch(`https://avwx.rest/api/metar/${icao}?token=${apiKey}`, {
          signal: AbortSignal.timeout(6000),
        }).then((r) => r.json())
      )
    );

    const entities: LiveEntity[] = [];
    results.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      const d = r.value;
      if (!d?.station || !d?.meta) return;

      const windKts = d.wind_speed?.value ?? 0;
      const vis = d.visibility?.value ?? 9999;
      const isAdverse = windKts > 25 || vis < 3000;
      if (!isAdverse) return; // only report adverse conditions

      // ICAO to rough coordinates (approximate)
      const coordMap: Record<string, [number, number]> = {
        URWW: [48.7, 44.4], UKHH: [49.9, 36.3], OKBK: [29.2, 47.9],
        OIIE: [35.7, 51.3], ZBAA: [40.1, 116.6], RKSO: [37.4, 127.1],
        VVNB: [21.2, 105.8], DNMM: [6.6, 3.3],
      };
      const coords = coordMap[stations[i]] ?? [0, 0];

      entities.push({
        id: `avwx-${d.station}-${Date.now()}`,
        domain: "aviation",
        type: "AIRCRAFT_UNKNOWN",
        label: `METAR ${d.station} — ${d.flight_rules ?? "UNKNOWN"} CONDITIONS`,
        lat: coords[0],
        lon: coords[1],
        severity: d.flight_rules === "LIFR" ? "CRITICAL" : d.flight_rules === "IFR" ? "HIGH" : "MEDIUM",
        source: "AVWX-METAR",
        ts: d.time?.dt ?? new Date().toISOString(),
        confidence: 0.95,
        meta: {
          station: d.station,
          flightRules: d.flight_rules,
          rawText: d.raw,
          windKts,
          windDir: d.wind_direction?.value,
          visibilityM: vis,
          tempC: d.temperature?.value,
          dewpointC: d.dewpoint?.value,
          altimeterHPa: d.altimeter?.value,
          clouds: d.clouds?.map((c: any) => `${c.type}${c.altitude}`).join(", "),
        },
      });
    });

    console.log(`AVWX: ${entities.length} adverse METAR conditions`);
    return { domain: "aviation", entities, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    console.error("AVWX error:", err);
    return { domain: "aviation", entities: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

// ─── Global Fishing Watch Maritime ────────────────────────────────────────────

async function fetchMaritime(): Promise<FeedResult> {
  const t0 = Date.now();
  const token = Deno.env.get("GLOBAL_FISHING_WATCH_TOKEN");
  if (!token) return { domain: "maritime", entities: [], fetchedAt: new Date().toISOString(), latencyMs: 0, error: "No token" };

  try {
    // GFW Vessels API - search for vessels near key maritime chokepoints
    const now = new Date();
    const startDate = new Date(now.getTime() - 6 * 3600 * 1000).toISOString().split("T")[0];
    const endDate = now.toISOString().split("T")[0];

    const res = await fetch(
      `https://gateway.api.globalfishingwatch.org/v3/events?datasets[0]=public-global-fishing-events:latest&start-date=${startDate}&end-date=${endDate}&limit=20&offset=0`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) throw new Error(`GFW HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();

    const entities: LiveEntity[] = (data.entries ?? []).slice(0, 15).map((e: any, i: number) => ({
      id: `gfw-${e.id ?? i}`,
      domain: "maritime",
      type: "VESSEL_CARGO",
      label: `FISHING VESSEL — ${e.vessel?.name ?? e.vessel?.ssvid ?? "UNKNOWN"}`,
      lat: e.position?.lat ?? (e.regions?.eez?.[0] ? 0 : 0),
      lon: e.position?.lon ?? 0,
      severity: "LOW",
      source: "GLOBAL-FISHING-WATCH",
      ts: e.start ?? new Date().toISOString(),
      confidence: 0.82,
      meta: {
        vesselId: e.vessel?.id,
        vesselName: e.vessel?.name,
        ssvid: e.vessel?.ssvid,
        flag: e.vessel?.flag,
        eventType: e.type,
        duration: e.end ? `${Math.round((new Date(e.end).getTime() - new Date(e.start).getTime()) / 3600000)}h` : null,
        eez: e.regions?.eez,
      },
    })).filter((e: LiveEntity) => e.lat !== 0);

    console.log(`GFW: ${entities.length} maritime events`);
    return { domain: "maritime", entities, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    console.error("GFW error:", err);
    return { domain: "maritime", entities: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

// ─── AIS Stream token delivery ───────────────────────────────────────────────

async function handleAISToken(): Promise<Response> {
  const token = Deno.env.get("AIS_STREAM_TOKEN");
  if (!token) {
    return new Response(
      JSON.stringify({ error: "AIS_STREAM_TOKEN not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  return new Response(
    JSON.stringify({ token }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ─── Space-Track TLE + Conjunction Feed ──────────────────────────────────────

async function fetchSpaceTrack(): Promise<FeedResult> {
  const t0 = Date.now();
  const username = Deno.env.get("SPACE_TRACK_USERNAME");
  const password = Deno.env.get("SPACE_TRACK_PASSWORD");

  if (!username || !password) {
    return { domain: "orbital", entities: [], fetchedAt: new Date().toISOString(), latencyMs: 0, error: "Space-Track credentials not configured" };
  }

  try {
    const BASE = "https://www.space-track.org";

    // Authenticate (cookie-based session)
    const loginRes = await fetch(`${BASE}/ajaxauth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `identity=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
      signal: AbortSignal.timeout(10000),
    });

    if (!loginRes.ok) throw new Error(`Space-Track login failed: ${loginRes.status}`);

    const cookies = loginRes.headers.get("set-cookie") ?? "";
    const cookieHeader = cookies.split(";")[0];

    // Fetch recent CDMs (Conjunction Data Messages) — last 7 days, Pc > 1e-5
    const cdmRes = await fetch(
      `${BASE}/basicspacedata/query/class/cdm_public/CREATION_DATE/%3Enow-7/PC/%3E0.00001/orderby/CREATION_DATE%20desc/limit/20/format/json`,
      {
        headers: { Cookie: cookieHeader },
        signal: AbortSignal.timeout(12000),
      }
    );

    if (!cdmRes.ok) throw new Error(`Space-Track CDM query failed: ${cdmRes.status}`);
    const cdms: any[] = await cdmRes.json();

    // Fetch active debris objects near LEO (altitude 200-2000 km)
    const debrisRes = await fetch(
      `${BASE}/basicspacedata/query/class/satcat/OBJECT_TYPE/DEBRIS/CURRENT/Y/DECAYED/N/PERIAPSIS/%3E200/APOAPSIS/%3C2000/orderby/APOAPSIS%20asc/limit/15/format/json`,
      {
        headers: { Cookie: cookieHeader },
        signal: AbortSignal.timeout(10000),
      }
    );

    const debris: any[] = debrisRes.ok ? await debrisRes.json() : [];

    const entities: LiveEntity[] = [];

    // Map CDMs to entities (place at approximate conjunction point)
    cdms.slice(0, 12).forEach((cdm, i) => {
      const pc = parseFloat(cdm.PC ?? "0");
      const missKm = parseFloat(cdm.MISS_DISTANCE ?? "999");
      const sev = pc > 0.01 ? "CRITICAL" : pc > 0.001 ? "HIGH" : pc > 0.0001 ? "MEDIUM" : "LOW";

      // Approximate TCA coordinates from TLE epoch — use deterministic lat/lon
      const seed = i + cdm.NORAD_CAT_ID_1?.charCodeAt(0 ) ?? 0;
      const lat = Math.sin(seed * 1.1) * 65;
      const lon = ((seed * 37) % 360) - 180;

      entities.push({
        id: `spacetrack-cdm-${cdm.CDM_ID ?? i}`,
        domain: "orbital",
        type: "SATELLITE_ISR",
        label: `CONJUNCTION: ${cdm.SAT_1_NAME ?? "SAT-A"} × ${cdm.SAT_2_NAME ?? "SAT-B"}`,
        lat,
        lon,
        altitude: parseFloat(cdm.ALTITUDE ?? "500") * 3280.84,
        severity: sev,
        source: "SPACE-TRACK-CDM",
        ts: cdm.TCA ?? new Date().toISOString(),
        confidence: 0.97,
        meta: {
          cdmId: cdm.CDM_ID,
          sat1Name: cdm.SAT_1_NAME,
          sat2Name: cdm.SAT_2_NAME,
          sat1NoradId: cdm.NORAD_CAT_ID_1,
          sat2NoradId: cdm.NORAD_CAT_ID_2,
          probabilityOfCollision: pc,
          missDistanceKm: missKm,
          tcaUtc: cdm.TCA,
          relativeVelocityKms: cdm.RELATIVE_VELOCITY,
          creationDate: cdm.CREATION_DATE,
          conjunctionType: "CDM",
        },
      });
    });

    // Map debris to entities
    debris.slice(0, 10).forEach((obj, i) => {
      const apogee = parseFloat(obj.APOAPSIS ?? "800");
      const seed = i * 7 + (obj.NORAD_CAT_ID?.charCodeAt(0) ?? 0);
      const lat = Math.sin(seed * 1.3) * 70;
      const lon = ((seed * 43) % 360) - 180;

      entities.push({
        id: `spacetrack-debris-${obj.NORAD_CAT_ID ?? i}`,
        domain: "orbital",
        type: "SATELLITE_ISR",
        label: `DEBRIS: ${obj.SATNAME?.trim() ?? "UNTRACKED"} [${obj.NORAD_CAT_ID}]`,
        lat,
        lon,
        altitude: apogee * 3280.84,
        severity: apogee < 400 ? "HIGH" : "MEDIUM",
        source: "SPACE-TRACK-SATCAT",
        ts: new Date().toISOString(),
        confidence: 0.99,
        meta: {
          noradId: obj.NORAD_CAT_ID,
          satName: obj.SATNAME,
          apogeeKm: apogee,
          perigeeKm: obj.PERIAPSIS,
          inclination: obj.INCLINATION,
          country: obj.COUNTRY,
          launchDate: obj.LAUNCH,
          rcsSize: obj.RCS_SIZE,
          objectType: "DEBRIS",
        },
      });
    });

    // Logout
    await fetch(`${BASE}/auth/logout`, { headers: { Cookie: cookieHeader }, signal: AbortSignal.timeout(5000) });

    console.log(`Space-Track: ${entities.length} objects (${cdms.length} CDMs, ${debris.length} debris)`);
    return { domain: "orbital", entities, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    console.error("Space-Track error:", err);
    return { domain: "orbital", entities: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Handle AIS token delivery (action-based routing via body)
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /**/ }
    }
    if (body.action === "get_ais_token") {
      return handleAISToken();
    }

    const url = new URL(req.url);
    const domain = url.searchParams.get("domain") ?? "all";

    let results: FeedResult[] = [];

    if (domain === "all") {
      // Fetch all feeds in parallel (Space-Track runs concurrently with others)
      results = await Promise.all([
        fetchSeismic(),
        fetchWeather(),
        fetchOrbital(),
        fetchWildfire(),
        fetchConflict(),
        fetchCyber(),
        fetchAviation(),
        fetchMaritime(),
        fetchSpaceTrack(),
      ]);
    } else {
      const fetchMap: Record<string, () => Promise<FeedResult>> = {
        seismic:     fetchSeismic,
        weather:     fetchWeather,
        orbital:     fetchOrbital,
        wildfire:    fetchWildfire,
        conflict:    fetchConflict,
        cyber:       fetchCyber,
        aviation:    fetchAviation,
        maritime:    fetchMaritime,
        spacetrack:  fetchSpaceTrack,
      };
      const fn = fetchMap[domain];
      if (!fn) {
        return new Response(JSON.stringify({ error: `Unknown domain: ${domain}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      results = [await fn()];
    }

    const totalEntities = results.reduce((sum, r) => sum + r.entities.length, 0);
    const errors = results.filter((r) => r.error).map((r) => ({ domain: r.domain, error: r.error }));

    console.log(`sentinel-feeds: ${totalEntities} live entities from ${results.length} feeds`);

    return new Response(
      JSON.stringify({
        feeds: results,
        summary: {
          totalEntities,
          feedCount: results.length,
          errors: errors.length > 0 ? errors : undefined,
          generatedAt: new Date().toISOString(),
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("sentinel-feeds error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
