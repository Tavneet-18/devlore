import Link from "next/link";
import { eventPhase, eventTiming, formatDateRange } from "@/lib/format";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { BookmarkButton } from "./BookmarkButton";
import { eventOneLiner } from "@/lib/event-summary";
import type { EventDTO } from "@/lib/events";

const TYPE_ACCENT: Record<string, string> = {
  hackathon: "bg-t-hackathon",
  meetup: "bg-t-meetup",
  workshop: "bg-t-workshop",
  webinar: "bg-t-webinar",
  conference: "bg-t-conference",
  "career-fair": "bg-t-career",
};

const TYPE_TEXT: Record<string, string> = {
  hackathon: "text-t-hackathon",
  meetup: "text-t-meetup",
  workshop: "text-t-workshop",
  webinar: "text-t-webinar",
  conference: "text-t-conference",
  "career-fair": "text-t-career",
};

export const accentFor = (type: string) => TYPE_ACCENT[type] ?? "bg-faint";
export const accentTextFor = (type: string) => TYPE_TEXT[type] ?? "text-muted";

export function Poster({
  event,
  className = "",
  radius = "rounded-[2px]",
}: {
  event: EventDTO;
  className?: string;
  radius?: string;
}) {
  if (event.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={event.imageUrl}
        alt=""
        loading="lazy"
        className={`object-cover ${radius} ${className}`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`flex items-center justify-center bg-gradient-to-br from-primary/30 via-raised to-primary-2/20 text-sm font-semibold text-ink/60 ${radius} ${className}`}
    >
      {event.title.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function EventPoster({
  src,
  alt,
  initials,
  className = "",
}: {
  src: string | null;
  alt: string;
  initials: string;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={`rounded-lg border border-line bg-raised object-cover ${className}`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`flex items-center justify-center rounded-lg border border-line bg-gradient-to-br from-primary/30 via-raised to-primary-2/20 text-sm font-semibold text-ink/60 ${className}`}
    >
      {initials}
    </div>
  );
}


/* -------------------------------------------------------------------------- */
/* The index — numbered rows separated by hairlines.                          */
/* A hairline is the container. No boxes, no shadows.                         */
/* -------------------------------------------------------------------------- */

/**
 * The one line that lets a reader decide without opening the event.
 *
 * The brief is preferred because it is written prose. It is null for every
 * currently-ingested event — no source publishes description text — so the
 * fallback is the assembled fact line, which is real in every case. Returns
 * null rather than an empty string so the caller can omit the element entirely
 * instead of leaving a gap.
 */
function skimmable(event: EventDTO): string | null {
  if (event.brief) return event.brief;
  return eventOneLiner({
    title: event.title,
    date: event.date,
    endDate: event.endDate,
    deadlineKind: event.deadlineKind,
    isOnline: event.isOnline,
    city: event.city,
    details: event.details,
    whoCanJoin: event.whoCanJoin,
  });
}

export function IndexRow({ event, index }: { event: EventDTO; index: number }) {
  const accent = accentFor(event.eventType);
  const accentText = accentTextFor(event.eventType);
  const phase = eventPhase(event.date, event.endDate);
  const location = event.isOnline ? "Online" : (event.city ?? "TBA");
  const typeLabel = EVENT_TYPE_LABELS[event.eventType] ?? "Event";

  return (
    <div className="group grid grid-cols-[1.5rem_64px_minmax(0,1fr)_auto] items-center gap-4 border-t border-line py-5 transition-colors duration-200 hover:border-line-hi sm:grid-cols-[2.25rem_96px_minmax(0,1fr)_auto_auto] sm:gap-5 sm:py-6">
      <span className="font-mono text-[13px] text-faint">
        {String(index).padStart(2, "0")}
      </span>

      <Poster
        event={event}
        radius="rounded-[2px]"
        className="h-16 w-16 transition-transform duration-300 group-hover:scale-[1.04] sm:h-24 sm:w-24"
      />

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent}`} aria-hidden />
          <span className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${accentText}`}>
            {typeLabel}
          </span>
        </div>
        <Link href={`/events/${event.id}`} className="mt-1.5 block">
          <h3 className="line-clamp-1 font-serif text-[23px] font-normal leading-tight tracking-[-0.005em] text-ink transition-colors group-hover:text-white">
            {event.title}
          </h3>
        </Link>
        {event.summary && (
          <p className="mt-1 line-clamp-1 text-[14px] text-muted">{event.summary}</p>
        )}
        {/* The skim line. Prefers the generated brief and otherwise states the
            structured facts, so a reader can tell team size, fee and mode
            without opening the page. Null when neither exists, and the row
            simply shows nothing rather than a placeholder. */}
        {skimmable(event) && (
          <p className="mt-1 line-clamp-1 text-[13px] text-faint">{skimmable(event)}</p>
        )}
        {/* Mobile-only: the right-hand metadata column is hidden below sm, so
            the facts and the deadline have to appear here or they are simply
            unavailable on a phone. */}
        <p className="mt-2 text-[12px] text-faint sm:hidden">
          {location} · {formatDateRange(event.date, event.endDate)}
        </p>
        <p className={`mt-0.5 text-[12px] sm:hidden ${phase === "ended" ? "text-faint" : "text-closing"}`}>
          {eventTiming(event.date, event.endDate)}
        </p>
      </div>

      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-[13px] text-muted">{location}</p>
        <p className="text-[13px] text-faint">{formatDateRange(event.date, event.endDate)}</p>
        <p className={`mt-1 text-[12px] ${phase === "ended" ? "text-faint" : "text-closing"}`}>
          {eventTiming(event.date, event.endDate)}
        </p>
        <Link
          href={`/events/${event.id}`}
          className="mt-2 inline-block text-[13px] font-semibold text-primary transition-colors hover:text-[#9b8fff]"
        >
          View →
        </Link>
      </div>

      {/* Saving has to be reachable from the browse page, not only from the
          detail page — otherwise it costs an extra click per event. It sits in
          its own column rather than inside the metadata column so it stays
          reachable on mobile too, and gives the saved page a way to unsave. */}
      <BookmarkButton eventId={event.id} initialBookmarked={event.bookmarked ?? false} />
    </div>
  );
}
