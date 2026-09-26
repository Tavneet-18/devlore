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

export const DISCOVERY_MODE = process.env.DISCOVERY_MODE ?? "mock";
export const AI_PROVIDER = process.env.AI_PROVIDER ?? "mock";
export const BOOKMARK_COOKIE = "devlore_visitor";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Platforms that vet their own listings. Events pulled from these sources are
 * published immediately — the platform already did the vetting, and the
 * organizer is whoever ran the event, not the platform.
 */
export const TRUSTED_SOURCES = ["devpost", "unstop", "gdg", "meetup"] as const;

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
