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
  const raw: RawEvent[] = [];

  // Fetch all sources in parallel so one slow/blocked source cannot stall the run.
  const settled = await Promise.allSettled(
    sources.map(async (source) => ({
      id: source.id,
      found: await source.fetch(location),
    }))
  );

  for (const result of settled) {
    if (result.status === "rejected") continue;
    for (const event of result.value.found) {
      const cleaned = clean(event, location);
      if (cleaned) raw.push(cleaned);
    }
  }

  const { events, deduped } = dedupeEvents(raw);

  return {
    provider: (process.env.DISCOVERY_MODE ?? "mock") === "live" ? "live-sources" : "mock-discovery",
    locationsSearched: [location],
    found: raw.length,
    deduped,
    events,
  };
}

/**
 * Normalise one raw event. Returns null when the row is unusable (missing
 * title/organizer, or an unparseable date) so a single bad record from a
 * source cannot discard the rest of the batch.
 */
function clean(event: RawEvent, location: string): RawEvent | null {
  const title = event.title?.trim() ?? "";
  const organizer = event.organizer?.trim() ?? "";
  if (!title || !organizer) return null;

  const parsed = new Date(event.date);
  if (Number.isNaN(parsed.getTime())) return null;

  const endParsed = event.endDate ? new Date(event.endDate) : null;
  const endDate =
    endParsed && !Number.isNaN(endParsed.getTime()) ? endParsed.toISOString() : undefined;

  return {
    ...event,
    title,
    date: parsed.toISOString(),
    endDate,
    city: cleanCity(event.city, location),
    organizer,
  };
}

function cleanCity(raw: string | undefined, location: string): string | undefined {
  if (raw && raw.trim()) return raw.trim();
  return location.split(",")[0].trim().replace(/\b(city|india)\b/gi, "").trim() || undefined;
}