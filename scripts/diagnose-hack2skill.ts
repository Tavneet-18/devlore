// Why does Hack2Skill only yield a handful of events?
// Replicates the adapter's filter chain and reports where each slug drops out.
import { USER_AGENT, politeFetch } from "../lib/ai/sources/http";

const BASE = "https://hack2skill.com";
const DAY = 86400000;
const LOOKBACK = 180;
const MAX_FETCHES = 40;

function parseBlocked(robots: string): Set<string> {
  const blocked = new Set<string>();
  let star = false;
  for (const raw of robots.split("\n")) {
    const line = raw.trim();
    if (/^user-agent\s*:/i.test(line)) { star = /\*\s*$/i.test(line); continue; }
    if (!star) continue;
    const m = line.match(/^disallow\s*:\s*\/event\/(\S+)/i);
    if (m) blocked.add(m[1].replace(/\/$/, "").toLowerCase());
  }
  return blocked;
}

async function main() {
  const robotsRes = await politeFetch(`${BASE}/robots.txt`, { accept: "text/plain" });
  const robots = robotsRes ? await robotsRes.text() : "";
  const blocked = parseBlocked(robots);
  console.log("robots.txt fetched   :", robotsRes ? "yes" : "NO");
  console.log("disallowed slugs    :", blocked.size);

  const smRes = await politeFetch(`${BASE}/sitemap.xml`, { accept: "application/xml" });
  const sitemap = smRes ? await smRes.text() : "";
  if (!smRes) { console.log("sitemap fetch FAILED"); return; }

  const allUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const eventUrls = allUrls.filter((u) => /\/event\//.test(u));
  console.log("sitemap total URLs  :", allUrls.length);
  console.log("  of which /event/ :", eventUrls.length);

  const entries = eventUrls
    .map((u) => ({ u, slug: (u.split("/event/")[1] ?? "").split("/")[0]?.toLowerCase() ?? "" }))
    .filter((e) => e.slug);

  const seen = new Set<string>();
  const uniq = entries.filter((e) => (seen.has(e.slug) ? false : (seen.add(e.slug), true)));

  const now = Date.now();
  const funnel: Record<string, number> = {
    "malformed slug": 0,
    "BLOCKED by robots": 0,
    "outside 180d lookback": 0,
    "checked (API call)": 0,
    "-> API non-200 / bad body": 0,
    "-> status != APPROVED": 0,
    "-> no usable deadline": 0,
    "-> deadline in the past": 0,
    "-> KEPT (open)": 0,
  };

  const cutoff = now - LOOKBACK * DAY;
  const kept: { slug: string; regEnd: string; mode: string }[] = [];

  for (const e of uniq) {
    if (!e.slug) { funnel["malformed slug"]++; continue; }
    if (blocked.has(e.slug)) { funnel["BLOCKED by robots"]++; continue; }

    const lastmod = (sitemap.match(new RegExp(`<loc>${e.u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>[\\s\\S]{0,200}?<lastmod>([^<]+)</lastmod>`)) ?? [])[1];
    const t = lastmod ? new Date(lastmod).getTime() : NaN;
    if (Number.isNaN(t) || t < cutoff) { funnel["outside 180d lookback"]++; continue; }

    funnel["checked (API call)"]++;
    const res = await fetch(`${BASE}/api/v1/event/${e.slug}/event-details`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) { funnel["-> API non-200 / bad body"]++; await new Promise((r) => setTimeout(r, 1000)); continue; }

    let d: Record<string, unknown>;
    try { d = ((await res.json()) as { data?: Record<string, unknown> }).data ?? {}; }
    catch { funnel["-> API non-200 / bad body"]++; await new Promise((r) => setTimeout(r, 1000)); continue; }

    if (d.status && d.status !== "APPROVED") { funnel["-> status != APPROVED"]++; await new Promise((r) => setTimeout(r, 1000)); continue; }

    const regEnd = (d.registrationEnd as string | null) ?? null;
    const subEnd = (d.submissionEnd as string | null) ?? null;
    const reference = regEnd ?? subEnd;
    if (!reference) { funnel["-> no usable deadline"]++; await new Promise((r) => setTimeout(r, 1000)); continue; }

    const rt = new Date(reference).getTime();
    if (Number.isNaN(rt) || rt < now - DAY) { funnel["-> deadline in the past"]++; await new Promise((r) => setTimeout(r, 1000)); continue; }

    const tags = (d.tags ?? {}) as { mode?: { value?: string } };
    kept.push({ slug: e.slug, regEnd: String(reference).slice(0, 10), mode: String(tags.mode?.value ?? "?") });
    funnel["-> KEPT (open)"]++;
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("\n=== FUNNEL ===");
  for (const [k, v] of Object.entries(funnel)) console.log(`  ${k.padEnd(30)} ${v}`);

  console.log("\n=== KEPT ===");
  for (const k of kept) console.log(`  ${k.slug.padEnd(34)} regEnd=${k.regEnd} mode=${k.mode}`);

  // How much is the 40-request cap costing us?
  console.log(`\n  NOTE: the adapter caps at ${MAX_FETCHES} API calls per run.`);
  console.log(`  slugs reaching the API in this run: ${funnel["checked (API call)"]}`);
}

void main();
