/**
 * Everything is stored in UTC. Everything is DISPLAYED in IST.
 *
 * The server runs in UTC, so without an explicit timeZone a date formatted on
 * the server renders in UTC and reads as the previous day to anyone in India —
 * which matters a great deal on a product whose entire premise is "this closes
 * on the 30th". Pinning the zone here means the server and the client agree
 * and there is no hydration mismatch.
 */
export const DISPLAY_TIMEZONE = "Asia/Kolkata";
export const DISPLAY_TZ_LABEL = "IST";

const TZ = { timeZone: DISPLAY_TIMEZONE } as const;

export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBA";
  return d.toLocaleDateString("en-US", {
    ...TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...opts,
  });
}

export function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  return d.toLocaleDateString("en-US", { ...TZ, weekday: "short", day: "numeric", month: "short" });
}

/** Full IST timestamp, for anywhere the exact time matters. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBA";
  return `${d.toLocaleString("en-GB", {
    ...TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })} ${DISPLAY_TZ_LABEL}`;
}

export function isUpcoming(iso: string): boolean {
  return new Date(iso).getTime() >= Date.now() - 12 * 3600000;
}

export function relativeFromNow(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const days = Math.round(diff / 86400000);
  if (days < 0) return "Ended";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `In ${weeks} week${weeks > 1 ? "s" : ""}`;
  const months = Math.round(days / 30);
  return `In ${months} month${months > 1 ? "s" : ""}`;
}

/* -------------------------------------------------------------------------- */
/* Event-aware date helpers                                                    */
/*                                                                             */
/* Multi-day events (hackathons, conferences) start on one day and finish      */
/* later. Judging them by the start date alone makes a running event that ends  */
/* in three weeks look "Ended", so everything below considers both ends.        */
/* -------------------------------------------------------------------------- */

export type EventPhase = "upcoming" | "ongoing" | "ended";

/** Classify an event from its start and (optional) end. */
export function eventPhase(startIso: string, endIso?: string | null): EventPhase {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : NaN;
  const now = Date.now();

  if (Number.isNaN(start)) return "ended";
  if (start > now) return "upcoming";
  if (end >= start && end > now) return "ongoing";
  return "ended";
}

/** True while the event can still be attended or registered for. */
export function isActive(startIso: string, endIso?: string | null): boolean {
  return eventPhase(startIso, endIso) !== "ended";
}

/**
 * The date that matters to someone looking at the event:
 *  - upcoming -> the start
 *  - ongoing  -> the end (how long is left)
 */
export function referenceDate(startIso: string, endIso?: string | null): string {
  return eventPhase(startIso, endIso) === "ongoing" && endIso ? endIso : startIso;
}

/** Human label for an event's timing, e.g. "Ends in 5 days" / "In 2 weeks". */
export function eventTiming(startIso: string, endIso?: string | null): string {
  const phase = eventPhase(startIso, endIso);
  if (phase === "ended") return "Ended";
  if (phase === "ongoing") {
    return endIso ? `Ends ${relativeFromNow(endIso).toLowerCase()}` : "Happening now";
  }
  return relativeFromNow(startIso);
}

/** Compact countdown like "3d : 14h : 22m" for a target date. */
export function countdown(targetIso: string): string {
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return "--";

  let ms = target - Date.now();
  if (ms < 0) return "Closed";

  const days = Math.floor(ms / 86400000);
  ms -= days * 86400000;
  const hours = Math.floor(ms / 3600000);
  ms -= hours * 3600000;
  const minutes = Math.floor(ms / 60000);

  if (days > 0) return `${days}d : ${String(hours).padStart(2, "0")}h : ${String(minutes).padStart(2, "0")}m`;
  if (hours > 0) return `${hours}h : ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

/** "Oct 23 – Oct 30, 2026" style range, or a single date when there is no end. */
export function formatDateRange(startIso: string, endIso?: string | null): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "TBA";
  if (!endIso) return formatDate(startIso);

  const end = new Date(endIso);
  if (Number.isNaN(end.getTime()) || end < start) return formatDate(startIso);

  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", TZ);
  const sameDay = dayKey(start) === dayKey(end);
  if (sameDay) return formatDate(startIso);

  const yearKey = (d: Date) => d.toLocaleDateString("en-CA", { ...TZ, year: "numeric" });
  const sameYear = yearKey(start) === yearKey(end);
  const endLabel = end.toLocaleDateString("en-US", {
    ...TZ,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });

  return `${formatDate(startIso)} – ${endLabel}`;
}

/**
 * What the countdown on a card is actually measuring.
 *
 * Devfolio and Hack2Skill publish a real registration deadline. WeMakeDevs and
 * MLH publish none, so for those we count down to the event's end date instead.
 * Labelling both "Registration closes" would be a small lie in a product built
 * on honest deadlines, so the kind is stored per row and surfaced here.
 */
export function deadlineLabel(
  kind: string | null | undefined,
  phase: EventPhase
): string {
  if (kind === "registration") return "Registration closes in";
  if (kind === "submission") return "Submissions close in";
  if (kind === "event-end") return phase === "ongoing" ? "Ends in" : "Runs until";
  return phase === "ongoing" ? "Ends in" : "Starts in";
}
