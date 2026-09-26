export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBA";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...opts,
  });
}

export function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
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
  if (end > now) return "ongoing";
  if (start > now) return "upcoming";
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
  if (Number.isNaN(end.getTime())) return formatDate(startIso);

  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) return formatDate(startIso);

  const sameYear = start.getFullYear() === end.getFullYear();
  const endLabel = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });

  return `${formatDate(startIso)} – ${endLabel}`;
}
