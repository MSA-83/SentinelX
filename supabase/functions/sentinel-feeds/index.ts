// supabase/functions/sentinel-feeds/index.ts
// Real-world data feed aggregator for SENTINEL-X
// Sources: USGS, OpenWeatherMap, N2YO, NewsAPI, NASA FIRMS, Shodan, AVWX, GFW,
//          OpenSky Network (live flights), GDELT (conflict events), CelesTrak (TLE/orbital),
//          Space-Track CDM, ACLED, EMSC (European seismic)

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

function aviationSeverity(callsign: string, squawk: string, alt: number): string {
  if (squawk === "7700" || squawk === "7600" || squawk === "7500") return "CRITICAL";
  if (squawk === "7777") return "HIGH"; // military intercept
  if (callsign?.match(/^(RCH|REACH|SPAR|SAM|AF1|VENUS|FORTE)/)) return "HIGH"; // US Mil/VIP
  if (callsign?.match(/^(RFF|RNZAF|RAF|USAF|NATO|AWACS)/)) return "HIGH";
  if (alt > 0 && alt < 1000) return "MEDIUM"; // Very low alt
  return "LOW";
}

// ─── USGS Earthquake Feed ──────────────────────────────────────────────────────

async function fetchSeismic(): Promise<FeedResult> {
  const t0 = Date.now();
  try {
    const url = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.0&orderby=time&limit=30";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
    const data = await res.json();

    const entities: LiveEntity[] = (data.features ?? []).map((f: any) => ({
      id: `usgs-${f.id}`,
      domain: "seismic",
      type: "EARTHQUAKE",
      label: `M${f.properties.mag.toFixed(1)} ${(f.properties.place ?? "Unknown").slice(0, 40)}`,
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
        mmi: f.properties.mmi,
        cdi: f.properties.cdi,
        tsunami: f.properties.tsunami === 1 ? "WATCH" : "NONE",
        status: f.properties.status,
      },
    }));

    console.log(`USGS: ${entities.length} earthquakes`);
    return { domain: "seismic", entities, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    console.error("USGS error:", err);
    return { domain: "seismic", entities: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

// ─── EMSC (European Mediterranean Seismological Centre) ──────────────────────

async function fetchEMSC(): Promise<FeedResult> {
  const t0 = Date.now();
  try {
    const url = "https://www.seismicportal.eu/fdsnws/event/1/query?limit=20&minmag=3.5&format=json&orderby=time";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`EMSC HTTP ${res.status}`);
    const data = await res.json();

    const entities: LiveEntity[] = (data.features ?? []).map((f: any) => ({
      id: `emsc-${f.id ?? f.properties?.unid}`,
      domain: "seismic",
      type: "EARTHQUAKE",
      label: `M${f.properties.mag?.toFixed(1)} ${(f.properties.flynn_region ?? f.properties.place ?? "Europe").slice(0, 40)}`,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      severity: earthquakeSeverity(f.properties.mag ?? 3.5),
      source: "EMSC-SEISMICPORTAL",
      ts: f.properties.time ?? new Date().toISOString(),
      confidence: 0.97,
      meta: {
        magnitude: f.properties.mag,
        magType: f.properties.magtype,
        depth: f.geometry.coordinates[2],
        region: f.properties.flynn_region,
        unid: f.properties.unid,
        author: f.properties.auth,
      },
    }));

    console.log(`EMSC: ${entities.length} seismic events`);
    return { domain: "seismic", entities, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    console.error("EMSC error:", err);
    return { domain: "seismic", entities: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

// ─── OpenSky Network — Live Flight Tracking (no key required) ─────────────────

async function fetchOpenSkyAviation(): Promise<FeedResult> {
  const t0 = Date.now();
  try {
    // Fetch all live flights — OpenSky free tier, no auth required
    // Filter for aircraft in key surveillance regions (military airspace areas)
    const regions = [
      // Eastern Europe / Ukraine / Black Sea
      { minLat: 44, maxLat: 55, minLon: 22, maxLon: 45, label: "EASTERN EUROPE" },
      // Middle East / Persian Gulf
      { minLat: 22, maxLat: 36, minLon: 38, maxLon: 62, label: "MIDDLE EAST" },
      // Taiwan Strait / South China Sea
      { minLat: 8,  maxLat: 30, minLon: 108, maxLon: 135, label: "INDO-PACIFIC" },
      // Korean Peninsula
      { minLat: 33, maxLat: 43, minLon: 122, maxLon: 132, label: "KOREAN PENINSULA" },
      // Baltic Sea / Northern Europe
      { minLat: 52, maxLat: 62, minLon: 10, maxLon: 30, label: "BALTIC" },
    ];

    const results = await Promise.allSettled(
      regions.map(async (r) => {
        const url = `https://opensky-network.org/api/states/all?lamin=${r.minLat}&lomin=${r.minLon}&lamax=${r.maxLat}&lomax=${r.maxLon}`;
        const res = await fetch(url, {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`OpenSky HTTP ${res.status}`);
        const data = await res.json();
        return { data, region: r.label };
      })
    );

    const entities: LiveEntity[] = [];
    const seenIcao = new Set<string>();

    results.forEach((r) => {
      if (r.status !== "fulfilled") return;
      const { data, region } = r.value;
      const states: any[] = data?.states ?? [];

      // Each state: [icao24, callsign, origin_country, time_position, last_contact,
      //              longitude, latitude, baro_altitude, on_ground, velocity,
      //              true_track, vertical_rate, sensors, geo_altitude, squawk,
      //              spi, position_source]
      for (const s of states.slice(0, 40)) {
        if (!s || s[5] == null || s[6] == null) continue;
        const icao = s[0] as string;
        if (seenIcao.has(icao)) continue;
        seenIcao.add(icao);

        const callsign = (s[1] as string ?? "").trim();
        const lon = s[5] as number;
        const lat = s[6] as number;
        const baroAlt = s[7] as number ?? 0; // meters
        const onGround = s[8] as boolean;
        const velocity = s[9] as number ?? 0; // m/s
        const track = s[10] as number ?? 0;
        const squawk = (s[14] as string ?? "").trim();
        const country = s[2] as string;

        if (onGround) continue; // skip ground vehicles
        if (!callsign) continue;

        const altFt = Math.round(baroAlt * 3.28084);
        const spdKts = Math.round(velocity * 1.944);
        const sev = aviationSeverity(callsign, squawk, altFt);

        // Classify: military if squawk 7777, known mil callsign prefix, or no callsign pattern
        const isMilitary = squawk === "7777" ||
          /^(RCH|REACH|SPAR|SAM|AF1|VENUS|FORTE|RFF|RNZAF|RAF|USAF|NATO|RRR|CNV|DUKE|HOMER|ROCKY|ZEUS|ATLAS|EAGLE|HAVOC|VIPER|GHOST)/i.test(callsign);

        entities.push({
          id: `opensky-${icao}`,
          domain: "aviation",
          type: isMilitary ? "AIRCRAFT_MILITARY" : "AIRCRAFT_COMMERCIAL",
          label: callsign || `ICAO-${icao.toUpperCase()}`,
          lat,
          lon,
          altitude: altFt,
          heading: track,
          speed: spdKts,
          severity: sev,
          source: `OPENSKY-${region}`,
          ts: new Date(Math.max((s[3] ?? 0) * 1000, Date.now() - 60000)).toISOString(),
          confidence: 0.93,
          meta: {
            icao24: icao,
            callsign,
            originCountry: country,
            squawk,
            baroAltM: baroAlt,
            velocityMs: velocity,
            verticalRateMs: s[11],
            positionSource: ["ADS-B","ASTERIX","MLAT","FLARM"][s[16] ?? 0],
            region,
            isMilitary,
            onGround,
          },
        });
      }
    });

    console.log(`OpenSky: ${entities.length} live aircraft`);
    return { domain: "aviation", entities, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    console.error("OpenSky error:", err);
    return { domain: "aviation", entities: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

// ─── OpenWeatherMap Severe Weather ────────────────────────────────────────────

async function fetchWeather(): Promise<FeedResult> {
  const t0 = Date.now();
  const apiKey = Deno.env.get("OPENWEATHERMAP_API_KEY");
  if (!apiKey) return { domain: "weather", entities: [], fetchedAt: new Date().toISOString(), latencyMs: 0, error: "No API key" };

  const locations = [
    { name: "Bay of Bengal",   lat: 15,  lon: 90   },
    { name: "Gulf of Mexico",  lat: 25,  lon: -90  },
    { name: "Philippine Sea",  lat: 18,  lon: 130  },
    { name: "Arabian Sea",     lat: 18,  lon: 65   },
    { name: "North Atlantic",  lat: 45,  lon: -40  },
    { name: "South China Sea", lat: 15,  lon: 115  },
    { name: "Caribbean",       lat: 15,  lon: -75  },
    { name: "Western Pacific", lat: 20,  lon: 150  },
    { name: "Black Sea",       lat: 43,  lon: 34   },
    { name: "Norwegian Sea",   lat: 67,  lon: 5    },
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
      if (sev === "LOW") return;

      const weatherId = d.weather?.[0]?.id ?? 800;
      let wtype = "STORM_HURRICANE";
      if (weatherId >= 200 && weatherId < 300) wtype = "STORM_HURRICANE";
      else if (weatherId >= 700 && weatherId < 800) wtype = "WILDFIRE";
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
        speed: Math.round(windKph / 1.852),
        meta: {
          windKph: windKph.toFixed(1),
          windGust: d.wind?.gust ? `${(d.wind.gust * 3.6).toFixed(1)} km/h` : null,
          temp: d.main?.temp,
          humidity: d.main?.humidity,
          pressure: d.main?.pressure,
          description: d.weather?.[0]?.description,
          cloudCover: d.clouds?.all,
          visibility: d.visibility,
          feelsLike: d.main?.feels_like,
          location: locations[i].name,
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
        altitude: Math.round(pos.sataltitude * 3280.84),
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

// ─── CelesTrak — Real TLE Orbital Data (no key required) ──────────────────────

async function fetchCelestrakOrbital(): Promise<FeedResult> {
  const t0 = Date.now();
  try {
    // Fetch active satellites, debris, and visual (brightest/watched) objects
    const catalogUrls = [
      { url: "https://celestrak.org/SOCRATES/query.php?DAYS=7&MAX=20&MAXPROB=0.001&IDENT=NAME&FORMAT=json&ACTION=Download", label: "CONJUNCTION", priority: "CRITICAL" },
    ];

    // Use the GP (General Perturbations) catalog — active satellites in JSON format
    const gpRes = await fetch(
      "https://celestrak.org/SOCRATES/query.php?DAYS=3&MAX=15&MAXPROB=0.001&IDENT=NAME&FORMAT=json&ACTION=Download",
      { signal: AbortSignal.timeout(10000) }
    );

    // Fall back to satcat approach
    const activeRes = await fetch(
      "https://celestrak.org/pub/TLE/catalog.txt",
      { signal: AbortSignal.timeout(10000) }
    );

    const entities: LiveEntity[] = [];

    if (activeRes.ok) {
      const text = await activeRes.text();
      const lines = text.trim().split("\n").filter(l => l.trim());

      // Parse TLE triplets — name / line1 / line2
      for (let i = 0; i + 2 < lines.length && entities.length < 25; i += 3) {
        const name = lines[i].trim();
        const line1 = lines[i + 1]?.trim() ?? "";
        const line2 = lines[i + 2]?.trim() ?? "";

        if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) continue;

        // Parse inclination, RAAN, mean motion from TLE line 2
        const inclDeg = parseFloat(line2.substring(8, 16).trim());
        const raan    = parseFloat(line2.substring(17, 25).trim());
        const meanMotion = parseFloat(line2.substring(52, 63).trim()); // rev/day

        // Approximate current position using RAAN as longitude proxy
        // (very rough approximation — real TLE propagation requires SGP4)
        const approxLon = ((raan - 180) + 360) % 360 - 180;
        // Latitude oscillates with inclination — use epoch fraction
        const epochFrac = parseFloat(line1.substring(18, 32).trim()) % 1;
        const approxLat = Math.sin(epochFrac * 2 * Math.PI) * Math.min(inclDeg, 85);

        // Period in minutes
        const periodMin = 1440 / meanMotion;
        // Altitude approximation from mean motion (Kepler's 3rd law)
        const semiMajorKm = Math.pow((8681663.653 / meanMotion) ** 2, 1/3);
        const altKm = semiMajorKm - 6371;

        const isDebris = name.includes("DEB") || name.includes("R/B") || name.includes("DEBRIS");
        const isMilitary = name.includes("USA ") || name.includes("NROL") || name.includes("LACROSSE") || name.includes("MISTY");
        const isGPS = name.includes("GPS");

        // Only include interesting objects: debris, military, or notable
        const isInteresting = isDebris || isMilitary || isGPS || altKm < 600 || meanMotion > 15;
        if (!isInteresting) continue;

        entities.push({
          id: `celestrak-${line1.substring(2, 7).trim()}`,
          domain: "orbital",
          type: isDebris ? "SATELLITE_DEBRIS" : isMilitary ? "SATELLITE_ISR" : "SATELLITE_GNSS",
          label: `${name.slice(0, 35)} [TLE]`,
          lat: Math.max(-85, Math.min(85, approxLat)),
          lon: approxLon,
          altitude: Math.round(altKm * 3280.84),
          severity: isDebris && altKm < 500 ? "HIGH" : isMilitary ? "HIGH" : "LOW",
          source: "CELESTRAK-CATALOG",
          ts: new Date().toISOString(),
          confidence: 0.88,
          meta: {
            noradId: line1.substring(2, 7).trim(),
            intlDesignator: line1.substring(9, 17).trim(),
            inclinationDeg: inclDeg,
            raanDeg: raan,
            meanMotionRevDay: meanMotion,
            periodMin: periodMin.toFixed(1),
            altKm: altKm.toFixed(0),
            isDebris,
            isMilitary,
            tle_line1: line1,
            tle_line2: line2,
          },
        });
      }
    }

    console.log(`CelesTrak: ${entities.length} orbital objects`);
    return { domain: "orbital", entities, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    console.error("CelesTrak error:", err);
    return { domain: "orbital", entities: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

// ─── NASA FIRMS Fire/Hotspot Feed ─────────────────────────────────────────────

async function fetchWildfire(): Promise<FeedResult> {
  const t0 = Date.now();
  const apiKey = Deno.env.get("NASA_FIRMS_API_KEY");
  if (!apiKey) return { domain: "conflict", entities: [], fetchedAt: new Date().toISOString(), latencyMs: 0, error: "No API key" };

  try {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_SNPP_NRT/-180,-90,180,90/1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`FIRMS HTTP ${res.status}`);
    const text = await res.text();

    const lines = text.trim().split("\n").slice(1);
    const entities: LiveEntity[] = [];

    const sampled = lines.slice(0, 80).filter((_, i) => i % 3 === 0).slice(0, 25);
    sampled.forEach((line, i) => {
      const cols = line.split(",");
      if (cols.length < 9) return;
      const lat = parseFloat(cols[0]);
      const lon = parseFloat(cols[1]);
      const brightness = parseFloat(cols[2] ?? "300");
      const frp = parseFloat(cols[12] ?? "0");

      if (isNaN(lat) || isNaN(lon)) return;

      const sev = frp > 200 ? "CRITICAL" : frp > 80 ? "HIGH" : frp > 20 ? "MEDIUM" : "LOW";

      entities.push({
        id: `firms-${i}-${Math.round(lat * 100)}-${Math.round(lon * 100)}`,
        domain: "conflict",
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
          acquisitionDate: cols[5],
          acquisitionTime: cols[6],
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

// ─── GDELT — Real-Time Conflict Event Feed (no key required) ──────────────────

async function fetchGDELT(): Promise<FeedResult> {
  const t0 = Date.now();
  try {
    // GDELT GKG (Global Knowledge Graph) last 15 minutes, conflict tone articles
    // Use the free GDELT 2.0 Events API — returns geolocated conflict events
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");

    // GDELT Events last update (15-min increments)
    const minuteBase = Math.floor(now.getMinutes() / 15) * 15;
    const hours = now.getHours().toString().padStart(2, "0");
    const mins  = minuteBase.toString().padStart(2, "0");
    const tsStr = `${dateStr}${hours}${mins}00`;

    const gdeltUrl = `https://api.gdeltproject.org/api/v2/geo/geo?query=conflict%20military%20attack%20war&mode=pointdata&startdatetime=${tsStr}&endtatetime=${tsStr}&maxrecords=25&format=json`;

    const res = await fetch(gdeltUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);
    const data = await res.json();

    const entities: LiveEntity[] = [];
    const features: any[] = data?.features ?? [];

    for (const f of features.slice(0, 20)) {
      const coords = f?.geometry?.coordinates;
      if (!coords || coords[0] == null || coords[1] == null) continue;
      const [lon, lat] = coords;
      const title = f.properties?.name ?? f.properties?.title ?? "CONFLICT EVENT";
      const tone  = f.properties?.tone ?? 0;
      const sev   = tone < -10 ? "CRITICAL" : tone < -5 ? "HIGH" : tone < -2 ? "MEDIUM" : "LOW";

      entities.push({
        id: `gdelt-${Math.abs(lat * 1000).toFixed(0)}-${Math.abs(lon * 1000).toFixed(0)}-${Date.now()}`,
        domain: "conflict",
        type: "CONFLICT_EVENT",
        label: title.slice(0, 55),
        lat,
        lon,
        severity: sev,
        source: "GDELT-GEOAPI",
        ts: new Date(f.properties?.date ?? Date.now()).toISOString(),
        confidence: 0.65,
        meta: {
          title,
          tone,
          sourceUrl: f.properties?.url,
          mentions: f.properties?.mentions,
          sources: f.properties?.sources,
        },
      });
    }

    // Fallback: Use GDELT last update file list and parse most recent conflict article geocodes
    if (entities.length === 0) {
      // Try alternative: GDELT Top Stories near conflict zones (always available)
      const topRes = await fetch(
        "https://api.gdeltproject.org/api/v2/summary/summary?d=web&t=summary&k=conflict+military+attack+war&o=date&n=15&f=json",
        { signal: AbortSignal.timeout(8000) }
      );
      if (topRes.ok) {
        const topData = await topRes.json();
        const conflictZones: Record<string, [number, number]> = {
          ukraine: [49.0, 32.0], russia: [55.75, 37.6], gaza: [31.35, 34.45],
          israel: [31.5, 34.75], taiwan: [23.5, 121.0], iran: [32.0, 53.0],
          myanmar: [17.0, 96.0], sudan: [15.5, 32.5], somalia: [5.0, 46.0],
          yemen: [15.5, 48.5], syria: [35.0, 38.5], iraq: [33.0, 44.5],
          congo: [-4.0, 20.0], ethiopia: [9.0, 40.0], mali: [17.0, -4.0],
        };
        const articles: any[] = topData?.articles ?? topData?.stories ?? [];
        for (const art of articles.slice(0, 12)) {
          const combined = `${art.title ?? ""} ${art.seendate ?? ""}`.toLowerCase();
          for (const [zone, coords] of Object.entries(conflictZones)) {
            if (combined.includes(zone)) {
              entities.push({
                id: `gdelt-fallback-${zone}-${Date.now() + Math.random()}`,
                domain: "conflict",
                type: "CONFLICT_EVENT",
                label: (art.title ?? "CONFLICT").slice(0, 55),
                lat: coords[0] + (Math.random() - 0.5) * 2,
                lon: coords[1] + (Math.random() - 0.5) * 2,
                severity: newsSeverity(art.title ?? ""),
                source: "GDELT-TOPSTORIES",
                ts: art.seendate ? new Date(art.seendate).toISOString() : new Date().toISOString(),
                confidence: 0.55,
                meta: { title: art.title, url: art.url, region: zone.toUpperCase() },
              });
              break;
            }
          }
        }
      }
    }

    console.log(`GDELT: ${entities.length} conflict events`);
    return { domain: "conflict", entities, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    console.error("GDELT error:", err);
    return { domain: "conflict", entities: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

// ─── NewsAPI Conflict Events ───────────────────────────────────────────────────

async function fetchConflict(): Promise<FeedResult> {
  const t0 = Date.now();
  const apiKey = Deno.env.get("NEWS_API_KEY");
  if (!apiKey) return { domain: "conflict", entities: [], fetchedAt: new Date().toISOString(), latencyMs: 0, error: "No API key" };

  const conflictZones: Record<string, [number, number]> = {
    ukraine: [49.0, 32.0], russia: [55.75, 37.6], gaza: [31.35, 34.45],
    israel: [31.5, 34.75], taiwan: [23.5, 121.0], china: [35.0, 105.0],
    iran: [32.0, 53.0], north: [40.0, 127.0], korea: [37.5, 127.0],
    myanmar: [17.0, 96.0], sudan: [15.5, 32.5], somalia: [5.0, 46.0],
    yemen: [15.5, 48.5], syria: [35.0, 38.5], iraq: [33.0, 44.5],
    afghanistan: [33.0, 65.0], pakistan: [30.0, 70.0], india: [22.0, 78.0],
    haiti: [19.0, -72.5], venezuela: [7.0, -66.0], congo: [-4.0, 20.0],
    ethiopia: [9.0, 40.0], mali: [17.0, -4.0], nigeria: [10.0, 8.0],
    libya: [27.0, 17.0], azerbaijan: [40.4, 49.9], armenia: [40.0, 45.0],
  };

  try {
    const q = encodeURIComponent("military attack conflict war airstrike troops drone");
    const url = `https://newsapi.org/v2/everything?q=${q}&language=en&sortBy=publishedAt&pageSize=25&apiKey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`NewsAPI HTTP ${res.status}`);
    const data = await res.json();

    const entities: LiveEntity[] = [];
    let placed = 0;

    for (const article of (data.articles ?? []).slice(0, 25)) {
      if (placed >= 15) break;
      const title = (article.title ?? "").toLowerCase();
      const desc = (article.description ?? "").toLowerCase();
      const combined = `${title} ${desc}`;

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

      const jLat = matched[0] + (Math.random() - 0.5) * 2;
      const jLon = matched[1] + (Math.random() - 0.5) * 2;
      const sev = newsSeverity(article.title ?? "");

      entities.push({
        id: `news-${btoa(encodeURIComponent(article.url ?? placed.toString())).slice(0, 12)}`,
        domain: "conflict",
        type: "CONFLICT_EVENT",
        label: (article.title ?? "CONFLICT EVENT").slice(0, 55),
        lat: jLat,
        lon: jLon,
        severity: sev,
        source: `NEWSAPI:${article.source?.name ?? "UNKNOWN"}`,
        ts: article.publishedAt ?? new Date().toISOString(),
        confidence: 0.6,
        meta: {
          headline: article.title,
          description: article.description,
          source: article.source?.name,
          url: article.url,
          region: matchedKey.toUpperCase(),
          publishedAt: article.publishedAt,
          urlToImage: article.urlToImage,
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
    const queries = [
      "product:Modbus",
      "port:102 S7",
      "DNP3",
      "product:\"BACnet\" port:47808",
      "\"SCADA\" has_vuln:true",
    ];

    const results = await Promise.allSettled(
      queries.slice(0, 4).map((q) =>
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
        const vulnCount = host.vulns ? Object.keys(host.vulns).length : 0;
        const finalSev = vulnCount > 3 ? "CRITICAL" : vulnCount > 0 ? "HIGH" : sev;

        entities.push({
          id: `shodan-${host.ip_str.replace(/\./g, "-")}`,
          domain: "cyber",
          type: "CYBER_ATTACK",
          label: `EXPOSED ICS — ${host.ip_str} [${(host.org ?? "UNKNOWN").slice(0, 20)}]`,
          lat: host.location.latitude,
          lon: host.location.longitude,
          severity: finalSev,
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
            vulnCount,
            queryType: queries[qi],
            lastSeen: host.last_update,
            asn: host.asn,
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

// ─── AVWX Aviation Weather ────────────────────────────────────────────────────

async function fetchAviation(): Promise<FeedResult> {
  const t0 = Date.now();
  const apiKey = Deno.env.get("AVWX_API_KEY");
  if (!apiKey) return { domain: "aviation", entities: [], fetchedAt: new Date().toISOString(), latencyMs: 0, error: "No API key" };

  const stations = ["URWW", "UKHH", "OKBK", "OIIE", "ZBAA", "RKSO", "VVNB", "DNMM", "LWSK", "UMMS"];

  try {
    const results = await Promise.allSettled(
      stations.slice(0, 6).map((icao) =>
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
      const isAdverse = windKts > 20 || vis < 3000;
      if (!isAdverse) return;

      const coordMap: Record<string, [number, number]> = {
        URWW: [48.7, 44.4], UKHH: [49.9, 36.3], OKBK: [29.2, 47.9],
        OIIE: [35.7, 51.3], ZBAA: [40.1, 116.6], RKSO: [37.4, 127.1],
        VVNB: [21.2, 105.8], DNMM: [6.6, 3.3], LWSK: [41.9, 21.6], UMMS: [53.9, 28.0],
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
          remarks: d.remarks,
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
      label: `FISHING VESSEL — ${(e.vessel?.name ?? e.vessel?.ssvid ?? "UNKNOWN").slice(0, 25)}`,
      lat: e.position?.lat ?? 0,
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
        rfmo: e.regions?.rfmo,
        startPort: e.vessel?.lastPortName,
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

// ─── Planet Labs tile token delivery ─────────────────────────────────────────

async function handlePlanetToken(): Promise<Response> {
  const apiKey = Deno.env.get("PLANET_API_KEY");
  const clientId = Deno.env.get("PLANET_CLIENT_ID");
  const clientSecret = Deno.env.get("PLANET_CLIENT_SECRET");

  if (clientId && clientSecret) {
    try {
      const tokenRes = await fetch("https://api.planet.com/v0/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
        signal: AbortSignal.timeout(8000),
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        const accessToken = tokenData?.access_token;
        if (accessToken) {
          return new Response(
            JSON.stringify({ token: accessToken, type: "bearer", source: "oauth" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    } catch (e) {
      console.warn("Planet OAuth failed:", e);
    }
  }

  if (apiKey) {
    return new Response(
      JSON.stringify({ token: apiKey, type: "apikey", source: "apikey" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ error: "Planet credentials not configured" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    const loginRes = await fetch(`${BASE}/ajaxauth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `identity=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
      signal: AbortSignal.timeout(10000),
    });

    if (!loginRes.ok) throw new Error(`Space-Track login failed: ${loginRes.status}`);

    const cookies = loginRes.headers.get("set-cookie") ?? "";
    const cookieHeader = cookies.split(";")[0];

    const cdmRes = await fetch(
      `${BASE}/basicspacedata/query/class/cdm_public/CREATION_DATE/%3Enow-7/PC/%3E0.00001/orderby/CREATION_DATE%20desc/limit/20/format/json`,
      { headers: { Cookie: cookieHeader }, signal: AbortSignal.timeout(12000) }
    );

    if (!cdmRes.ok) throw new Error(`Space-Track CDM query failed: ${cdmRes.status}`);
    const cdms: any[] = await cdmRes.json();

    const debrisRes = await fetch(
      `${BASE}/basicspacedata/query/class/satcat/OBJECT_TYPE/DEBRIS/CURRENT/Y/DECAYED/N/PERIAPSIS/%3E200/APOAPSIS/%3C2000/orderby/APOAPSIS%20asc/limit/15/format/json`,
      { headers: { Cookie: cookieHeader }, signal: AbortSignal.timeout(10000) }
    );

    const debris: any[] = debrisRes.ok ? await debrisRes.json() : [];
    const entities: LiveEntity[] = [];

    cdms.slice(0, 12).forEach((cdm, i) => {
      const pc = parseFloat(cdm.PC ?? "0");
      const missKm = parseFloat(cdm.MISS_DISTANCE ?? "999");
      const sev = pc > 0.01 ? "CRITICAL" : pc > 0.001 ? "HIGH" : pc > 0.0001 ? "MEDIUM" : "LOW";

      const seed = i + (cdm.NORAD_CAT_ID_1?.charCodeAt(0) ?? 0);
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

    await fetch(`${BASE}/auth/logout`, { headers: { Cookie: cookieHeader }, signal: AbortSignal.timeout(5000) });

    console.log(`Space-Track: ${entities.length} objects (${cdms.length} CDMs, ${debris.length} debris)`);
    return { domain: "orbital", entities, fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0 };
  } catch (err: unknown) {
    console.error("Space-Track error:", err);
    return { domain: "orbital", entities: [], fetchedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

// ─── PTZ Command relay ────────────────────────────────────────────────────────

async function handlePTZCommand(body: Record<string, unknown>): Promise<Response> {
  const { camera_id, ip_address, command, speed, preset_id } = body;
  console.log(`[PTZ] Camera ${camera_id} @ ${ip_address}: ${command} (speed=${speed}, preset=${preset_id})`);
  // ONVIF command relay would go here — for now acknowledge the command
  return new Response(
    JSON.stringify({ ok: true, camera_id, command, ts: new Date().toISOString() }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ─── CCTV Camera status polling ───────────────────────────────────────────────

async function handleCCTVStatus(body: Record<string, unknown>): Promise<Response> {
  const { camera_ids } = body as { camera_ids?: string[] };
  // Simulate real-time status checks — in production this would ping each camera's ONVIF endpoint
  const statuses: Record<string, { status: string; last_online: string; latencyMs: number }> = {};

  for (const id of (camera_ids ?? [])) {
    // Simulate: most cameras online, small random offline probability
    const isOnline = Math.random() > 0.1;
    statuses[id] = {
      status: isOnline ? "online" : "offline",
      last_online: isOnline ? new Date().toISOString() : new Date(Date.now() - Math.random() * 3600000).toISOString(),
      latencyMs: isOnline ? Math.round(Math.random() * 30 + 5) : 0,
    };
  }

  return new Response(
    JSON.stringify({ statuses, polledAt: new Date().toISOString() }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ─── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /**/ }
    }

    if (body.action === "get_ais_token")   return handleAISToken();
    if (body.action === "get_planet_token") return handlePlanetToken();
    if (body.action === "ptz_command")     return handlePTZCommand(body);
    if (body.action === "cctv_status")     return handleCCTVStatus(body);

    if (body.domain && typeof body.domain === "string") {
      const fetchMap: Record<string, () => Promise<FeedResult>> = {
        seismic:    fetchSeismic,
        emsc:       fetchEMSC,
        weather:    fetchWeather,
        orbital:    fetchOrbital,
        celestrak:  fetchCelestrakOrbital,
        wildfire:   fetchWildfire,
        conflict:   fetchConflict,
        gdelt:      fetchGDELT,
        cyber:      fetchCyber,
        aviation:   fetchOpenSkyAviation,
        avwx:       fetchAviation,
        maritime:   fetchMaritime,
        spacetrack: fetchSpaceTrack,
      };
      const fn = fetchMap[body.domain as string];
      if (fn) {
        const result = await fn();
        return new Response(
          JSON.stringify({ feeds: [result], summary: { totalEntities: result.entities.length, feedCount: 1, generatedAt: new Date().toISOString() } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const url = new URL(req.url);
    const domain = url.searchParams.get("domain") ?? "all";

    let results: FeedResult[] = [];

    if (domain === "all") {
      // Run all feeds in parallel — 12 total sources
      results = await Promise.all([
        fetchSeismic(),          // USGS earthquakes
        fetchEMSC(),             // European seismic (NEW)
        fetchWeather(),          // OpenWeatherMap
        fetchOrbital(),          // N2YO satellites
        fetchCelestrakOrbital(), // CelesTrak TLE catalog (NEW)
        fetchWildfire(),         // NASA FIRMS fires
        fetchConflict(),         // NewsAPI conflict
        fetchGDELT(),            // GDELT conflict events (NEW)
        fetchCyber(),            // Shodan ICS exposure
        fetchOpenSkyAviation(),  // OpenSky live flights (NEW)
        fetchAviation(),         // AVWX METARs
        fetchMaritime(),         // Global Fishing Watch
        fetchSpaceTrack(),       // Space-Track CDM
      ]);
    } else {
      const fetchMap: Record<string, () => Promise<FeedResult>> = {
        seismic:     fetchSeismic,
        emsc:        fetchEMSC,
        weather:     fetchWeather,
        orbital:     fetchOrbital,
        celestrak:   fetchCelestrakOrbital,
        wildfire:    fetchWildfire,
        conflict:    fetchConflict,
        gdelt:       fetchGDELT,
        cyber:       fetchCyber,
        aviation:    fetchOpenSkyAviation,
        avwx:        fetchAviation,
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
          sources: [
            "USGS-FDSNWS", "EMSC", "OpenWeatherMap", "N2YO", "CelesTrak",
            "NASA-FIRMS", "NewsAPI", "GDELT", "Shodan", "OpenSky", "AVWX",
            "GlobalFishingWatch", "SpaceTrack",
          ],
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
