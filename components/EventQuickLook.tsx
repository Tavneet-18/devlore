"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { buildGlance } from "@/lib/event-summary";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { accentFor, accentTextFor } from "./EventCard";
import type { EventDTO } from "@/lib/events";

/**
 * The quick-look: a card's worth of detail without leaving the index.
 *
 * Built on the native <dialog> element rather than a hand-rolled overlay, and
 * that is the whole design decision. A modal has to do four things — trap Tab
 * inside itself, close on Escape, mark the rest of the page inert to screen
 * readers, and put focus somewhere sensible on open. All four are what
 * showModal() gives you, and all four are exactly where a hand-rolled version
 * silently fails: an overlay that looks modal but lets Tab walk into the
 * invisible page behind it is worse than no overlay, because it looks correct.
 *
 * The facts come from buildGlance(), the same builder the detail page uses, so
 * a field the source never published is omitted here for the same reason and in
 * the same way it is omitted there — no dash, no "TBA", no invented default.
 * There is no fallback prose either: when an event has no brief and no summary,
 * this shows the facts alone rather than writing something to fill the space.
 *
 * Data cost: none. Every field rendered here already arrived with the list
 * payload in EventDTO.details, so opening this is a DOM operation, not a fetch.
 */

export function EventQuickLook({
  event,
  onClose,
}: {
  event: EventDTO | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // The element that opened the dialog, so focus can go back where it came from
  // on close. Without this, closing drops focus to <body> and a keyboard user
  // has to tab the length of the page again to find where they were.
  const opener = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    ref.current?.close();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (event) {
      // document.activeElement at open time is the trigger, which is exactly
      // the element focus should return to.
      opener.current = document.activeElement as HTMLElement | null;
      if (!el.open) el.showModal();
      return;
    }

    if (el.open) el.close();
  }, [event]);

  // `close` fires for Escape, for the backdrop, and for our own close button.
  // All three must put focus back, so the handler lives here rather than on
  // each path.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onNativeClose = () => {
      opener.current?.focus?.();
      onClose();
    };
    el.addEventListener("close", onNativeClose);
    return () => el.removeEventListener("close", onNativeClose);
  }, [onClose]);

  // A click on the backdrop lands on the <dialog> itself, because the backdrop
  // is the dialog's own box. Clicks on the panel bubble from a child, so
  // checking the target distinguishes the two without a wrapper div.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      if (e.target === el) close();
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [close]);

  const glance = event
    ? buildGlance({
        title: event.title,
        date: event.date,
        endDate: event.endDate,
        deadlineKind: event.deadlineKind,
        isOnline: event.isOnline,
        city: event.city,
        details: event.details,
        whoCanJoin: event.whoCanJoin,
      })
    : [];

  // The brief is the model's summary of the source text and is the only prose
  // worth quoting. `summary` is the fallback, and `description` is deliberately
  // not used: it is organiser marketing copy, and this site does not serve it
  // back to a reader.
  const prose = event ? (event.brief ?? event.summary) : null;

  return (
    <dialog
      ref={ref}
      aria-label={event ? `${event.title} — details` : "Event details"}
      className="quick-look w-full border-0 bg-transparent p-0 backdrop:bg-bg/70 backdrop:backdrop-blur-sm"
      onCancel={(e) => {
        // Let the native Escape → close event drive focus restoration rather
        // than duplicating it here.
        e.preventDefault();
        close();
      }}
    >
      <div className="flex max-h-[88svh] flex-col overflow-hidden rounded-t-[14px] border-t border-line-hi bg-surface sm:rounded-[14px] sm:border">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 pb-4 pt-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${accentFor(event?.eventType ?? "")}`}
                aria-hidden
              />
              <span
                className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
                  accentTextFor(event?.eventType ?? "")
                }`}
              >
                {EVENT_TYPE_LABELS[event?.eventType ?? ""] ?? "Event"}
              </span>
            </div>
            <h2 className="mt-2 font-serif text-[22px] leading-tight tracking-[-0.01em] text-ink">
              {event?.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="tap-target -mr-2 -mt-1 shrink-0 rounded-full px-2 py-1 text-[20px] leading-none text-faint transition-colors hover:text-ink"
          >
            <span aria-hidden>&times;</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-5">
          {prose && (
            <p className="font-serif text-[17px] leading-[1.5] text-ink">{prose}</p>
          )}

          {glance.length > 0 && (
            <dl className={prose ? "mt-7 border-t border-line" : "border-t border-line"}>
              {glance.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 border-b border-line py-3 last:border-b-0"
                >
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-faint">{row.label}</dt>
                  <dd className="text-[14px] leading-relaxed text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* Neither prose nor facts: say so plainly rather than showing a panel
              with nothing in it. */}
          {!prose && glance.length === 0 && (
            <p className="text-[14px] text-faint">
              This listing has no details yet. Open the full page to see what the
              source published.
            </p>
          )}
        </div>

        {event && (
          <div className="border-t border-line px-6 py-4">
            <Link
              href={`/events/${event.id}`}
              onClick={close}
              className="tap-target block text-center text-[13px] font-semibold text-primary transition-colors hover:text-[#9b8fff]"
            >
              View full details &rarr;
            </Link>
          </div>
        )}
      </div>
    </dialog>
  );
}