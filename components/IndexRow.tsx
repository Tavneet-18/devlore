"use client";

import Link from "next/link";
import { BookmarkButton } from "./BookmarkButton";
import { Poster, accentFor, accentTextFor } from "./EventCard";
import { eventDateLabel, eventStatus, isActionable } from "@/lib/event-dates";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { eventOneLiner } from "@/lib/event-summary";
import type { EventDTO } from "@/lib/events";

/**
 * One index row, and the quick-look trigger.
 *
 * "use client" is load-bearing here, not decorative. This row carries click
 * handlers, so it cannot live in components/EventCard.tsx: that module has no
 * client directive, because the server-rendered detail page imports the poster
 * from it, and a server component cannot render a component that carries event
 * handlers. Putting the row here keeps the presentational module renderable from
 * both sides while this one is free to be interactive.
 *
 * The server detail page still renders this at app/events/[id]/page.tsx:372, so
 * every prop crossing into it must stay serialisable. `onQuickLook` is a
 * function, which is exactly why it is optional: the server passes neither it
 * nor anything else non-serialisable, and the row falls back to a plain link.
 */
export function IndexRow({
  event,
  index,
  onQuickLook,
}: {
  event: EventDTO;
  index: number;
  onQuickLook?: (event: EventDTO) => void;
}) {
  const accent = accentFor(event.eventType);
  const accentText = accentTextFor(event.eventType);
  const active = isActionable(event);
  const location = event.isOnline ? "Online" : (event.city ?? "TBA");
  const typeLabel = EVENT_TYPE_LABELS[event.eventType] ?? "Event";

  /**
   * The whole row is the click target, but a row also contains a real link and
   * the bookmark button, and those must keep their own behaviour. Rather than
   * nesting interactive elements — which is invalid HTML and produces the worst
   * possible focus order — the row is a plain div whose handler ignores clicks
   * that land on something already interactive.
   *
   * Keyboard users never depend on this path: the title is a real <button>,
   * which is what Tab and a screen reader actually reach.
   */
  const onRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onQuickLook) return;
    if ((e.target as HTMLElement).closest("a, button, input, label")) return;
    onQuickLook(event);
  };

  return (
    <div
      onClick={onRowClick}
      className={`group grid grid-cols-[1.5rem_64px_minmax(0,1fr)_auto] items-center gap-4 border-t border-line py-5 transition-colors duration-200 hover:border-line-hi sm:grid-cols-[2.25rem_96px_minmax(0,1fr)_auto_auto] sm:gap-5 sm:py-6${
        onQuickLook ? " cursor-pointer" : ""
      }`}
    >
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
        {onQuickLook ? (
          <button
            type="button"
            onClick={() => onQuickLook(event)}
            aria-haspopup="dialog"
            className="tap-target mt-1.5 block w-full text-left"
          >
            <h3 className="line-clamp-1 font-serif text-[23px] font-normal leading-tight tracking-[-0.005em] text-ink transition-colors group-hover:text-white">
              {event.title}
            </h3>
          </button>
        ) : (
          <Link href={`/events/${event.id}`} className="tap-target mt-1.5 block">
            <h3 className="line-clamp-1 font-serif text-[23px] font-normal leading-tight tracking-[-0.005em] text-ink transition-colors group-hover:text-white">
              {event.title}
            </h3>
          </Link>
        )}
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
          {location} · {eventDateLabel(event)}
        </p>
        <p className={`mt-0.5 text-[12px] sm:hidden ${!active ? "text-faint" : "text-closing"}`}>
          {eventStatus(event)}
        </p>
      </div>

      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-[13px] text-muted">{location}</p>
        <p className="text-[13px] text-faint">{eventDateLabel(event)}</p>
        <p className={`mt-1 text-[12px] ${!active ? "text-faint" : "text-closing"}`}>
          {eventStatus(event)}
        </p>
        <Link
          href={`/events/${event.id}`}
          className="tap-target mt-2 inline-block text-[13px] font-semibold text-primary transition-colors hover:text-[#9b8fff]"
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

/** The one line that lets a reader decide without opening the event. */
function skimmable(event: EventDTO): string | null {
  if (event.brief) return event.brief;
  return eventOneLiner({
    title: event.title,
    source: event.source,
    date: event.date,
    endDate: event.endDate,
    deadlineKind: event.deadlineKind,
    isOnline: event.isOnline,
    city: event.city,
    details: event.details,
    whoCanJoin: event.whoCanJoin,
  });
}