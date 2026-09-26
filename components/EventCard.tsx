import Link from "next/link";
import { eventPhase, eventTiming, formatDateRange } from "@/lib/format";
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

/** Poster or a generated gradient so the slot is never empty. */
export function Poster({
  event,
  className = "",
  iconSize = "text-4xl",
}: {
  event: EventDTO;
  className?: string;
  iconSize?: string;
}) {
  if (event.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={event.imageUrl}
        alt=""
        loading="lazy"
        className={`object-cover ${className}`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`flex items-center justify-center bg-gradient-to-br from-primary/30 via-raised to-primary-2/20 font-semibold text-ink/70 ${iconSize} ${className}`}
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
        className={`rounded-xl border border-line bg-raised object-cover ${className}`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`flex items-center justify-center rounded-xl border border-line bg-gradient-to-br from-primary/30 via-raised to-primary-2/20 font-semibold text-ink/70 ${className}`}
    >
      {initials}
    </div>
  );
}

/**
 * The lead story. One per page, given the full width so the grid below it
 * has something to be measured against. This asymmetry is what stops the
 * page reading as a dashboard.
 */
export function FeaturedCard({ event }: { event: EventDTO }) {
  const accent = accentFor(event.eventType);
  const accentText = accentTextFor(event.eventType);
  const phase = eventPhase(event.date, event.endDate);
  const location = event.isOnline ? "Online" : (event.city ?? "TBA");
  const typeLabel = EVENT_TYPE_LABELS[event.eventType] ?? "Event";

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-line bg-surface/60 backdrop-blur-md transition-all duration-300 ease-out hover:border-line-hi hover:shadow-[0_18px_60px_rgba(109,93,246,0.22)]">
      <div className="grid grid-cols-1 md:grid-cols-[1.05fr_1fr]">
        <div className="relative min-h-[260px] overflow-hidden md:min-h-[380px]">
          <Poster event={event} className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-[1.03]" />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-surface via-surface/25 to-transparent md:bg-gradient-to-r md:from-transparent md:via-surface/10 md:to-surface/85"
          />
          <div className={`absolute left-0 top-0 h-full w-[3px] ${accent}`} aria-hidden />
        </div>

        <div className="flex flex-col justify-center gap-4 p-7 md:p-9">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${accent}`} aria-hidden />
            <span className={`text-xs font-semibold uppercase tracking-[0.08em] ${accentText}`}>
              {typeLabel}
            </span>
            <span className="text-[11px] uppercase tracking-[0.08em] text-faint">
              Closing soonest
            </span>
          </div>

          <Link href={`/events/${event.id}`} className="block">
            <h2 className="text-[30px] font-bold leading-[1.12] tracking-tight text-ink transition-colors group-hover:text-white md:text-[36px]">
              {event.title}
            </h2>
          </Link>

          {event.summary && (
            <p className="text-[15px] leading-relaxed text-muted">{event.summary}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-faint">
            <span className={phase === "ended" ? "text-faint" : "text-muted"}>
              {location} · {eventTiming(event.date, event.endDate)}
            </span>
            <span>by {event.organizer}</span>
            <span>{formatDateRange(event.date, event.endDate)}</span>
          </div>

          <div className="mt-1 flex items-center gap-3">
            <Link
              href={`/events/${event.id}`}
              className="glow-primary inline-flex items-center rounded-lg bg-gradient-to-r from-primary to-primary-2 px-5 py-2.5 text-sm font-semibold text-bg transition-all duration-200 hover:brightness-105"
            >
              View event
            </Link>
            <BookmarkButton eventId={event.id} initialBookmarked={event.bookmarked ?? false} />
          </div>
        </div>
      </div>
    </article>
  );
}

/** Editorial row: real imagery at a size worth looking at. */
export function EventCard({ event, index = 0 }: { event: EventDTO; index?: number }) {
  const accent = accentFor(event.eventType);
  const accentText = accentTextFor(event.eventType);
  const phase = eventPhase(event.date, event.endDate);
  const location = event.isOnline ? "Online" : (event.city ?? "TBA");
  const typeLabel = EVENT_TYPE_LABELS[event.eventType] ?? "Event";

  return (
    <article
      className="group relative flex gap-0 overflow-hidden rounded-2xl border border-line bg-surface/60 backdrop-blur-md transition-all duration-300 ease-out hover:border-line-hi hover:shadow-[0_14px_44px_rgba(109,93,246,0.18)]"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className={`absolute bottom-0 left-0 top-0 w-[3px] ${accent}`} aria-hidden />

      <div className="relative hidden w-[168px] shrink-0 overflow-hidden sm:block">
        <Poster event={event} className="h-full w-full transition-transform duration-500 group-hover:scale-105" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-5">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent}`} aria-hidden />
          <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${accentText}`}>
            {typeLabel}
          </span>
          <span className="truncate text-[12px] text-faint">· {location}</span>
          <div className="ml-auto">
            <BookmarkButton eventId={event.id} initialBookmarked={event.bookmarked ?? false} />
          </div>
        </div>

        <Link href={`/events/${event.id}`} className="mt-2.5 block">
          <h3 className="text-[20px] font-semibold leading-snug tracking-tight text-ink transition-colors group-hover:text-white">
            {event.title}
          </h3>
        </Link>

        {event.summary && (
          <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-muted">
            {event.summary}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-[12px] text-faint">
          <span>by {event.organizer}</span>
          <span
            className={
              phase === "ended" ? "text-faint" : "font-medium text-muted"
            }
          >
            {eventTiming(event.date, event.endDate)}
          </span>
          {event.tags.length > 0 && <span className="truncate">{event.tags.slice(0, 3).join(", ")}</span>}
          <Link
            href={`/events/${event.id}`}
            className="ml-auto shrink-0 text-[13px] font-semibold text-primary transition-colors hover:text-[#8b7df8]"
          >
            View →
          </Link>
        </div>
      </div>
    </article>
  );
}
