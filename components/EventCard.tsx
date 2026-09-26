import Link from "next/link";
import { eventPhase, eventTiming, formatDateRange } from "@/lib/format";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { BookmarkButton } from "./BookmarkButton";
import type { EventDTO } from "@/lib/events";

/**
 * Square 64px artwork with a text-initial fallback. Source posters are
 * 200x200, so they are never cropped or stretched here.
 */
function Thumb({ event }: { event: EventDTO }) {
  if (event.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={event.imageUrl}
        alt=""
        loading="lazy"
        className="h-16 w-16 shrink-0 rounded-md border border-line object-cover"
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-line bg-raised text-[13px] font-medium text-faint"
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
        className={`rounded-md border border-line object-cover ${className}`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`flex items-center justify-center rounded-md border border-line bg-raised font-medium text-faint ${className}`}
    >
      {initials}
    </div>
  );
}

export function EventCard({ event, index = 0 }: { event: EventDTO; index?: number }) {
  const phase = eventPhase(event.date, event.endDate);
  const timing = eventTiming(event.date, event.endDate);
  const location = event.isOnline ? "Online" : (event.city ?? "TBA");
  const typeLabel = EVENT_TYPE_LABELS[event.eventType] ?? event.eventType;

  return (
    <article
      className="group relative flex flex-col rounded-lg border border-line bg-surface transition-colors duration-150 hover:border-[#2e2e36] hover:bg-raised"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="flex items-start gap-4 p-4">
        <Thumb event={event} />

        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.06em] text-faint">{typeLabel}</div>
          <div
            className={`mt-1 truncate text-[13px] ${
              phase === "ended" ? "text-faint" : "text-muted"
            }`}
          >
            {location} · {timing}
          </div>
        </div>

        <BookmarkButton eventId={event.id} initialBookmarked={event.bookmarked ?? false} />
      </div>

      <div className="px-4">
        <Link href={`/events/${event.id}`} className="block">
          <h3 className="text-[17px] font-semibold leading-snug tracking-tight text-ink transition-colors group-hover:text-accent-soft">
            {event.title}
          </h3>
        </Link>
        {event.summary && (
          <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-muted">
            {event.summary}
          </p>
        )}
        <p className="mt-2 truncate text-[13px] text-faint">by {event.organizer}</p>

        {event.tags.length > 0 && (
          <p className="mt-3 truncate text-[12px] text-faint">
            {event.tags.slice(0, 4).join(", ")}
          </p>
        )}
      </div>

      <div className="mt-auto flex items-center gap-3 border-t border-line px-4 py-3">
        <span className="truncate text-[13px] text-muted">
          {formatDateRange(event.date, event.endDate)}
        </span>
        <Link
          href={`/events/${event.id}`}
          className="ml-auto shrink-0 text-[13px] font-medium text-ink transition-colors hover:text-accent-soft"
        >
          View
        </Link>
      </div>
    </article>
  );
}
