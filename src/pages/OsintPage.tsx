// src/pages/OsintPage.tsx
// OSINT Investigation Toolkit — IP/DNS/WHOIS/BGP/CVE/MAC/Sanctions/Certs
// All lookups use free public APIs — no key required for most

import { useState, useCallback } from "react";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────────

type OsintTool =
  | "ip" | "dns" | "whois" | "bgp" | "mac"
  | "cve" | "certs" | "sanctions" | "phone" | "sweep";

interface IpResult {
  ip: string; city: string; region: string; country_name: string;
  org: string; asn?: string; latitude: number; longitude: number;
  timezone: string; is_datacenter?: boolean;
}

interface DnsRecord { type: string; name: string; value: string; ttl?: number; }

interface BgpResult {
  ip: string; prefix: string; name: string; description: string;
  country_code: string; asn: number; email: string;
}

interface CveResult {
  id: string; description: string; severity: string;
  cvssScore: number; published: string; references: string[];
}

interface CertResult {
  id: number; loggedAt: string; notBefore: string; notAfter: string;
  commonName: string; issuerName: string;
}

interface SanctionHit {
  entity: string; type: string; list: string; score: number; reason: string;
}

// ─── Embedded sanctions list (OFAC/EU key entities) ──────────────────────────

const SANCTIONS_LIST: { name: string; aliases: string[]; type: string; list: string; reason: string }[] = [
  { name: "VLADIMIR PUTIN", aliases: ["PUTIN", "VLADMIR PUTIN"], type: "Individual", list: "US-OFAC", reason: "Russian President — SDN list" },
  { name: "ROSNEFT", aliases: ["ROSNEFT OIL"], type: "Entity", list: "EU-SANCTIONS", reason: "State-owned Russian oil company" },
  { name: "GAZPROM", aliases: ["GAZPROM PJSC"], type: "Entity", list: "EU-SANCTIONS", reason: "State-owned Russian gas company" },
  { name: "SBERBANK", aliases: ["SBERBANK OF RUSSIA"], type: "Entity", list: "US-OFAC", reason: "Russian state bank" },
  { name: "VTB BANK", aliases: ["VTB"], type: "Entity", list: "US-OFAC", reason: "Russian state bank" },
  { name: "KIM JONG UN", aliases: ["KIM JONG-UN", "KIM JONG IL"], type: "Individual", list: "US-OFAC", reason: "DPRK leader — SDN list" },
  { name: "AYATOLLAH KHAMENEI", aliases: ["KHAMENEI", "ALI KHAMENEI"], type: "Individual", list: "US-OFAC", reason: "Supreme Leader of Iran" },
  { name: "MAHAN AIR", aliases: ["MAHAN AIRLINES"], type: "Entity", list: "US-OFAC", reason: "Iranian airline — sanctions evasion" },
  { name: "NATIONAL BANK OF IRAN", aliases: ["BANK MELLI"], type: "Entity", list: "US-OFAC", reason: "Iranian state bank" },
  { name: "LAZARUS GROUP", aliases: ["HIDDEN COBRA", "APT38"], type: "Entity", list: "US-OFAC", reason: "DPRK cyber threat actor" },
  { name: "WAGNER GROUP", aliases: ["PMC WAGNER", "WAGNER PMC"], type: "Entity", list: "EU-SANCTIONS", reason: "Russian mercenary force" },
  { name: "YEVGENY PRIGOZHIN", aliases: ["PRIGOZHIN"], type: "Individual", list: "US-OFAC", reason: "Wagner Group financier" },
  { name: "INTERNET RESEARCH AGENCY", aliases: ["IRA", "CONCORD MANAGEMENT"], type: "Entity", list: "US-OFAC", reason: "Russian disinfo operation" },
  { name: "HEZBOLLAH", aliases: ["HIZBALLAH", "HIZBOLLAH"], type: "Entity", list: "US-OFAC", reason: "Designated terrorist organization" },
  { name: "HAMAS", aliases: ["IZZ AD-DIN AL-QASSAM"], type: "Entity", list: "US-OFAC", reason: "Designated terrorist organization" },
  { name: "AL-QAEDA", aliases: ["AL QAEDA", "AL-QAEDA IN THE ARABIAN PENINSULA", "AQAP"], type: "Entity", list: "UN-SANCTIONS", reason: "International terrorist organization" },
  { name: "NORTH KOREA", aliases: ["DPRK", "DEMOCRATIC PEOPLE'S REPUBLIC OF KOREA"], type: "Country", list: "US-OFAC", reason: "Comprehensive sanctions program" },
  { name: "IRAN", aliases: ["ISLAMIC REPUBLIC OF IRAN"], type: "Country", list: "US-OFAC", reason: "Comprehensive sanctions program" },
  { name: "MYANMAR MILITARY", aliases: ["TATMADAW", "SAC"], type: "Entity", list: "US-OFAC", reason: "Myanmar coup leadership" },
  { name: "CENTRAL BANK OF RUSSIA", aliases: ["CBR", "BANK OF RUSSIA"], type: "Entity", list: "EU-SANCTIONS", reason: "Russian central bank — frozen assets" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#f59e0b",
  LOW: "#84cc16", INFO: "#10b981", NONE: "#475569",
};

function cvssToSeverity(score: number): string {
  if (score >= 9) return "CRITICAL";
  if (score >= 7) return "HIGH";
  if (score >= 4) return "MEDIUM";
  if (score > 0)  return "LOW";
  return "NONE";
}

function inputStyle(): React.CSSProperties {
  return {
    background: "#080e1a", border: "1px solid #1e3a5f",
    color: "#e2e8f0", fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11, borderRadius: 4, padding: "8px 12px",
    outline: "none", width: "100%",
  };
}

function labelStyle(): React.CSSProperties {
  return { fontFamily: "'Share Tech Mono', monospace", fontSize: 8, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase" as const };
}

// ─── TOOL: IP Lookup ──────────────────────────────────────────────────────────

function IpTool() {
  const [ip, setIp] = useState("");
  const [result, setResult] = useState<IpResult | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!ip.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`https://ipapi.co/${ip.trim()}/json/`);
      const data = await res.json();
      if (data.error) throw new Error(data.reason ?? "Lookup failed");
      setResult(data);
    } catch (e: any) {
      toast.error(`IP lookup: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={ip} onChange={e => setIp(e.target.value)} onKeyDown={e => e.key === "Enter" && lookup()}
          placeholder="IPv4 or IPv6 address (e.g. 8.8.8.8)" style={inputStyle()} />
        <LookupBtn onClick={lookup} loading={loading} />
      </div>
      {result && (
        <ResultCard title={`IP: ${result.ip}`} color="#00d4ff">
          {[
            ["Organization", result.org ?? "—"],
            ["ASN", result.asn ?? "—"],
            ["Country", result.country_name ?? "—"],
            ["Region / City", `${result.region ?? "—"} / ${result.city ?? "—"}`],
            ["Coordinates", `${result.latitude?.toFixed(4)}°, ${result.longitude?.toFixed(4)}°`],
            ["Timezone", result.timezone ?? "—"],
          ].map(([k, v]) => <MetaRow key={k as string} label={k as string} value={v as string} />)}
        </ResultCard>
      )}
    </div>
  );
}

// ─── TOOL: DNS Lookup ─────────────────────────────────────────────────────────

const DNS_TYPES = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA", "PTR"];

function DnsTool() {
  const [domain, setDomain] = useState("");
  const [dnsType, setDnsType] = useState("A");
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!domain.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain.trim())}&type=${dnsType}`);
      const data = await res.json();
      if (data.Status !== 0) throw new Error(`DNS error: RCODE ${data.Status}`);
      const parsed: DnsRecord[] = (data.Answer ?? data.Authority ?? []).map((r: any) => ({
        type: dnsType, name: r.name, value: r.data, ttl: r.TTL,
      }));
      setRecords(parsed);
      if (parsed.length === 0) toast.info("No records found");
    } catch (e: any) {
      toast.error(`DNS: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={domain} onChange={e => setDomain(e.target.value)} onKeyDown={e => e.key === "Enter" && lookup()}
          placeholder="domain.com" style={inputStyle()} />
        <select value={dnsType} onChange={e => setDnsType(e.target.value)}
          style={{ ...inputStyle(), width: 90, flexShrink: 0 }}>
          {DNS_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <LookupBtn onClick={lookup} loading={loading} />
      </div>
      {records.length > 0 && (
        <ResultCard title={`${records.length} ${dnsType} records — ${domain}`} color="#a855f7">
          <div className="space-y-1.5">
            {records.map((r, i) => (
              <div key={i} className="flex items-start gap-3 px-2 py-1.5 rounded"
                style={{ background: "#080e1a", border: "1px solid #1e3a5f" }}>
                <span className="font-mono text-[8px] font-bold px-1 rounded flex-shrink-0"
                  style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)" }}>
                  {r.type}
                </span>
                <span className="font-mono text-[9px] text-sx-text flex-1 break-all">{r.value}</span>
                {r.ttl && <span className="font-mono text-[8px] text-sx-text-muted flex-shrink-0">TTL:{r.ttl}s</span>}
              </div>
            ))}
          </div>
        </ResultCard>
      )}
    </div>
  );
}

// ─── TOOL: BGP / ASN Lookup ───────────────────────────────────────────────────

function BgpTool() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const isASN = /^(AS)?\d+$/i.test(query.trim());
      const url = isASN
        ? `https://api.bgpview.io/asn/${query.replace(/AS/i, "").trim()}`
        : `https://api.bgpview.io/ip/${query.trim()}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== "ok") throw new Error("BGP lookup failed");
      setResult(data.data);
    } catch (e: any) {
      toast.error(`BGP: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && lookup()}
          placeholder="IP address or ASN (e.g. AS15169 or 8.8.8.8)" style={inputStyle()} />
        <LookupBtn onClick={lookup} loading={loading} />
      </div>
      {result && (
        <ResultCard title="BGP / ASN DATA" color="#22d3ee">
          {result.asn && (
            <>
              <MetaRow label="ASN" value={`AS${result.asn}`} />
              <MetaRow label="Name" value={result.name ?? "—"} />
              <MetaRow label="Description" value={result.description_short ?? result.description ?? "—"} />
              <MetaRow label="Country" value={result.country_code ?? "—"} />
              <MetaRow label="Email" value={result.email_contacts?.join(", ") ?? "—"} />
              <MetaRow label="Prefixes (IPv4)" value={String(result.prefixes?.length ?? "—")} />
            </>
          )}
          {result.prefixes && result.prefixes.slice(0, 5).map((p: any, i: number) => (
            <div key={i} className="mt-1 px-2 py-1 rounded font-mono text-[9px]"
              style={{ background: "#080e1a", border: "1px solid #1e3a5f", color: "#22d3ee" }}>
              {p.prefix} — AS{p.asn?.asn} {p.asn?.name?.slice(0, 30)}
            </div>
          ))}
          {result.rir_allocation && (
            <MetaRow label="RIR" value={`${result.rir_allocation.rir_name} (${result.rir_allocation.allocation_status})`} />
          )}
        </ResultCard>
      )}
    </div>
  );
}

// ─── TOOL: MAC Vendor Lookup ──────────────────────────────────────────────────

function MacTool() {
  const [mac, setMac] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!mac.trim()) return;
    setLoading(true);
    try {
      const clean = mac.trim().replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
      const res = await fetch(`https://api.macvendors.com/${clean}`, {
        headers: { "Accept": "application/json" },
      });
      if (res.status === 404) { setResult("NOT FOUND — Unknown or private OUI"); setLoading(false); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setResult(text.trim());
    } catch (e: any) {
      toast.error(`MAC: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={mac} onChange={e => setMac(e.target.value)} onKeyDown={e => e.key === "Enter" && lookup()}
          placeholder="MAC address (e.g. 00:1A:2B:3C:4D:5E)" style={inputStyle()} />
        <LookupBtn onClick={lookup} loading={loading} />
      </div>
      {result && (
        <ResultCard title="MAC VENDOR LOOKUP" color="#10b981">
          <MetaRow label="Vendor / Organization" value={result} />
          <MetaRow label="OUI (first 6 hex)" value={mac.trim().replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase()} />
          <div className="mt-2 font-mono text-[8px] text-sx-text-muted">
            OUI registered with IEEE — cross-reference with network device inventory
          </div>
        </ResultCard>
      )}
    </div>
  );
}

// ─── TOOL: CVE Lookup ─────────────────────────────────────────────────────────

function CveTool() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CveResult[]>([]);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const isCveId = /^CVE-\d{4}-\d+$/i.test(query.trim());
      const url = isCveId
        ? `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${query.trim().toUpperCase()}`
        : `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(query.trim())}&resultsPerPage=10`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`NVD HTTP ${res.status}`);
      const data = await res.json();
      const parsed: CveResult[] = (data.vulnerabilities ?? []).map((v: any) => {
        const cve = v.cve;
        const desc = cve.descriptions?.find((d: any) => d.lang === "en")?.value ?? "No description";
        const metrics = cve.metrics?.cvssMetricV31?.[0] ?? cve.metrics?.cvssMetricV30?.[0] ?? cve.metrics?.cvssMetricV2?.[0];
        const score = metrics?.cvssData?.baseScore ?? 0;
        return {
          id: cve.id,
          description: desc,
          severity: cvssToSeverity(score),
          cvssScore: score,
          published: cve.published?.slice(0, 10) ?? "—",
          references: (cve.references ?? []).slice(0, 3).map((r: any) => r.url),
        };
      });
      setResults(parsed);
      if (parsed.length === 0) toast.info("No CVEs found");
    } catch (e: any) {
      toast.error(`CVE: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && lookup()}
          placeholder="CVE-2024-XXXX or keyword (e.g. Apache Log4j)" style={inputStyle()} />
        <LookupBtn onClick={lookup} loading={loading} />
      </div>
      {results.map(cve => (
        <ResultCard key={cve.id} title={cve.id} color={SEVERITY_COLOR[cve.severity]}>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-[9px] font-bold px-2 py-0.5 rounded"
              style={{ background: `${SEVERITY_COLOR[cve.severity]}15`, color: SEVERITY_COLOR[cve.severity], border: `1px solid ${SEVERITY_COLOR[cve.severity]}30` }}>
              {cve.severity}
            </span>
            <span className="font-mono text-[9px]" style={{ color: SEVERITY_COLOR[cve.severity] }}>
              CVSS: {cve.cvssScore.toFixed(1)}
            </span>
            <span className="font-mono text-[8px] text-sx-text-muted ml-auto">Published: {cve.published}</span>
          </div>
          <p className="font-mono text-[9px] text-sx-text leading-relaxed mb-2">{cve.description.slice(0, 280)}</p>
          {cve.references.length > 0 && (
            <div className="space-y-0.5">
              {cve.references.map((r, i) => (
                <a key={i} href={r} target="_blank" rel="noopener noreferrer"
                  className="block font-mono text-[8px] truncate"
                  style={{ color: "#00d4ff" }}>{r}</a>
              ))}
            </div>
          )}
        </ResultCard>
      ))}
    </div>
  );
}

// ─── TOOL: Certificate Transparency ──────────────────────────────────────────

function CertsTool() {
  const [domain, setDomain] = useState("");
  const [certs, setCerts] = useState<CertResult[]>([]);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!domain.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`https://crt.sh/?q=%.${domain.trim()}&output=json`);
      if (!res.ok) throw new Error(`crt.sh HTTP ${res.status}`);
      const data: any[] = await res.json();
      const unique = new Map<string, CertResult>();
      for (const c of data.slice(0, 50)) {
        if (!unique.has(c.common_name)) {
          unique.set(c.common_name, {
            id: c.id,
            loggedAt: c.entry_timestamp?.slice(0, 10) ?? "—",
            notBefore: c.not_before?.slice(0, 10) ?? "—",
            notAfter: c.not_after?.slice(0, 10) ?? "—",
            commonName: c.common_name ?? "—",
            issuerName: c.issuer_name ?? "—",
          });
        }
      }
      const list = Array.from(unique.values()).slice(0, 20);
      setCerts(list);
      if (list.length === 0) toast.info("No certificates found");
    } catch (e: any) {
      toast.error(`crt.sh: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={domain} onChange={e => setDomain(e.target.value)} onKeyDown={e => e.key === "Enter" && lookup()}
          placeholder="domain.com (searches subdomains via CT logs)" style={inputStyle()} />
        <LookupBtn onClick={lookup} loading={loading} />
      </div>
      {certs.length > 0 && (
        <ResultCard title={`${certs.length} certificates — ${domain}`} color="#f59e0b">
          <div className="space-y-1.5">
            {certs.map((c) => (
              <div key={c.id} className="px-2 py-1.5 rounded"
                style={{ background: "#080e1a", border: "1px solid #1e3a5f" }}>
                <div className="font-mono text-[9px] font-bold text-sx-cyan">{c.commonName}</div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="font-mono text-[7px] text-sx-text-muted">Logged: {c.loggedAt}</span>
                  <span className="font-mono text-[7px] text-sx-text-muted">Expires: {c.notAfter}</span>
                </div>
                <div className="font-mono text-[7px] text-sx-text-muted truncate">{c.issuerName.slice(0, 60)}</div>
              </div>
            ))}
          </div>
        </ResultCard>
      )}
    </div>
  );
}

// ─── TOOL: Sanctions Check ────────────────────────────────────────────────────

function SanctionsTool() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SanctionHit[]>([]);
  const [searched, setSearched] = useState(false);

  const check = () => {
    if (!query.trim()) return;
    const q = query.trim().toUpperCase();
    const results: SanctionHit[] = [];
    for (const entry of SANCTIONS_LIST) {
      const names = [entry.name, ...entry.aliases].map(n => n.toUpperCase());
      let score = 0;
      for (const name of names) {
        if (name === q) { score = 100; break; }
        if (name.includes(q) || q.includes(name)) score = Math.max(score, 85);
        const words = q.split(/\s+/);
        const matchedWords = words.filter(w => name.includes(w) && w.length > 3);
        if (matchedWords.length > 0) score = Math.max(score, Math.round((matchedWords.length / words.length) * 75));
      }
      if (score >= 40) {
        results.push({ entity: entry.name, type: entry.type, list: entry.list, score, reason: entry.reason });
      }
    }
    results.sort((a, b) => b.score - a.score);
    setHits(results);
    setSearched(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && check()}
          placeholder="Name, organization, or country to check" style={inputStyle()} />
        <LookupBtn onClick={check} loading={false} label="CHECK" />
      </div>
      {searched && (
        hits.length === 0 ? (
          <ResultCard title="NO SANCTIONS MATCHES" color="#10b981">
            <div className="font-mono text-[9px] text-sx-text">
              <span className="text-sx-green">✓ CLEAR</span> — No matches found in US-OFAC, EU, or UN sanctions lists for "{query}"
            </div>
          </ResultCard>
        ) : (
          <div className="space-y-2">
            {hits.map((h, i) => (
              <ResultCard key={i} title={`⚠ SANCTIONS MATCH: ${h.entity}`} color="#ef4444">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-[8px] font-bold px-2 py-0.5 rounded"
                    style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>
                    {h.list}
                  </span>
                  <span className="font-mono text-[8px]" style={{ color: "#f59e0b" }}>{h.type}</span>
                  <span className="font-mono text-[8px] ml-auto" style={{ color: h.score >= 90 ? "#ef4444" : "#f59e0b" }}>
                    MATCH: {h.score}%
                  </span>
                </div>
                <MetaRow label="Reason" value={h.reason} />
              </ResultCard>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── TOOL: Sweep (passive recon) ─────────────────────────────────────────────

function SweepTool() {
  const [target, setTarget] = useState("");
  const [sweeping, setSweeping] = useState(false);
  const [results, setResults] = useState<{ label: string; value: string; status: "ok" | "warn" | "err" | "info" }[]>([]);
  const [progress, setProgress] = useState(0);

  const sweep = useCallback(async () => {
    if (!target.trim()) return;
    setSweeping(true);
    setResults([]);
    setProgress(0);

    const out: typeof results = [];

    const addResult = (label: string, value: string, status: "ok" | "warn" | "err" | "info") => {
      out.push({ label, value, status });
      setResults([...out]);
    };

    // 1. IP Geolocation
    setProgress(10);
    try {
      const r = await fetch(`https://ipapi.co/${target.trim()}/json/`);
      const d = await r.json();
      if (d.ip) {
        addResult("IP Geolocation", `${d.city}, ${d.region}, ${d.country_name}`, "ok");
        addResult("ASN / Org", d.org ?? "—", "info");
        if (d.is_datacenter) addResult("Datacenter", "YES — Possible hosting/VPN/proxy", "warn");
      }
    } catch { addResult("IP Geolocation", "FAILED", "err"); }
    setProgress(30);

    // 2. DNS A records
    try {
      const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(target.trim())}&type=A`);
      const d = await r.json();
      const aRecs = (d.Answer ?? []).map((a: any) => a.data).join(", ");
      if (aRecs) addResult("DNS A Records", aRecs, "ok");
      else addResult("DNS A Records", "NONE (not a resolvable domain)", "warn");
    } catch { /* ignore */ }
    setProgress(50);

    // 3. MX records
    try {
      const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(target.trim())}&type=MX`);
      const d = await r.json();
      const mx = (d.Answer ?? []).map((a: any) => a.data).join(", ");
      if (mx) addResult("MX (Mail Servers)", mx.slice(0, 80), "ok");
    } catch { /* ignore */ }
    setProgress(65);

    // 4. BGP info
    try {
      const r = await fetch(`https://api.bgpview.io/ip/${target.trim()}`);
      const d = await r.json();
      if (d.status === "ok" && d.data?.prefixes?.length) {
        const p = d.data.prefixes[0];
        addResult("BGP Prefix", `${p.prefix} (AS${p.asn?.asn} — ${p.asn?.name})`, "ok");
      }
    } catch { /* ignore */ }
    setProgress(80);

    // 5. Cert transparency
    try {
      const r = await fetch(`https://crt.sh/?q=%.${target.trim()}&output=json`);
      if (r.ok) {
        const d = await r.json();
        const subdomains = new Set<string>(d.slice(0, 100).map((c: any) => c.common_name).filter((n: string) => n.endsWith(target.trim())));
        if (subdomains.size > 0) addResult("Subdomains (CT)", `${subdomains.size} found: ${Array.from(subdomains).slice(0, 4).join(", ")}`, "warn");
      }
    } catch { /* ignore */ }
    setProgress(100);

    setSweeping(false);
  }, [target]);

  const statusColor = { ok: "#10b981", warn: "#f59e0b", err: "#ef4444", info: "#00d4ff" };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={target} onChange={e => setTarget(e.target.value)} onKeyDown={e => e.key === "Enter" && sweep()}
          placeholder="IP or domain (passive OSINT sweep)" style={inputStyle()} />
        <LookupBtn onClick={sweep} loading={sweeping} label="SWEEP" />
      </div>
      {sweeping && (
        <div className="space-y-1">
          <div className="h-1 rounded-full" style={{ background: "#1e3a5f" }}>
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%`, background: "linear-gradient(90deg,#00d4ff,#a855f7)" }} />
          </div>
          <div className="font-mono text-[8px] text-sx-text-muted">SWEEP IN PROGRESS ({progress}%)</div>
        </div>
      )}
      {results.length > 0 && (
        <ResultCard title={`PASSIVE RECON — ${target}`} color="#00d4ff">
          <div className="space-y-1.5">
            {results.map((r, i) => (
              <div key={i} className="flex items-start gap-3 px-2 py-1.5 rounded"
                style={{ background: "#080e1a", border: `1px solid ${statusColor[r.status]}20` }}>
                <span className="font-mono text-[8px] font-bold flex-shrink-0 mt-0.5"
                  style={{ color: statusColor[r.status] }}>
                  {r.status === "ok" ? "✓" : r.status === "warn" ? "⚠" : r.status === "err" ? "✗" : "ℹ"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[8px] text-sx-text-muted">{r.label}</div>
                  <div className="font-mono text-[9px] text-sx-text break-all">{r.value}</div>
                </div>
              </div>
            ))}
          </div>
        </ResultCard>
      )}
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function LookupBtn({ onClick, loading, label = "LOOKUP" }: { onClick: () => void; loading: boolean; label?: string }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="font-mono text-[9px] font-bold px-4 py-2 rounded transition-all flex-shrink-0"
      style={{
        background: loading ? "rgba(0,212,255,0.05)" : "rgba(0,212,255,0.12)",
        border: "1px solid rgba(0,212,255,0.3)",
        color: loading ? "#334155" : "#00d4ff",
        cursor: loading ? "not-allowed" : "pointer",
        letterSpacing: "0.1em",
        minWidth: 72,
      }}>
      {loading ? "⟳" : label}
    </button>
  );
}

function ResultCard({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded border p-3 space-y-2"
      style={{ background: "#0d1424", borderColor: `${color}30`, borderLeft: `3px solid ${color}` }}>
      <div className="font-mono text-[9px] font-bold tracking-widest" style={{ color }}>{title}</div>
      {children}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <span className="font-mono text-[8px] text-sx-text-muted flex-shrink-0">{label}</span>
      <span className="font-mono text-[9px] text-sx-text text-right break-all">{value}</span>
    </div>
  );
}

// ─── Tool config ──────────────────────────────────────────────────────────────

const TOOLS: { id: OsintTool; label: string; icon: string; desc: string; component: React.FC }[] = [
  { id: "sweep",     label: "PASSIVE SWEEP",       icon: "⊕", desc: "IP geolocation + DNS + BGP + CT logs in one shot", component: SweepTool },
  { id: "ip",        label: "IP LOOKUP",            icon: "◉", desc: "Geolocation, ASN, org, timezone",                  component: IpTool },
  { id: "dns",       label: "DNS RECORDS",          icon: "⊞", desc: "A/AAAA/MX/NS/TXT/CNAME via Google DNS",           component: DnsTool },
  { id: "bgp",       label: "BGP / ASN",            icon: "◈", desc: "Prefix routing, ASN details, peering",            component: BgpTool },
  { id: "mac",       label: "MAC VENDOR",           icon: "⊟", desc: "OUI → manufacturer via IEEE registry",            component: MacTool },
  { id: "cve",       label: "CVE SEARCH",           icon: "⚠", desc: "NVD vulnerability database search",               component: CveTool },
  { id: "certs",     label: "CERT TRANSPARENCY",    icon: "🔒", desc: "Subdomain discovery via CT logs (crt.sh)",        component: CertsTool },
  { id: "sanctions", label: "SANCTIONS CHECK",      icon: "⛔", desc: "US-OFAC / EU / UN sanctions list screening",      component: SanctionsTool },
];

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function OsintPage() {
  const [activeTool, setActiveTool] = useState<OsintTool>("sweep");
  const ActiveComp = TOOLS.find(t => t.id === activeTool)?.component ?? SweepTool;
  const activeMeta = TOOLS.find(t => t.id === activeTool);

  return (
    <div className="flex h-full bg-sx-bg overflow-hidden">

      {/* Left sidebar — tool selection */}
      <div className="w-52 flex-shrink-0 flex flex-col border-r border-sx-border overflow-hidden"
        style={{ background: "#0a0f1e" }}>
        <div className="flex-shrink-0 px-4 py-3 border-b border-sx-border"
          style={{ background: "#0d1424" }}>
          <div className="font-display font-bold text-sx-cyan text-xs tracking-widest">OSINT TOOLKIT</div>
          <div className="font-mono text-[8px] text-sx-text-muted mt-0.5">PASSIVE INTELLIGENCE GATHERING</div>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {TOOLS.map(tool => (
            <button key={tool.id} onClick={() => setActiveTool(tool.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 mx-1 rounded transition-all text-left"
              style={{
                background: activeTool === tool.id ? "rgba(0,212,255,0.1)" : "transparent",
                border: activeTool === tool.id ? "1px solid rgba(0,212,255,0.2)" : "1px solid transparent",
                color: activeTool === tool.id ? "#00d4ff" : "#475569",
                width: "calc(100% - 8px)",
              }}>
              <span className="text-base flex-shrink-0">{tool.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[9px] font-bold uppercase tracking-wider truncate"
                  style={{ color: activeTool === tool.id ? "#00d4ff" : "#94a3b8" }}>
                  {tool.label}
                </div>
                <div className="font-mono text-[7px] text-sx-text-muted truncate mt-0.5">{tool.desc.slice(0, 30)}</div>
              </div>
            </button>
          ))}
        </nav>

        {/* OPSEC notice */}
        <div className="flex-shrink-0 p-3 border-t border-sx-border"
          style={{ background: "rgba(16,185,129,0.04)" }}>
          <div className="font-mono text-[7px] leading-relaxed"
            style={{ color: "rgba(16,185,129,0.6)" }}>
            <span style={{ color: "#10b981" }}>🔒 OPSEC:</span> All queries use
            free public APIs. No authentication required. Queries may be logged by providers.
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Tool header */}
        <div className="flex-shrink-0 border-b border-sx-border px-6 py-3 flex items-center justify-between"
          style={{ background: "#0d1424" }}>
          <div>
            <div className="font-display font-bold text-sx-cyan tracking-widest flex items-center gap-2">
              <span>{activeMeta?.icon}</span>
              <span>{activeMeta?.label}</span>
            </div>
            <div className="font-mono text-[9px] text-sx-text-muted mt-0.5">{activeMeta?.desc}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="font-mono text-[8px] px-2 py-1 rounded"
              style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.12)", color: "rgba(0,212,255,0.5)" }}>
              PASSIVE // NO KEY REQUIRED
            </div>
            <div className="font-mono text-[8px] px-2 py-1 rounded"
              style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", color: "rgba(239,68,68,0.6)" }}>
              TS // SENTINEL // NOFORN
            </div>
          </div>
        </div>

        {/* Tool workspace */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <ActiveComp />
          </div>
        </div>
      </div>

      {/* Right panel — quick reference */}
      <div className="w-56 flex-shrink-0 flex flex-col border-l border-sx-border overflow-hidden"
        style={{ background: "#0a0f1e" }}>
        <div className="flex-shrink-0 px-3 py-2.5 border-b border-sx-border"
          style={{ background: "#0d1424" }}>
          <div className="font-mono text-[8px] text-sx-text-muted tracking-widest">QUICK REFERENCE</div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* All tools quick access */}
          <div>
            <div style={labelStyle()} className="mb-1.5">ALL TOOLS</div>
            {TOOLS.map(t => (
              <button key={t.id} onClick={() => setActiveTool(t.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded transition-all mb-0.5"
                style={{
                  background: activeTool === t.id ? "rgba(0,212,255,0.07)" : "transparent",
                  border: "1px solid transparent",
                  color: activeTool === t.id ? "#00d4ff" : "#334155",
                }}>
                <span style={{ fontSize: 12 }}>{t.icon}</span>
                <span className="font-mono text-[8px] uppercase">{t.label}</span>
              </button>
            ))}
          </div>

          <div style={{ borderTop: "1px solid #1e3a5f", paddingTop: 8 }}>
            <div style={labelStyle()} className="mb-1.5">USEFUL IPs (TEST)</div>
            {[
              ["8.8.8.8", "Google DNS"],
              ["1.1.1.1", "Cloudflare"],
              ["91.108.4.1", "Telegram MTProto"],
              ["45.153.160.1", "Tor Exit Node"],
            ].map(([ip, label]) => (
              <button key={ip} onClick={() => { setActiveTool("ip"); }}
                className="w-full text-left px-2 py-1 rounded mb-0.5 transition-all"
                style={{ background: "#080e1a", border: "1px solid #1e3a5f" }}>
                <div className="font-mono text-[8px]" style={{ color: "#00d4ff" }}>{ip}</div>
                <div className="font-mono text-[7px] text-sx-text-muted">{label}</div>
              </button>
            ))}
          </div>

          <div style={{ borderTop: "1px solid #1e3a5f", paddingTop: 8 }}>
            <div style={labelStyle()} className="mb-1.5">DATA SOURCES</div>
            {[
              ["ipapi.co", "IP geolocation"],
              ["dns.google", "DNS over HTTPS"],
              ["api.bgpview.io", "BGP routing"],
              ["api.macvendors.com", "MAC OUI"],
              ["nvd.nist.gov", "CVE database"],
              ["crt.sh", "CT logs"],
              ["OFAC/EU/UN", "Sanctions lists"],
            ].map(([src, desc]) => (
              <div key={src as string} className="py-0.5">
                <div className="font-mono text-[8px]" style={{ color: "#475569" }}>{src}</div>
                <div className="font-mono text-[7px] text-sx-text-muted">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
