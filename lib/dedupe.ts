/**
 * Cross-source deduplication.
 *
 * The same hackathon is routinely listed on several platforms at once. Left
 * alone, each sighting becomes its own row: the visible count inflates, one
 * real deadline looks like three competing ones, and the model is asked to
 * summarise the same listing over and over.
 *
 * Matching is deliberately conservative. A false merge destroys data (two
 * genuinely different events collapse into one, and one of their links is lost
 * from the front page), whereas a missed merge merely leaves a duplicate for a
 * moderator to spot. So all three signals must agree:
 *
 *   1. normalised title  — lowercase, punctuation and year stripped
 *   2. overlapping dates — the two date ranges actually intersect
 *   3. compatible place  — same city, or one of them is online
 *
 * "HACKBIOS 2K26" and "Hackbios 2k26" match on (1); "Hackathon 2026" and
 * "Hackathon 2025" do not, because the year is stripped from the key AND the
 * date ranges do not overlap — both signals must break together.
 */

/** Words that carry no identity and only add noise to a title key. */
const NOISE = new Set([
  "hackathon", "hackathons", "hacksprint", "the", "a", "an", "of", "and",
  "at", "in", "for", "by", "edition", "editions", "season", "series",
]);

/**
 * Reduce a title to a comparable key.
 *
 * Strips a trailing year (and the words around it), removes punctuation, drops
 * the generic "hackathon" noise words, and removes all whitespace. That last
 * step is what lets "Global Distributed Systems Hackweek" match "Global
 * Distributed Systems Hack Week", which platforms write interchangeably.
 *
 * Removing the year means "Hackathon 2025" and "Hackathon 2026" share a key.
 * That is intentional and is why year removal is safe: the year is exactly the
 * thing platforms disagree about ("2K26" vs "2k26"), and the disambiguation
 * comes from the date-overlap check, which runs before anything is merged.
 */
export function normaliseTitle(title: string): string {
  const withoutYear = title
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b\d+(st|nd|rd|th)?\s*(edition|ed)\b/gi, " ");

  return withoutYear
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w))
    .join("");
}

interface DateRange {
  start: number;
  end: number;
}

function rangeOf(event: { date: string | Date; endDate?: string | Date | null }): DateRange | null {
  const start = new Date(event.date).getTime();
  if (Number.isNaN(start)) return null;
  const end = event.endDate ? new Date(event.endDate).getTime() : start;
  return { start, end: Number.isNaN(end) ? start : end };
}

/** Two ranges overlap, allowing a small tolerance for timezone/date slop. */
export function rangesOverlap(a: DateRange, b: DateRange, toleranceDays = 2): boolean {
  const slack = toleranceDays * 86400000;
  return a.start - slack <= b.end && b.start - slack <= a.end;
}

/**
 * Compatible locations. Online events match anything, mirroring the city
 * filter's existing behaviour; otherwise the city must be the same once
 * punctuation and case are ignored.
 */
export function placesCompatible(
  a: { city?: string | null; isOnline?: boolean },
  b: { city?: string | null; isOnline?: boolean }
): boolean {
  if (a.isOnline || b.isOnline) return true;
  const ca = (a.city ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const cb = (b.city ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!ca || !cb) return true; // Unknown place on either side: do not block a merge.
  return ca === cb || ca.includes(cb) || cb.includes(ca);
}

/** Accepts both shapes: incoming listings carry ISO strings, Prisma rows carry Date. */
export interface DedupeCandidate {
  id: string;
  title: string;
  date: string | Date;
  endDate?: string | Date | null;
  city?: string | null;
  isOnline?: boolean;
}

export interface MergeDecision {
  canonicalId: string;
  duplicateId: string;
  reason: string;
}

/**
 * Decide which existing events a newly-ingested listing duplicates.
 *
 * Candidates are pre-filtered by the caller (same title key), so this only has
 * to apply the date and place checks.
 */
export function findDuplicates(
  incoming: DedupeCandidate,
  candidates: DedupeCandidate[]
): MergeDecision[] {
  const key = normaliseTitle(incoming.title);
  if (!key) return [];

  const incomingRange = rangeOf(incoming);
  if (!incomingRange) return [];

  const out: MergeDecision[] = [];
  for (const c of candidates) {
    if (c.id === incoming.id) continue;
    if (normaliseTitle(c.title) !== key) continue;
    const range = rangeOf(c);
    if (!range) continue;
    if (!rangesOverlap(incomingRange, range)) continue;
    if (!placesCompatible(incoming, c)) continue;
    out.push({
      canonicalId: c.id,
      duplicateId: incoming.id,
      reason: `title "${key}" + overlapping dates + compatible location`,
    });
  }
  return out;
}

/** Exported for the ingest to key its in-memory batch on. */
export { NOISE };
