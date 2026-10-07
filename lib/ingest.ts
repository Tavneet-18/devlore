import { createHash } from "node:crypto";
import { generateBrief } from "./ai/brief";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { discoverEvents } from "./ai/discovery";
import { getEnhancer, getDiscoverySources, getCityAgnosticSources } from "./ai";
import { isEventType, moderationStatusFor } from "./constants";
import { getSchemaCapabilities } from "./schema-capabilities";
import { findDuplicates, normaliseTitle } from "./dedupe";
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
 * What is left is exactly what can change what the row *says* to a reader:
 * the title, the description, the dates, the place, the organiser, what kind of
 * event it is, whether it is online, who it is for, and the registration link.
 *
 * `organizer`, `eventType`, `isOnline` and `beginnerFriendly` were all missing
 * from this list, and all four are rendered on the card, the quick-look and the
 * detail page. A platform that corrected its own name, reclassified an event
 * from hackathon to workshop, or fixed an online listing as in-person produced
 * a byte-identical hash, so the row was treated as unchanged and the correction
 * could never land — not on the next run, not ever. All four are hashed now.
 *
 * The cost of adding fields is that every stored hash goes stale once, so the
 * next ingest rewrites every row it can see. That is one redundant upsert per
 * row with identical content, which is the cheap direction to be wrong in.
 */
function hashContent(event: {
  title: string;
  description: string;
  date: string;
  endDate?: string;
  city?: string;
  link?: string;
  organizer?: string;
  eventType?: string;
  isOnline?: boolean;
  beginnerFriendly?: boolean;
  deadlineKind?: string | null;
  details?: unknown;
}): string {
  return createHash("sha1")
    .update(
      [
        event.title.trim(),
        event.description.trim(),
        event.date,
        event.endDate ?? "",
        event.city ?? "",
        event.link ?? "",
        // Shown on the card, the quick-look and the detail page, and used as a
        // moderation signal, so a correction to it has to rewrite the row.
        (event.organizer ?? "").trim(),
        event.eventType ?? "",
        // Drives the "Online / In person" clause in the one-liner, the Mode row
        // in the facts, and whether a venue is shown at all.
        event.isOnline === undefined ? "" : String(event.isOnline),
        // Rendered as a beginner-friendly flag and used by the index filter.
        event.beginnerFriendly === undefined ? "" : String(event.beginnerFriendly),
        // Which date this row's countdown measures is part of what the row
        // says, so a source that starts or stops publishing a real deadline
        // must rewrite the row. Without it here, a corrected kind would be
        // computed every run and silently discarded, because the rest of the
        // content is unchanged.
        event.deadlineKind ?? "",
        // The structured facts are hashed too. A platform that later publishes
        // a prize, or corrects a team size, must rewrite the detail page —
        // without this the row would be treated as unchanged and the correction
        // would never land. Key order is normalised so two runs producing the
        // same object in the same order agree.
        stableStringify(event.details),
      ].join("|")
    )
    .digest("hex");
}

/** JSON with object keys sorted, so key order cannot move the hash. */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
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
  /** True when this listing matched an event we already had, from another platform. */
  merged?: boolean;
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
  caps: { sourceIdentity: boolean; ingestRun: boolean; eventDetails: boolean }
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
    if (caps.ingestRun) {
      await db.eventSourceRef
        .updateMany({
          where: { eventId: existing.id, source: raw.source },
          data: { lastSeenAt: new Date() },
        })
        .catch(() => {});
    }
    return { created: false, updated: false, skipped: true };
  }

  // Not seen on this platform before. Before creating a second row for what
  // may be the same real event, check whether we already hold it from another
  // source. Matching here rather than merging after the fact means a dedupe
  // can never destroy a row that had bookmarks or a moderation decision.
  if (caps.ingestRun && !existing) {
    const key = normaliseTitle(raw.title);
    if (key) {
      // Cheap pre-filter on the first significant word, then the real check.
      const head = key.slice(0, 8);
      const nearby = head
        ? await db.event.findMany({
            where: {
              status: { not: "REJECTED" },
              title: { contains: head, mode: "insensitive" },
            },
            select: { id: true, title: true, date: true, endDate: true, city: true, isOnline: true },
            take: 60,
          })
        : [];

      const dupes = nearby.length
        ? findDuplicates(
            {
              id: "__incoming__",
              title: raw.title,
              date: raw.date,
              endDate: raw.endDate ?? null,
              city: raw.city ?? null,
              isOnline: raw.isOnline,
            },
            nearby
          )
        : [];

      if (dupes.length > 0) {
        const winner = dupes[0].canonicalId;
        const refId = raw.sourceId ?? externalId;
        await db.eventSourceRef.upsert({
          where: { source_sourceId: { source: raw.source, sourceId: refId } },
          create: {
            eventId: winner,
            source: raw.source,
            sourceId: refId,
            link: raw.link ?? null,
          },
          update: { lastSeenAt: new Date(), link: raw.link ?? undefined },
        });
        // A second platform may report a different type of closing date.
        // Preserve the primary source timeline instead of replacing a
        // registration deadline with a submission or event-end date.
        await db.event.update({
          where: { id: winner },
          data: {
            imageUrl: raw.imageUrl ?? undefined,
            fetchedAt: new Date(),
          },
        });
        return { created: false, updated: true, skipped: false, merged: true };
      }
    }
  }

  // Only reach for the model when we actually have something new to summarise.
  // A brand-new row always needs one; an existing row needs one only because
  // its content hash moved.
  const enhancement = await enhancer.enhance(raw.title, raw.description, raw.link);

  // The brief. Measured across all four new adapters: none of them publishes
  // any prose at all, so `canBrief` is false and this costs nothing and
  // produces nothing today. It is wired in rather than dropped because the
  // guard is cheap and a source that starts publishing a description should
  // light this up without another migration.
  const brief = await generateBrief(raw.title, raw.details ?? null, raw.city ?? null);

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
    // Migration 004. Omitted entirely until its columns exist, so a deploy that
    // lands before the migration does not break the ingest.
    ...(caps.eventDetails
      ? {
          details: (raw.details ?? null) as Prisma.InputJsonValue,
          brief: brief.brief,
          whoCanJoin: brief.whoCanJoin,
          // Null, not a timestamp, when there was nothing to generate — so a
          // later run can tell "never generated" from "generated as blank".
          briefedAt: brief.brief || brief.whoCanJoin ? new Date() : null,
        }
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
      // What we already hold from this source, so an adapter with a per-run
      // request budget spends it on slugs it has never fetched rather than
      // re-reading the same ones. Cheap: one indexed lookup of ids only, and
      // it replaces up to H2S_MAX_FETCHES round trips of reading rows we would
      // then throw away.
      const known = caps.sourceIdentity
        ? await db.event.findMany({
            where: { source: source.id, sourceId: { not: null } },
            select: { sourceId: true },
          })
        : [];

      // The location argument is ignored by these adapters by design; it is
      // passed only to satisfy the shared DiscoverySource signature.
      const events = await source.fetch("", {
        excludeSourceIds: known.map((k) => k.sourceId as string),
      });
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
