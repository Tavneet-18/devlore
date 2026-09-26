import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { discoverEvents } from "./ai/discovery";
import { getEnhancer } from "./ai";
import { isEventType, moderationStatusFor } from "./constants";

function hashEvent(title: string, date: string, city?: string, link?: string): string {
  if (link) return createHash("sha1").update(link).digest("hex");
  return createHash("sha1").update(`${title}|${date}|${(city ?? "").toLowerCase().trim()}`).digest("hex");
}

/**
 * Fingerprint the content we persist. Any field that affects what the user
 * sees must be included, otherwise a changed banner (or link) would be
 * treated as "unchanged" and never written.
 */
function hashContent(event: {
  title: string;
  description: string;
  date: string;
  city?: string;
  link?: string;
  imageUrl?: string;
}) {
  return createHash("sha1")
    .update(
      [
        event.title,
        event.description,
        event.date,
        event.city ?? "",
        event.link ?? "",
        event.imageUrl ?? "",
      ].join("|")
    )
    .digest("hex");
}

/** Only allow known event types through; anything else is normalised to "other". */
function normaliseEventType(value: string | undefined): string {
  return value && isEventType(value) ? value : "other";
}

export async function ingestCity(city: string): Promise<{ city: string; found: number; upserted: number; approved: number; pending: number; errors: number }> {
  const result = await discoverEvents(city);
  const enhancer = getEnhancer();
  let upserted = 0;
  let approved = 0;
  let pending = 0;
  let errors = 0;

  for (const raw of result.events) {
    try {
      const enhancement = await enhancer.enhance(raw.title, raw.description, raw.link);
      const date = new Date(raw.date);
      if (Number.isNaN(date.getTime())) continue;

      const externalId = raw.link ?? `${raw.source}:${hashEvent(raw.title, raw.date, raw.city, raw.link)}`;
      const hash = hashContent({
        title: raw.title,
        description: raw.description,
        date: raw.date,
        city: raw.city,
        link: raw.link,
        imageUrl: raw.imageUrl,
      });
      const status = moderationStatusFor(raw.source, raw.organizer);
      const rawPayload = JSON.parse(JSON.stringify(raw)) as Prisma.InputJsonValue;

      const existing = await db.event.findUnique({ where: { externalId } });
      if (existing && existing.hash === hash) {
        // Content unchanged — only bump fetchedAt so we can track freshness.
        await db.event.update({ where: { externalId }, data: { fetchedAt: new Date() } });
        continue;
      }

      await db.event.upsert({
        where: { externalId },
        create: {
          title: raw.title,
          description: raw.description,
          summary: enhancement.summary,
          date,
          endDate: raw.endDate ? new Date(raw.endDate) : null,
          city: raw.city ?? null,
          isOnline: raw.isOnline ?? enhancement.isOnline,
          eventType: normaliseEventType(raw.eventType),
          organizer: raw.organizer,
          link: raw.link ?? null,
          imageUrl: raw.imageUrl ?? null,
          tags: JSON.stringify(enhancement.tags),
          beginnerFriendly: enhancement.beginnerFriendly,
          source: raw.source,
          status,
          externalId,
          hash,
          fetchedAt: new Date(),
          rawPayload,
        },
        update: {
          title: raw.title,
          description: raw.description,
          summary: enhancement.summary,
          date,
          endDate: raw.endDate ? new Date(raw.endDate) : null,
          city: raw.city ?? null,
          isOnline: raw.isOnline ?? enhancement.isOnline,
          eventType: normaliseEventType(raw.eventType),
          organizer: raw.organizer,
          link: raw.link ?? null,
          imageUrl: raw.imageUrl ?? null,
          tags: JSON.stringify(enhancement.tags),
          beginnerFriendly: enhancement.beginnerFriendly,
          source: raw.source,
          // Never clobber a moderator's REJECTED decision on re-ingest.
          ...(existing?.status === "REJECTED" ? {} : { status }),
          hash,
          fetchedAt: new Date(),
          rawPayload,
        },
      });
      upserted++;
      if (status === "APPROVED") approved++;
      else pending++;
    } catch {
      errors++;
    }
  }

  return { city, found: result.found, upserted, approved, pending, errors };
}

export async function ingestAll(cities: string[]) {
  const results = await Promise.allSettled(cities.map((c) => ingestCity(c)));
  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { city: cities[i], found: 0, upserted: 0, approved: 0, pending: 0, errors: 1 }
  );
}
