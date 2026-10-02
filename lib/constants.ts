export const EVENT_TYPES = [
  "hackathon",
  "meetup",
  "workshop",
  "webinar",
  "conference",
  "career-fair",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  all: "All types",
  hackathon: "Hackathon",
  meetup: "Meetup & GDG",
  workshop: "Workshop",
  webinar: "Webinar",
  conference: "Conference",
  "career-fair": "Career fair",
  other: "Other",
};

export const EVENT_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

// NOTE: this module used to export DISCOVERY_MODE and AI_PROVIDER. It is
// imported by client components, so exporting process.env accessors from it
// dragged Next's env shim into the client bundle. Under webpack that shim's
// chunk init races the page chunk and any access TDZ-crashes the whole app
// behind the error boundary. Every consumer reads process.env directly now,
// and the shim does not appear. Keep this module free of process.env.

export const BOOKMARK_COOKIE = "devlore_visitor";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Platforms that vet their own listings. Events pulled from these sources are
 * published immediately — the platform already did the vetting, and the
 * organizer is whoever ran the event, not the platform.
 *
 * The four added in Phase 2 are the same class of thing, and each vets at the
 * point we read it:
 *   - Devfolio publishes only listed, accepted hackathons on /open_hackathons.
 *   - Hack2skill's API is filtered on status === "APPROVED", so an unvetted
 *     listing is never fetched in the first place.
 *   - WeMakeDevs lists partner-run programmes (AWS and similar), not
 *     self-submitted posts.
 *   - MLH curates its own calendar; an event appears only once MLH has listed it.
 *
 * Without these four the adapters ran and every row landed in PENDING, which
 * is indistinguishable from the platform being blocked: 28 real, vetted events
 * were collected and then hidden by the moderation default.
 */
export const TRUSTED_SOURCES = [
  "devpost",
  "unstop",
  "gdg",
  "meetup",
  "devfolio",
  "hack2skill",
  "wemakedevs",
  "mlh",
] as const;

/**
 * Organizations we publish for regardless of source — partners and known
 * community orgs that are safe to show without manual review.
 */
export const VERIFIED_ORGANIZERS = [
  "TechForge Collective",
  "Devpost",
  "Unstop",
  "Meetup",
  "GDG Community",
  "PeakXV",
  "Polygon Labs",
  "FOSS United",
] as const;

export function isVerifiedOrganizer(organizer: string): boolean {
  const normalized = organizer.toLowerCase().trim();
  return VERIFIED_ORGANIZERS.some((v) => normalized.includes(v.toLowerCase()));
}

export function isTrustedSource(source: string): boolean {
  return (TRUSTED_SOURCES as readonly string[]).includes(source.toLowerCase().trim());
}

/**
 * Display names for the ingest source ids.
 *
 * The raw id is a database key ("hack2skill", "mlh"). Printing it on a page
 * would be leaking an implementation detail at the reader, so every place that
 * names a source to a human goes through this. An unknown id falls back to a
 * title-cased form of itself rather than disappearing, so a new adapter is
 * still legible before anyone adds it here.
 */
const SOURCE_LABELS: Record<string, string> = {
  devpost: "Devpost",
  unstop: "Unstop",
  gdg: "Google Developer Groups",
  meetup: "Meetup",
  devfolio: "Devfolio",
  hack2skill: "Hack2skill",
  wemakedevs: "WeMakeDevs",
  mlh: "Major League Hacking",
  manual: "Submitted directly",
};

export function sourceLabel(source: string): string {
  const key = source.toLowerCase().trim();
  return (
    SOURCE_LABELS[key] ??
    key.charAt(0).toUpperCase() + key.slice(1).replace(/[-_]/g, " ")
  );
}

/**
 * Decide the moderation status for an ingested event.
 *
 * Auto-published when the event came from a platform that vets its listings,
 * or when the organizer is on the verified list. Everything else — notably
 * user submissions, which always have source "manual" — waits for review.
 */
export function moderationStatusFor(source: string, organizer: string): "APPROVED" | "PENDING" {
  if (isTrustedSource(source)) return "APPROVED";
  if (isVerifiedOrganizer(organizer)) return "APPROVED";
  return "PENDING";
}

export type LocationOptions = {
  setCity: (city: string) => void;
  citySet: string;
};
