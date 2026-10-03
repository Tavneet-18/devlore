"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { EventDTO } from "@/lib/events";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { countdown } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { accentFor, accentTextFor } from "./EventCard";
import { MOBILE_WINDOW, useAxisModel, type AxisEvent } from "@/lib/use-axis-model";

/**
 * The axis, turned on its side.
 *
 * On a phone the horizontal band is unusable: 2880px of date across a 342px
 * viewport is a 8.4x sideways drag before the first event appears, and the
 * band alone fills a whole phone screen. Everything spatial about the idea
 * survives being rotated — the date is still the axis, the cards are still
 * positioned by when they close, and NOW still divides past from future. Only
 * the direction changes: dates run down the right-hand rail instead of across
 * the top, and the cards run down beside them.
 *
 * Two things the rotation buys outright:
 *
 * Lane stacking disappears. On desktop, two events closing on the same day
 * have to take separate lanes or they overlap. Here every event gets its own
 * cell in its day's row, so that whole algorithm is gone.
 *
 * The clustering read survives, which was the thing a plain vertical list would
 * have lost: cards clustered around a date *are* the cluster, and several close
 * on one day now sit side by side where a list would have hidden them.
 *
 * Position is the glanceable encoding and the countdown on each card is the
 * exact one, so nothing is ambiguous even where cards are tightly packed.
 *
 * The window is short — two days back, a week ahead — and everything outside it
 * is still on the page. The index below carries the full roster, exactly as it
 * does for the desktop horizon.
 */

/**
 * Cards side by side within a single date before the row wraps.
 *
 * These are written out as literals on purpose. Tailwind's scanner reads source
 * text, so a computed `grid-cols-${n}` produces no rule at all — verified by
 * checking the built CSS. With the rule missing, a date with three events gets
 * no grid columns and the cards stack vertically instead, which is the exact
 * opposite of the point. `MAX_ACROSS` is derived from the list so the two
 * cannot drift.
 */
const COLUMN_CLASSES = ["grid-cols-1", "grid-cols-2", "grid-cols-3"] as const;
const MAX_ACROSS = COLUMN_CLASSES.length;

function columnsFor(count: number): string {
  return COLUMN_CLASSES[Math.min(Math.max(count, 1), MAX_ACROSS) - 1];
}

export function TimeAxisMobile({
  events,
  now: nowIso,
}: {
  events: EventDTO[];
  now: string;
}) {
  // Seeded by the server so the first client render matches the markup.
  const serverNow = useMemo(() => new Date(nowIso).getTime(), [nowIso]);
  const now = useNow(serverNow);

  const axis = useAxisModel(events, now, MOBILE_WINDOW);

  const { days, rowsByDay, monthIndex } = useMemo(() => {
    const byDay = new Map<number, AxisEvent[]>();
    for (const row of axis.inWindow) {
      const list = byDay.get(row.day);
      if (list) list.push(row);
      else byDay.set(row.day, [row]);
    }
    return {
      days: axis.days,
      rowsByDay: byDay,
      monthIndex: new Map(axis.monthStarts.map((m) => [m.index, m.label])),
    };
  }, [axis]);

  const todayStart = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [now]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-faint">Spatial axis</p>
          <p className="mt-1.5 font-serif text-[22px] leading-none tracking-tight text-ink">
            The next {axis.horizonDays} days
          </p>
        </div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-faint">
          {axis.expiringSoon > 0 && `${axis.expiringSoon} expiring this week`}
          {axis.furtherOut > 0 && (
            <span className="mt-1 block normal-case tracking-normal text-faint-dim">
              {axis.furtherOut} closing beyond the horizon — see the index
            </span>
          )}
        </p>
      </div>

      {/*
        One row per date, and each row carries its own date cell. The rail and
        the cards cannot drift out of step because they are the same element,
        rather than two columns pretending to line up.
      */}
      <div className="border-b border-line">
        {days.map((d, i) => {
          const date = new Date(d);
          const rows = rowsByDay.get(d) ?? [];
          const isToday = d === todayStart;
          const month = monthIndex.get(i);

          return (
            <div
              key={d}
              className={`relative flex gap-3 border-t py-2.5 ${
                isToday ? "border-primary" : "border-line"
              }`}
            >
              {isToday && (
                <span className="absolute -top-[6px] left-0 bg-bg pr-1.5 text-[9px] uppercase tracking-[0.2em] text-primary">
                  Now
                </span>
              )}

              {/* Cards for this date, side by side. A day with nothing closing
                  still gets its row: the gap is part of what the axis shows. */}
              <div className={`grid min-w-0 flex-1 content-start gap-2 ${columnsFor(rows.length)}`}>
                {rows.map((row) => (
                  <Link
                    key={row.event.id}
                    href={`/events/${row.event.id}`}
                    className={`tap-target block border px-2 py-2 backdrop-blur-sm transition-colors duration-200 hover:border-line-hi ${
                      row.past ? "bg-raised/20" : "bg-raised/50"
                    } ${row.nearest ? "border-primary/60" : "border-line"}`}
                    style={{ borderRadius: 2 }}
                  >
                    {row.nearest && (
                      <span
                        aria-hidden
                        className="absolute bottom-0 left-0 top-0 w-[3px] bg-closing"
                      />
                    )}
                    <div className="flex items-center gap-1">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${accentFor(row.event.eventType)}`}
                      />
                      <span
                        className={`truncate text-[11px] uppercase tracking-[0.1em] ${accentTextFor(row.event.eventType)}`}
                      >
                        {EVENT_TYPE_LABELS[row.event.eventType] ?? "Event"}
                      </span>
                    </div>
                    <p
                      className={`mt-1 line-clamp-3 font-serif text-[13px] leading-tight ${
                        row.past ? "text-muted" : "text-ink"
                      }`}
                    >
                      {row.event.title}
                    </p>
                    <p
                      className={`mt-1 font-mono text-[11px] uppercase tracking-[0.04em] ${
                        row.past ? "text-faint-dim" : "text-closing"
                      }`}
                    >
                      {countdown(row.event.endDate ?? row.event.date)}
                    </p>
                  </Link>
                ))}
              </div>

              {/* The date rail, on the right. The month is named once, on the
                  first row that falls in it. */}
              <div className="w-7 shrink-0 text-right">
                {month && (
                  <span className="block text-[9px] uppercase tracking-[0.14em] text-faint-dim">
                    {month}
                  </span>
                )}
                <span
                  className={`font-serif text-[15px] leading-tight ${
                    isToday ? "text-primary" : "text-faint"
                  }`}
                >
                  {date.getDate()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}