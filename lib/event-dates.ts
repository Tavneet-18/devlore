import type { EventDetails } from "./event-facts";
import { eventPhase, eventTiming, formatDateRange, relativeFromNow } from "./format";

/** date/endDate are legacy index bounds. Structured facts distinguish event
 * dates from registration/submission windows without a database migration. */
export type DatedEvent = {
  date: string;
  endDate?: string | null;
  deadlineKind?: string | null;
  source?: string;
  details?: EventDetails | null;
};

export function validDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function eventDates(input: DatedEvent) {
  const d = input.details;
  const kind = input.source === "devpost"
    || (input.source === "hack2skill" && input.deadlineKind === "event-end")
    ? "submission" : input.deadlineKind;
  const reference = validDate(input.endDate ?? input.date);
  const deadline = kind === "registration"
    ? validDate(d?.regEnd ?? reference)
    : kind === "submission" ? validDate(d?.submissionEnd ?? reference) : null;
  let start: string | null;
  let end: string | null;
  if (d && ("eventStart" in d || "eventEnd" in d)) {
    start = validDate(d.eventStart);
    end = validDate(d.eventEnd);
  } else if (kind === "registration" || kind === "submission") {
    // Legacy Devfolio has a genuine start; endDate is registration close.
    // Hack2Skill/Unstop date is registration open/close, not event start.
    start = input.source === "devfolio" && input.date !== input.endDate
      ? validDate(input.date) : null;
    end = null;
  } else {
    start = validDate(input.date);
    end = validDate(input.endDate);
  }
  if (start && end && new Date(end) < new Date(start)) end = null;
  return { start, end, deadline, kind, reference };
}

export function eventDateLabel(input: DatedEvent): string {
  const { start, end } = eventDates(input);
  if (start && end) return formatDateRange(start, end);
  if (start) return `Starts ${formatDateRange(start)}`;
  if (end) return `Ends ${formatDateRange(end)}`;
  return "Event dates not published";
}

export function eventStatus(input: DatedEvent, now = Date.now()): string {
  const { start, end, deadline, kind } = eventDates(input);
  if (deadline) {
    const label = kind === "submission" ? "Submissions" : "Registration";
    return new Date(deadline).getTime() <= now ? `${label} closed` : `${label} open`;
  }
  if (start) return eventTiming(start, end);
  if (end) return new Date(end).getTime() <= now ? "Ended" : `Ends ${relativeFromNow(end).toLowerCase()}`;
  return "Event dates not published";
}

export function isActionable(input: DatedEvent, now = Date.now()): boolean {
  const { start, end, deadline } = eventDates(input);
  const target = deadline ?? end ?? start;
  return target !== null && new Date(target).getTime() > now;
}

export function eventDatePhase(input: DatedEvent) {
  const { start, end } = eventDates(input);
  return start ? eventPhase(start, end) : null;
}
