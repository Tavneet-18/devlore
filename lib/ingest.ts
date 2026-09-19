import { createHash } from "crypto";
import { db } from "./db";
import { discoverEvents } from "./ai/discovery";
import { getEnhancer } from "./ai";
import { isVerifiedOrganizer } from "./constants";

function hashEvent(title: string, date: string, city?: string, link?: string): string {
  if (link) return createHash("sha1").update(link).digest("hex");
  return createHash("sha1").update(`${title}|${date}|${(city ?? "").toLowerCase().trim()}`).digest("hex");
}

function hashContent(event: { title: string; description: string; date: string; city?: string }) {
  return createHash("sha1").update(`${event.title}|${event.description}|${event.date}|${event.city ?? ""}`).digest("hex");
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
      const hash = hashContent({ title: raw.title, description: raw.description, date: raw.date, city: raw.city });
      const verified = isVerifiedOrganizer(raw.organizer);
      const status = verified ? "APPROVED" : "PENDING";

      const existing = await db.event.findUnique({ where: { externalId } });
      if (existing && existing.hash === hash) {
        // No change — just bump fetchedAt
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
          eventType: raw.eventType ?? "other",
          organizer: raw.organizer,
          link: raw.link ?? null,
          tags: JSON.stringify(enhancement.tags),
          beginnerFriendly: enhancement.beginnerFriendly,
          source: raw.source,
          status,
          externalId,
          hash,
          fetchedAt: new Date(),
          rawPayload: raw as unknown as object,
        },
        update: {
          title: raw.title,
          description: raw.description,
          summary: enhancement.summary,
          date,
          endDate: raw.endDate ? new Date(raw.endDate) : null,
          city: raw.city ?? null,
          isOnline: raw.isOnline ?? enhancement.isOnline,
          eventType: raw.eventType ?? "other",
          organizer: raw.organizer,
          link: raw.link ?? null,
          tags: JSON.stringify(enhancement.tags),
          beginnerFriendly: enhancement.beginnerFriendly,
          source: raw.source,
          // Don't overwrite manual status changes if already moderated to REJECTED
          ...(existing?.status === "REJECTED" ? {} : { status }),
          hash,
          fetchedAt: new Date(),
          rawPayload: raw as unknown as object,
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
    r.status === "fulfilled" ? r.value : { city: cities[i], found: 0, upserted: 0, approved: 0, pending: 0, errors: 1 }
  );
}
