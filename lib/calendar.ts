import { DISPLAY_TIMEZONE, DISPLAY_TZ_LABEL } from "./format";

/**
 * Calendar links for the one date that is actually a deadline.
 *
 * Both builders return null unless `deadlineKind === "registration"`.
 *
 * That guard is the point of the file. A calendar entry is a commitment the
 * reader makes to themselves, and adding a hackathon's *finish* date to their
 * calendar as though it were the registration deadline would be a small lie
 * that shows up in a place the reader trusts — their own calendar. For
 * WeMakeDevs and MLH, which publish no registration deadline, there is
 * therefore no "add to calendar" button at all.
 */

/** Compact UTC form iCalendar requires: 20261030T153000Z */
function icsStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
}

/** Escape the five characters that would otherwise break a VEVENT value. */
function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export type CalendarEvent = {
  title: string;
  /** The registration deadline. Required — see the note above. */
  deadlineIso: string;
  deadlineKind: string | null | undefined;
  /** Human date, rendered in IST, used as the all-day description. */
  deadlineLabel: string;
  link?: string | null;
  /** Extra lines, e.g. team size and fee. Omitted lines are not written. */
  notes?: string[];
};

function isRealDeadline(deadlineKind: string | null | undefined): boolean {
  return deadlineKind === "registration";
}

/**
 * A downloadable .ics for the registration deadline.
 *
 * Line endings are CRLF and the file ends with one, because that is what the
 * RFC requires; several calendar apps silently reject a file that does not
 * have both.
 */
export function buildIcs(event: CalendarEvent): string | null {
  if (!isRealDeadline(event.deadlineKind)) return null;
  const stamp = icsStamp(event.deadlineIso);
  if (!stamp) return null;

  // Built with real newlines; icsEscape turns each into the literal "\n" that
  // iCalendar requires. Joining with "\\n" here instead would then be escaped a
  // second time into "\\\\n".
  const description = [
    `Registration closes ${event.deadlineLabel} (${DISPLAY_TZ_LABEL}).`,
    ...(event.notes ?? []),
    event.link ? `Listing: ${event.link}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Devlore//Event deadline//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${stamp}-${icsEscape(event.title).slice(0, 40).replace(/\s/g, "-")}@devlore`,
    // A deadline is an instant, not an all-day span, so a timed event with an
    // alarm is the honest representation.
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${stamp}`,
    `DTEND:${stamp}`,
    `SUMMARY:${icsEscape(`${event.title} — registration closes`)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    event.link ? `URL:${icsEscape(event.link)}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(`${event.title} — registration closes tomorrow`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return `${lines.join("\r\n")}\r\n`;
}

/** A Google Calendar "add event" URL. Returns null on the same condition. */
export function googleCalendarUrl(event: CalendarEvent): string | null {
  if (!isRealDeadline(event.deadlineKind)) return null;
  const d = new Date(event.deadlineIso);
  if (Number.isNaN(d.getTime())) return null;

  // Google wants local wall-clock text. The date is rendered in IST because
  // that is the timezone the whole site displays in, and handing Google a UTC
  // string here would put the reminder at the wrong hour for the reader.
  const local = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: DISPLAY_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d)
  );

  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${local.getFullYear()}${pad(local.getMonth() + 1)}${pad(local.getDate())}T${pad(
    local.getHours()
  )}${pad(local.getMinutes())}00`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${event.title} — registration closes`,
    // ctz declares the timezone the stamp is written in, so Google does not
    // re-interpret the local wall-clock time as the viewer's own zone.
    ctz: DISPLAY_TIMEZONE,
    dates: `${stamp}/${stamp}`,
    details: [
      `Registration closes ${event.deadlineLabel} (${DISPLAY_TZ_LABEL}).`,
      ...(event.notes ?? []),
    ]
      .filter(Boolean)
      .join("\n"),
    ...(event.link ? { location: event.link } : {}),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
