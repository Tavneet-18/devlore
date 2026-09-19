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

export type LocationOptions = {
  setCity: (city: string) => void;
  citySet: string;
};
