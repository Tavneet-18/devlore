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
      className={`flex items-center justify-center bg-gradient-to-br from-primary/30 via-raised to-primary-2/20 text-sm font-semibold text-ink/80 ${radius} ${className}`}
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

/**
 * The interactive row lives in components/IndexRow.tsx, not here.
 *
 * That separation is load-bearing rather than tidy. This module has no "use
 * client", so the server-rendered detail page can import the poster from it.
 * When IndexRow carried its click handlers in here, that page could no longer
 * render — a server component cannot render a component holding event handlers,
 * and every /events/[id] request returned 500. Keeping the presentational parts
 * here and the interactive row in its own "use client" module is what lets both
 * coexist.
 */
