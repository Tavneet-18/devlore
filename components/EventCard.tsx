import Link from "next/link";
import { eventPhase, eventTiming, formatDateRange } from "@/lib/format";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { BookmarkButton } from "./BookmarkButton";
import type { EventDTO } from "@/lib/events";

/**
 * One accent per event type. It appears as a 3px left rule and a small dot
 * so the grid is scannable by colour, without turning into a stack of pills.
 */
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

const FALLBACK_ACCENT = "bg-faint";
const FALLBACK_TEXT = "text-muted";

function Thumb({ event, className = "" }: { event: EventDTO; className?: string }) {
  if (event.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={event.imageUrl}
        alt=""
        loading="lazy"
        className={`shrink-0 overflow-hidden rounded-lg border border-line bg-raised object-cover ${className}`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-lg border border-line bg-raised text-sm font-semibold text-faint ${className}`}
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
      className={`flex items-center justify-center rounded-lg border border-line bg-raised font-semibold text-faint ${className}`}
    >
      {initials}
    </div>
  );
}

export function EventCard({ event, index = 0 }: { event: EventDTO; index?: number }) {
  const accent = TYPE_ACCENT[event.eventType] ?? FALLBACK_ACCENT;
  const accentText = TYPE_TEXT[event.eventType] ?? FALLBACK_TEXT;
  const phase = eventPhase(event.date, event.endDate);
  const timing = eventTiming(event.date, event.endDate);
  const location = event.isOnline ? "Online" : (event.city ?? "TBA");
  const typeLabel = EVENT_TYPE_LABELS[event.eventType] ?? "Event";

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface/70 backdrop-blur-md transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-line-hi hover:shadow-[0_8px_30px_rgba(109,93,246,0.18)]"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className={`absolute bottom-0 left-0 top-0 w-[3px] ${accent}`} aria-hidden />

      <div className="p-5">
        <div className="flex items-start gap-3.5">
          <Thumb event={event} className="h-16 w-16" />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent}`} aria-hidden />
              <span className={`text-xs font-medium ${accentText}`}>{typeLabel}</span>
            </div>
            <p
              className={`mt-1 truncate text-[13px] ${
                phase === "ended" ? "text-faint" : "text-muted"
              }`}
            >
              {location} · {timing}
            </p>
          </div>

          <div className="-mr-1 -mt-1">
            <BookmarkButton eventId={event.id} initialBookmarked={event.bookmarked ?? false} />
          </div>
        </div>

        <div className="mt-3.5">
          <Link href={`/events/${event.id}`} className="block">
            <h2 className="line-clamp-2 text-[17px] font-semibold leading-snug text-ink transition-colors group-hover:text-white">
              {event.title}
            </h2>
          </Link>
          {event.summary && (
            <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-muted">
              {event.summary}
            </p>
          )}
          <p className="mt-2 truncate text-[13px] text-faint">by {event.organizer}</p>
        </div>

        {event.tags.length > 0 && (
          <p className="mt-3 truncate text-[12px] text-faint">{event.tags.slice(0, 4).join(", ")}</p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
        <span className="truncate text-[13px] text-muted">
          {formatDateRange(event.date, event.endDate)}
        </span>
        <Link
          href={`/events/${event.id}`}
          className="shrink-0 text-xs font-semibold text-primary transition-colors hover:text-[#8b7df8]"
        >
          View →
        </Link>
      </div>
    </article>
  );
}
