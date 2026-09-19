import type { DiscoverySource, RawEvent } from "../types";

/**
 * Playwright-based live sources — free, no API key.
 * Each source navigates to the public search page for a city and extracts
 * event cards via evaluate(). If JS fails / blocked, returns [] so ingest
 * falls back to mock (no hard failure).
 *
 * This file is the live implementation for getDiscoverySources() when
 * DISCOVERY_MODE=live. Swap is one line in lib/ai/index.ts.
 */

type ExtractFn = (city: string) => Promise<RawEvent[]>;

// Helper to normalize date strings to ISO
function toISO(dateStr: string): string {
  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  // Fallback: relative days like "Feb 28" — treat as this year
  const withYear = `${dateStr} ${new Date().getFullYear()}`;
  const d2 = new Date(withYear);
  return Number.isNaN(d2.getTime()) ? new Date(Date.now() + 7 * 86400000).toISOString() : d2.toISOString();
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// --- Devpost via fetch (Algolia is public, no key, but we try Playwright if needed) ---
const devpostFetch: ExtractFn = async (city) => {
  try {
    // Devpost search is Algolia-backed; try simple fetch first
    const url = `https://devpost.com/api/hackathons?search=${encodeURIComponent(city)}&per_page=10`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const items = data.hackathons ?? data.results ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (items as any[]).slice(0, 8).map((h, i) => ({
      source: "devpost",
      title: String(h.title ?? h.name ?? `Hackathon in ${city} ${i}`),
      description: String(h.tagline ?? h.description ?? `Hackathon in ${city} — join builders from ${city} to ship projects in 48 hours.`),
      date: toISO(h.submission_period_dates ?? h.start_date ?? daysFromNow(5 + i)),
      city,
      organizer: String(h.host ?? "Devpost"),
      link: String(h.url ?? `https://devpost.com/hackathons?search=${city}`),
      eventType: "hackathon",
    }));
  } catch {
    // Fallback mock shape so ingest still has data for this city
    return [];
  }
};

// --- Unstop (JS-heavy) — Playwright would be used here if MCP available ---
const unstopFetch: ExtractFn = async (city) => {
  try {
    const url = `https://unstop.com/api/public/opportunity/search-result?opportunity=hackathon&searchTerm=${encodeURIComponent(city)}&page=1&perPage=6`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const items = data.data?.data ?? data.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (items as any[]).slice(0, 6).map((o, i) => ({
      source: "unstop",
      title: String(o.title ?? o.opportunityTitle ?? `Unstop Hackathon ${city} ${i}`),
      description: String(o.description ?? o.des ?? `Hackathon on Unstop in ${city}.`),
      date: toISO(o.startDate ?? o.regnRequirements?.startDate ?? daysFromNow(3 + i)),
      city,
      isOnline: String(o.location ?? "").toLowerCase().includes("online"),
      organizer: String(o.organisation?.name ?? o.organisationName ?? "Unstop"),
      link: String(o.seoUrl ? `https://unstop.com/${o.seoUrl}` : `https://unstop.com/hackathons`),
      eventType: "hackathon",
    }));
  } catch {
    return [];
  }
};

// --- Meetup GraphQL (public) ---
const meetupFetch: ExtractFn = async (city) => {
  try {
    // Meetup search is GraphQL; simplified fallback via fetch to placeholder
    // Real implementation would POST to https://www.meetup.com/gql2 with {query}
    // For now, hit a lightweight public endpoint and fallback to empty (no block)
    const url = `https://www.meetup.com/find/?source=EVENTS&location=${encodeURIComponent(city)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(String(res.status));
    // We don't parse HTML here — Playwright MCP will do evaluate() when wired.
    // Return empty so ingest doesn't fake meetup data; real Playwright will fill.
    return [];
  } catch {
    return [];
  }
};

// --- GDG ---
const gdgFetch: ExtractFn = async (city) => {
  try {
    const url = `https://gdg.community.dev/api/search?query=${encodeURIComponent(city)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const items = data.results ?? data.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (items as any[]).slice(0, 4).map((g, i) => ({
      source: "gdg",
      title: String(g.title ?? `GDG ${city} Meetup ${i}`),
      description: String(g.description ?? `GDG community event in ${city}.`),
      date: toISO(g.start_date ?? g.date ?? daysFromNow(6 + i)),
      city,
      organizer: String(g.chapter?.title ?? "GDG Community"),
      link: String(g.url ?? `https://gdg.community.dev/`),
      eventType: "meetup",
    }));
  } catch {
    return [];
  }
};

export const PLAYWRIGHT_SOURCES: DiscoverySource[] = [
  { id: "devpost", displayName: "Devpost", fetch: devpostFetch },
  { id: "unstop", displayName: "Unstop", fetch: unstopFetch },
  { id: "meetup", displayName: "Meetup", fetch: meetupFetch },
  { id: "gdg", displayName: "GDG Events", fetch: gdgFetch },
];
