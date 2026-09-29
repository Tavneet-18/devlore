// Is 5 the true number of open Hack2Skill events, or is the lookback hiding some?
// Take the slugs the adapter EXCLUDED by lookback, newest-touched first, and
// check whether any of them actually has a future deadline.
import { USER_AGENT, politeFetch } from "../lib/ai/sources/http";

const BASE = "https://hack2skill.com";
const DAY = 86400000;
const SAMPLE = 10;

async function main() {
  const sm = await politeFetch(`${BASE}/sitemap.xml`, { accept: "application/xml" });
  const sitemap = sm ? await sm.text() : "";
  const now = Date.now();
  const cutoff = now - 180 * DAY;

  const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)]
    .map((m) => ({
      loc: m[1].match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "",
      lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? "",
    }))
    .filter((e) => /\/event\//.test(e.loc))
    .map((e) => ({ ...e, slug: (e.loc.split("/event/")[1] ?? "").split("/")[0]?.toLowerCase() ?? "" }))
    .filter((e) => e.slug);

  // lastmod year histogram
  const years: Record<string, number> = {};
  for (const e of entries) {
    const y = e.lastmod.slice(0, 4) || "?";
    years[y] = (years[y] ?? 0) + 1;
  }
  console.log("all event slugs by lastmod year:", JSON.stringify(years));

  const excluded = entries
    .filter((e) => {
      const t = new Date(e.lastmod).getTime();
      return Number.isNaN(t) || t < cutoff;
    })
    .sort((a, b) => b.lastmod.localeCompare(a.lastmod));

  console.log(`excluded by lookback: ${excluded.length}`);
  console.log(`checking the ${SAMPLE} most recently touched of those:\n`);

  let found = 0;
  for (const e of excluded.slice(0, SAMPLE)) {
    const res = await fetch(`${BASE}/api/v1/event/${e.slug}/event-details`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) { console.log(`  ${e.slug.padEnd(32)} HTTP ${res.status}`); await new Promise((r) => setTimeout(r, 1000)); continue; }
    let d: Record<string, unknown> = {};
    try { d = ((await res.json()) as { data?: Record<string, unknown> }).data ?? {}; } catch {}
    const regEnd = (d.registrationEnd as string | null) ?? null;
    const subEnd = (d.submissionEnd as string | null) ?? null;
    const ref = regEnd ?? subEnd;
    const future = ref ? new Date(ref).getTime() >= now - DAY : false;
    if (future) found++;
    console.log(
      `  ${e.lastmod}  ${e.slug.padEnd(30)} regEnd=${String(ref).slice(0, 10).padEnd(11)} ${future ? "*** FUTURE - MISSED ***" : "expired"}`
    );
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`\n  open events hidden by the 180d lookback: ${found}/${SAMPLE} sampled`);
}

void main();
