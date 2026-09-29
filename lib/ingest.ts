import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { discoverEvents } from "./ai/discovery";
import { getEnhancer, getDiscoverySources, getCityAgnosticSources } from "./ai";
import { isEventType, moderationStatusFor } from "./constants";
import { getSchemaCapabilities } from "./schema-capabilities";
import type { RawEvent } from "./ai/types";

export interface SourceStat {
  source: string;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  errorSample?: string;
}

export interface CityResult {
  city: string;
  found: number;
  upserted: number;
  approved: number;
  pending: number;
  errors: number;
}

/** Only allow known event types through; anything else is normalised to "other". */
function normaliseEventType(value: string | undefined): string {
  return value && isEventType(value) ? value : "other";
}

/**
 * Fingerprint of the content we enrich.
 *
 * The image URL is deliberately EXCLUDED. A source that rotates its poster
 * asset — which Devpost does routinely — would otherwise look like a content
 * change, triggering a pointless re-enrichment on every single run. Worse, if
 * the URL were part of the identity it would create a duplicate row instead of
 * updating the existing one.
 *
 * What is left is exactly what can change the meaning of the summary: the
 * title, the description, the dates, the city and the registration link.
 */
function hashContent(event: {
  title: string;
  description: string;
  date: string;
  city?: string;
  link?: string;
}): string {
  return createHash("sha1")
    .update(
      [
        event.title.trim(),
        event.description.trim(),
        event.date,
        event.city ?? "",
        event.link ?? "",
      ].join("|")
    )
    .digest("hex");
}

/** Fallback identity for rows with no platform id (e.g. manual submissions). */
function legacyExternalId(raw: RawEvent): string {
  return (
    raw.link ??
    `${raw.source}:${createHash("sha1")
      .update(`${raw.title}|${raw.date}|${(raw.city ?? "").toLowerCase().trim()}`)
      .digest("hex")}`
  );
}

interface UpsertOutcome {
  created: boolean;
  updated: boolean;
  skipped: boolean;
  error?: string;
}

/**
 * Write one scraped listing.
 *
 * Identity is (source, sourceId) when the platform publishes a stable id, which
 * is what every new adapter supplies. `externalId` remains as a fallback so the
 * pipeline still works against the pre-migration schema and for sources that
 * only give us a URL.
 */
async function upsertEvent(
  raw: RawEvent,
  enhancer: { enhance: (t: string, d: string, l?: string) => Promise<{ summary: string; tags: string[]; beginnerFriendly: boolean; isOnline: boolean }> },
  caps: { sourceIdentity: boolean }
): Promise<UpsertOutcome> {
  const date = new Date(raw.date);
  if (Number.isNaN(date.getTime())) return { created: false, updated: false, skipped: true };

  const endDate = raw.endDate ? new Date(raw.endDate) : null;
  const hash = hashContent(raw);
  const status = moderationStatusFor(raw.source, raw.organizer);
  const externalId = legacyExternalId(raw);
  const rawPayload = JSON.parse(JSON.stringify(raw)) as Prisma.InputJsonValue;

  // Prefer the platform's own id for identity; fall back to the URL.
  const useSourceId = caps.sourceIdentity && Boolean(raw.sourceId);

  const existing = await db.event.findFirst({
    where: useSourceId
      ? { source: raw.source, sourceId: raw.sourceId! }
      : { externalId },
    select: { id: true, status: true, hash: true },
  });

  // Content unchanged: only bump freshness. Crucially, this is the path that
  // avoids spending a Groq call on a row we already summarised.
  if (existing && existing.hash === hash) {
    await db.event.update({ where: { id: existing.id }, data: { fetchedAt: new Date() } });
    return { created: false, updated: false, skipped: true };
  }

  // Only reach for the model when we actually have something new to summarise.
  // A brand-new row always needs one; an existing row needs one only because
  // its content hash moved.
  const enhancement = await enhancer.enhance(raw.title, raw.description, raw.link);

  const data = {
    title: raw.title,
    description: raw.description,
    summary: enhancement.summary,
    date,
    endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
    city: raw.city ?? null,
    isOnline: raw.isOnline ?? enhancement.isOnline,
    eventType: normaliseEventType(raw.eventType),
    organizer: raw.organizer,
    link: raw.link ?? null,
    // The poster is refreshed on every changed row, which is the whole point
    // of keeping it out of the hash.
    imageUrl: raw.imageUrl ?? null,
    tags: JSON.stringify(enhancement.tags),
    beginnerFriendly: enhancement.beginnerFriendly,
    hash,
    fetchedAt: new Date(),
    rawPayload,
    ...(caps.sourceIdentity
      ? { sourceId: raw.sourceId ?? null, deadlineKind: raw.deadlineKind ?? null }
      : {}),
  };

  if (existing) {
    await db.event.update({
      where: { id: existing.id },
      data: {
        ...data,
        source: raw.source,
        // Never clobber a moderator's REJECTED decision on re-ingest.
        ...(existing.status === "REJECTED" ? {} : { status }),
      },
    });
    return { created: false, updated: true, skipped: false };
  }

  await db.event.create({
    data: { ...data, source: raw.source, status, externalId },
  });
  return { created: true, updated: false, skipped: false };
}

/** Record one row per source per run so the admin page can show source health. */
async function logRun(stat: SourceStat): Promise<void> {
  const caps = await getSchemaCapabilities();
  if (!caps.ingestRun) return;
  try {
    await db.ingestRun.create({
      data: {
        source: stat.source,
        startedAt: new Date(),
        finishedAt: new Date(),
        fetched: stat.fetched,
        created: stat.created,
        updated: stat.updated,
        skipped: stat.skipped,
        errors: stat.errors,
        errorSample: stat.errorSample?.slice(0, 500) ?? null,
      },
    });
  } catch {
    // Logging must never break an ingest.
  }
}

/**
 * Run every city-agnostic source exactly once.
 *
 * Devfolio, Hack2Skill, WeMakeDevs and MLH each publish one global listing
 * with no location filter, so calling them per city would re-fetch the same
 * pages six times and — worse — stamp every offline event with whichever city
 * happened to be queried. The (source, sourceId) upsert makes a repeat
 * harmless, so even if this is invoked twice, no duplicate rows appear.
 */
export async function ingestCityAgnostic(): Promise<SourceStat[]> {
  const sources = getCityAgnosticSources();
  const enhancer = getEnhancer();
  const caps = await getSchemaCapabilities();
  const stats: SourceStat[] = [];

  for (const source of sources) {
    const stat: SourceStat = {
      source: source.id,
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    };

    try {
      // The location argument is ignored by these adapters by design; it is
      // passed only to satisfy the shared DiscoverySource signature.
      const events = await source.fetch("");
      stat.fetched = events.length;

      for (const raw of events) {
        try {
          const out = await upsertEvent(raw, enhancer, caps);
          if (out.created) stat.created++;
          else if (out.updated) stat.updated++;
          else if (out.skipped) stat.skipped++;
        } catch (e) {
          stat.errors++;
          stat.errorSample ??= e instanceof Error ? e.message : String(e);
        }
      }
    } catch (e) {
      // A source that throws outright is logged and skipped, never fatal.
      stat.errors++;
      stat.errorSample = e instanceof Error ? e.message : String(e);
    }

    await logRun(stat);
    stats.push(stat);
  }

  return stats;
}

/** City-scoped sources (Devpost, Unstop, GDG), unchanged in behaviour. */
export async function ingestCity(city: string): Promise<CityResult> {
  const result = await discoverEvents(city);
  const enhancer = getEnhancer();
  const caps = await getSchemaCapabilities();
  let upserted = 0;
  let approved = 0;
  let pending = 0;
  let errors = 0;

  for (const raw of result.events) {
    try {
      const out = await upsertEvent(raw, enhancer, caps);
      if (out.skipped) continue;
      upserted++;
      const status = moderationStatusFor(raw.source, raw.organizer);
      if (status === "APPROVED") approved++;
      else pending++;
    } catch {
      errors++;
    }
  }

  return { city, found: result.found, upserted, approved, pending, errors };
}

export async function ingestAll(cities: string[]) {
  const cityResults = await Promise.allSettled(cities.map((c) => ingestCity(c)));
  const cityStats = cityResults.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { city: cities[i], found: 0, upserted: 0, approved: 0, pending: 0, errors: 1 }
  );

  const sourceStats = await ingestCityAgnostic();

  return { cities: cityStats, sources: sourceStats };
}

export { getDiscoverySources };
