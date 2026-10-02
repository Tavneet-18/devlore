import type { EventDetails } from "./event-facts";
import { feeLabel, teamSizeLabel } from "./event-facts";
import {
  formatDateRange,
  formatDateTime,
  deadlineLabel,
  eventPhase,
  DISPLAY_TZ_LABEL,
} from "./format";

/**
 * The one honest line about an event.
 *
 * This is built only from facts the source published, assembled
 * deterministically. It is deliberately not a model call: a summary that
 * changes wording between two page loads of the same row is worse than a
 * plain assembled sentence, and the one place a model would be safe here — the
 * description prose — turns out to be empty on every source we ingest.
 *
 * It feeds three surfaces, and they must agree:
 *   - the meta description and the index rows
 *   - the axis tooltips
 *   - the Open Graph image
 */

export type SummaryInput = {
  title: string;
  date: string;
  endDate?: string | null;
  deadlineKind?: string | null;
  isOnline: boolean;
  city?: string | null;
  details?: EventDetails | null;
  whoCanJoin?: string | null;
};

const MAX = 180;

/**
 * "Closes 30 Oct · Hybrid · Teams of 2-4 · Free to enter"
 *
 * Clauses are joined in a fixed order and truncated at a word boundary, so the
 * same event always produces the same string.
 */
export function eventOneLiner(input: SummaryInput): string {
  const clauses: string[] = [];

  const reference = input.endDate ?? input.date;
  const phase = eventPhase(input.date, input.endDate);
  if (input.deadlineKind === "event-end") {
    // The only date is the finish date. Say "ends"/"runs until", never
    // "closes" — this is the distinction the whole deadline model rests on.
    clauses.push(
      phase === "ended"
        ? `Ended ${formatDateRange(input.date, input.endDate)}`
        : `Runs until ${formatDateRange(input.date, input.endDate)}`
    );
  } else {
    clauses.push(`${phase === "ended" ? "Closed" : "Closes"} ${formatDateRange(reference)}`);
  }

  clauses.push(input.isOnline ? "Online" : "In person");

  const team = teamSizeLabel(input.details ?? null);
  if (team && team !== "Solo entry") clauses.push(team);

  const fee = feeLabel(input.details ?? null);
  if (fee) clauses.push(fee);

  if (input.details?.themes?.length) {
    clauses.push(input.details.themes.slice(0, 2).join(" · "));
  }

  if (input.details?.participants) {
    clauses.push(`${input.details.participants.toLocaleString("en-IN")} registered`);
  }

  return truncate(clauses.join(" · "), MAX);
}

/**
 * The meta description.
 *
 * Prefers the generated brief when one exists, and otherwise states the facts.
 * Either way it ends with the timezone, because a deadline quoted without one
 * is the exact class of small dishonesty this site is trying to avoid.
 */
export function metaDescription(input: SummaryInput & { brief?: string | null }): string {
  const tz = `(dates in ${DISPLAY_TZ_LABEL})`;
  if (input.brief) {
    return truncate(`${input.brief} ${tz}`, 200);
  }
  const line = eventOneLiner(input);
  return truncate(`${input.title} — ${line}. ${tz}`, 200);
}

/** Cut at a word boundary and append an ellipsis, never mid-word. */
function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * The countdown's target, and only when it is a real deadline.
 *
 * Returns null for `deadlineKind: "event-end"`, which is what suppresses the
 * calendar buttons. A reader must never be able to add a finish date to their
 * calendar believing it is a registration deadline.
 */
export function registrationDeadline(input: SummaryInput): string | null {
  if (input.deadlineKind !== "registration") return null;
  const d = new Date(input.endDate ?? input.date);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() <= Date.now()) return null;
  return d.toISOString();
}

/** The heading above the countdown, honest about which date it measures. */
export function countdownHeading(input: SummaryInput): string | null {
  const reference = input.endDate ?? input.date;
  if (new Date(reference).getTime() <= Date.now()) return null;
  return deadlineLabel(input.deadlineKind, eventPhase(input.date, input.endDate));
}

export type GlanceRow = { label: string; value: string };

/**
 * The "At a glance" rows.
 *
 * Every row is built from a fact and then filtered, so a field the source never
 * published is absent from the page rather than rendered as a dash or a "TBA".
 * The ordering is the order a reader needs them in: when it runs, when it
 * closes, where, what you can win, whether you can enter, what it costs.
 *
 * A row whose whole point is that the data is *missing* — the registration
 * deadline — is handled separately: rather than being omitted silently, which
 * would look like an oversight, the source's own reason is shown. That string
 * is written by the adapter from what the platform actually does, not inferred.
 */
export function buildGlance(input: SummaryInput & { whoCanJoin?: string | null }): GlanceRow[] {
  const d = input.details ?? null;
  const rows: GlanceRow[] = [];

  const add = (label: string, value: string | null | undefined) => {
    if (value && value.trim()) rows.push({ label, value: value.trim() });
  };

  add("Runs", formatDateRange(input.date, input.endDate));

  if (input.deadlineKind === "registration") {
    const deadline = registrationDeadline(input);
    if (deadline) add("Registration closes", formatDateTime(deadline));
  } else if (d?.noDeadlineReason) {
    add("Registration deadline", d.noDeadlineReason);
  }

  add("Mode", input.isOnline ? "Online" : "In person");
  add("Venue", d?.venue ?? (input.isOnline ? null : input.city));
  add("Prizes", d?.prize);
  add("Team size", teamSizeLabel(d));
  add("Who can join", input.whoCanJoin ?? null);
  add("Entry fee", feeLabel(d));
  add("Tracks", d?.themes?.join(" · "));
  add("Organiser", d?.organiser);
  if (d?.participants) add("Registered", d.participants.toLocaleString("en-IN"));
  if (d?.regStart) add("Registration opens", formatDateTime(d.regStart));
  if (d?.submissionStart) add("Submissions open", formatDateTime(d.submissionStart));

  return rows;
}
