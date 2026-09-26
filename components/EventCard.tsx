import Link from "next/link";
import { countdown, eventPhase, eventTiming, formatDateRange } from "@/lib/format";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { BookmarkButton } from "./BookmarkButton";
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
  radius = "rounded-lg",
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
/* Lead story — the event closest to its deadline, treated as the front page.  */
/* -------------------------------------------------------------------------- */

export function LeadStory({ event }: { event: EventDTO }) {
  const accent = accentFor(event.eventType);
  const accentText = accentTextFor(event.eventType);
  const phase = eventPhase(event.date, event.endDate);
  const location = event.isOnline ? "Online" : (event.city ?? "TBA");
  const typeLabel = EVENT_TYPE_LABELS[event.eventType] ?? "Event";
  const target = phase === "ongoing" && event.endDate ? event.endDate : event.date;
  const closed = phase === "ended";

  return (
    <article className="group grid grid-cols-1 gap-8 md:grid-cols-[1.15fr_1fr] md:items-center">
      <div className="relative min-h-[240px] overflow-hidden rounded-lg border border-line md:min-h-[360px]">
        <Poster event={event} radius="rounded-lg" className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-[1.02]" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-bg/70 to-transparent md:bg-gradient-to-r md:from-transparent md:to-bg/50"
        />
        <div className={`absolute bottom-0 left-0 top-0 w-[3px] ${accent}`} aria-hidden />
      </div>

      <div>
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${accent}`} aria-hidden />
          <span className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${accentText}`}>
            {typeLabel}
          </span>
        </div>

        <Link href={`/events/${event.id}`} className="mt-4 block">
          <h2 className="text-[34px] font-bold leading-[1.1] tracking-tight text-ink transition-colors group-hover:text-white sm:text-[40px]">
            {event.title}
          </h2>
        </Link>

        {event.summary && (
          <p className="mt-4 text-[15px] leading-[1.65] text-muted">{event.summary}</p>
        )}

        <p className="mt-4 text-[13px] text-faint">
          {location} · by {event.organizer} · {event.viewCount.toLocaleString()}{" "}
          {event.viewCount === 1 ? "view" : "views"}
        </p>

        <div className="mt-7 flex flex-wrap items-end gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-faint">
              {closed ? "Closed" : phase === "ongoing" ? "Registration closes in" : "Starts in"}
            </p>
            <p className="mt-1 font-mono text-[28px] font-semibold tracking-tight text-ink">
              {countdown(target)}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/events/${event.id}`}
              className="glow-primary inline-flex items-center rounded-lg bg-gradient-to-r from-primary to-primary-2 px-5 py-2.5 text-sm font-semibold text-bg transition-all duration-200 hover:brightness-105"
            >
              Reserve a pass
            </Link>
            <BookmarkButton eventId={event.id} initialBookmarked={event.bookmarked ?? false} />
          </div>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* The index — numbered rows separated by hairlines.                          */
/* A hairline is the container. No boxes, no shadows.                         */
/* -------------------------------------------------------------------------- */

export function IndexRow({ event, index }: { event: EventDTO; index: number }) {
  const accent = accentFor(event.eventType);
  const accentText = accentTextFor(event.eventType);
  const phase = eventPhase(event.date, event.endDate);
  const location = event.isOnline ? "Online" : (event.city ?? "TBA");
  const typeLabel = EVENT_TYPE_LABELS[event.eventType] ?? "Event";

  return (
    <div className="group grid grid-cols-[2.25rem_96px_minmax(0,1fr)_auto] items-center gap-5 border-t border-line py-6 transition-colors duration-200 hover:border-line-hi">
      <span className="font-mono text-[13px] text-faint">
        {String(index).padStart(2, "0")}
      </span>

      <Poster
        event={event}
        radius="rounded-md"
        className="h-24 w-24 transition-transform duration-300 group-hover:scale-[1.04]"
      />

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent}`} aria-hidden />
          <span className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${accentText}`}>
            {typeLabel}
          </span>
        </div>
        <Link href={`/events/${event.id}`} className="mt-1.5 block">
          <h3 className="line-clamp-1 text-[22px] font-semibold leading-tight tracking-tight text-ink transition-colors group-hover:text-white">
            {event.title}
          </h3>
        </Link>
        {event.summary && (
          <p className="mt-1 line-clamp-1 text-[14px] text-muted">{event.summary}</p>
        )}
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
    </div>
  );
}
