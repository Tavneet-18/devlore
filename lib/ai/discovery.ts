import { getDiscoverySources, dedupeEvents } from "./index";
import type { DiscoveryResult, RawEvent } from "./types";

/**
 * AI event discovery pipeline:
 *   1. fetch raw events from all configured sources
 *   2. clean/normalize messy fields
 *   3. deduplicate across sources
 */
export async function discoverEvents(location: string): Promise<DiscoveryResult> {
  const sources = await getDiscoverySources(location);
  const locationsSearched: string[] = [];
  const raw: RawEvent[] = [];

  for (const source of sources) {
    const found = await source.fetch(location);
    locationsSearched.push(location);
    raw.push(...found.map((e) => clean(e, location)));
  }

  const { events, deduped } = dedupeEvents(raw);

  return {
    provider: "mock-discovery",
    locationsSearched,
    found: raw.length,
    deduped,
    events,
  };
}

function clean(event: RawEvent, location: string): RawEvent {
  return {
    ...event,
    title: event.title.trim(),
    city: cleanCity(event.city, location),
    date: new Date(event.date).toISOString(),
    organizer: event.organizer.trim(),
  };
}

function cleanCity(raw: string | undefined, location: string): string {
  if (raw && raw.trim()) return raw.trim();
  return location.split(",")[0].trim().replace(/\b(city|india)\b/gi, "").trim();
}