"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { EventDTO } from "@/lib/events";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { countdown } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import {
  CARD_GAP,
  CARD_TOP,
  CARD_W,
  DAY,
  DESKTOP_WINDOW,
  LANE_H,
  PX_PER_DAY,
  TETHER_FROM,
  WEEKDAYS,
  startOfDay,
  useAxisModel,
} from "@/lib/use-axis-model";
import { accentFor, accentTextFor } from "./EventCard";
import { eventOneLiner, countdownHeading } from "@/lib/event-summary";

/**
 * The line shown on an axis card and in its native tooltip.
 *
 * Same source as the index rows, so the two surfaces cannot drift apart. The
 * facts only — the date is already on the card as a countdown, and repeating
 * it here would crowd a card that is deliberately small.
 */
function axisSkim(event: EventDTO): string | null {
  if (event.brief) return event.brief;
  const line = eventOneLiner({
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
  // Drop the leading date clause: the countdown above already says it.
  return line.includes(" · ") ? line.slice(line.indexOf(" · ") + 3) : line;
}

/** Platform names, so a card says where the listing came from. */
const SOURCE_LABELS: Record<string, string> = {
  devpost: "Devpost",
  unstop: "Unstop",
  gdg: "GDG",
  devfolio: "Devfolio",
  hack2skill: "Hack2Skill",
  wemakedevs: "WeMakeDevs",
  mlh: "MLH",
  manual: "Submitted",
};

/**
 * The spatial time axis.
 *
 * Every other event site on the web is a search interface: a hero, then a
 * grid of cards, each carrying a date. The date is metadata. Here the date
 * is the layout. Events are positioned in space by when they happen, a fixed
 * NOW line divides the past from the future, and the reader scrolls
 * horizontally to move through the coming weeks.
 *
 * It is built entirely on real data — the positions are the events' actual
 * dates, the dimming is whether a deadline has passed, and the countdowns are
 * real. Nothing is decorative.
 */

type Placed = {
  event: EventDTO;
  x: number;
  lane: number;
  past: boolean;
  nearest: boolean;
};

export function TimeAxis({ events, now: nowIso }: { events: EventDTO[]; now: string }) {
  // Seeded by the server so the first client render matches the markup.
  const serverNow = useMemo(() => new Date(nowIso).getTime(), [nowIso]);
  const now = useNow(serverNow);

  // The window, the days, the month boundaries and the counts all come from
  // the shared model so the mobile axis reads the same events as this one.
  // Only the placement below is desktop-specific.
  const axis = useAxisModel(events, now, DESKTOP_WINDOW);

  const model = useMemo(() => {
    const { inWindow, days, monthStarts, rangeStart } = axis;

    const totalDays = days.length;
    const width = totalDays * PX_PER_DAY;

    // Stack into lanes so cards never overlap.
    // This is interval partitioning: each lane remembers the right edge of
    // its last card, and an event takes the first lane that has room.
    const laneEnds: number[] = [];
    const placed: Placed[] = inWindow.map((row) => {
      const x = row.offset * PX_PER_DAY;
      let lane = laneEnds.findIndex((end) => x >= end);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = x + CARD_W + CARD_GAP;
      return { event: row.event, x, lane, past: row.past, nearest: row.nearest };
    });

    const maxLanes = Math.max(1, ...placed.map((p) => p.lane + 1));
    const axisY = Math.max(340, CARD_TOP + maxLanes * LANE_H + 54);
    const bandH = axisY + 96;
    const nowX = Math.min(width, Math.max(0, ((axis.now - rangeStart) / DAY) * PX_PER_DAY));

    const months = monthStarts.map((m) => ({ x: m.index * PX_PER_DAY, label: m.label }));

    const expiringSoon = axis.expiringSoon;
    // Not dropped, just not on the axis — the index carries them.
    const furtherOut = axis.furtherOut;
    const horizonDays = axis.horizonDays;

    return { placed, days, months, width, bandH, axisY, nowX, expiringSoon, horizonDays, furtherOut };
  }, [axis]);

  return (
    <div>
      {/* `flex-wrap` + no `shrink-0` on the caption: the pair used to be a
          single unshrinkable 498px line, which pushed the whole page 131px
          sideways on a phone even though the band itself scrolls fine. Neither
          property can bite above 640px, where the row has room to spare, so
          desktop is untouched. */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-faint">Spatial axis</p>
          <p className="mt-1.5 font-serif text-[24px] leading-none tracking-tight text-ink">
            The next {model.horizonDays} days
          </p>
        </div>
        <p className="text-left text-[10px] uppercase tracking-[0.16em] text-faint sm:text-right">
          {model.expiringSoon > 0 ? `${model.expiringSoon} expiring this week · ` : ""}
          scroll to traverse time <span className="text-primary">→</span>
          {model.furtherOut > 0 && (
            <span className="mt-1 block normal-case tracking-normal text-faint-dim">
              {model.furtherOut} closing beyond the horizon — see the index
            </span>
          )}
        </p>
      </div>

      {/*
        tabIndex is the whole fix. This band is 2880px wide inside a scroller
        whose scrollbar is hidden in both engines, so before this it had no
        focus-order entry, no arrow-key scrolling, and no visual hint that it
        moved at all — the centrepiece of the desktop page was reachable only by
        dragging with a mouse. `role="region"` plus a name is what makes the
        focus announce as something rather than an anonymous group.

        The ring comes from the global :focus-visible rule, so the affordance
        exists only for keyboard users and the design is untouched for everyone
        else.
      */}
      <div
        className="no-scrollbar overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Spatial axis — scroll sideways for later dates"
      >
        <div className="relative" style={{ width: model.width, height: model.bandH }}>
          {/* The past, shaded so the divide reads before the NOW line does. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 bg-ink/[0.02]"
            style={{ width: model.nowX, height: model.bandH }}
          />

          {/* Date labels below the axis. */}
          {model.days.map((d, i) => {
            const date = new Date(d + 5.5 * 3600000);
            const day = date.getUTCDay();
            const isToday = startOfDay(d) === startOfDay(now);
            const dim = day === 0 || day === 6;
            return (
              <div
                key={d}
                className="absolute flex flex-col items-center gap-0.5"
                style={{ left: i * PX_PER_DAY, width: PX_PER_DAY, top: model.axisY + 26 }}
              >
                <span
                  className={`font-serif text-[16px] leading-none ${
                    isToday ? "text-ink" : dim ? "text-faint-dim" : "text-faint"
                  }`}
                >
                  {date.getUTCDate()}
                </span>
                <span className="text-[9px] uppercase tracking-[0.16em] text-faint-dim">
                  {WEEKDAYS[day]}
                </span>
              </div>
            );
          })}

          {/* Month labels across the top, above every card. */}
          {model.months.map((m) => (
            <span
              key={m.label + m.x}
              className="absolute text-[10px] uppercase tracking-[0.22em] text-faint-dim"
              style={{ left: m.x + 2, top: 0 }}
            >
              {m.label}
            </span>
          ))}

          {/* The axis itself. */}
          <div
            aria-hidden
            className="absolute left-0 right-0 h-px bg-line"
            style={{ top: model.axisY }}
          />

          {/* Events, floating above the axis and tethered to their date. */}
          {model.placed.map((p) => {
            const top = CARD_TOP + p.lane * LANE_H;
            // The tether starts at a nominal 84px, short of the card's real
            // bottom (131–164px). That reads correctly only because the card is
            // painted over the shortfall, so the visible line runs from the
            // card's true bottom to the axis. See LANE_H in lib/use-axis-model
            // for why there is deliberately no CARD_H constant.
            const tether = model.axisY - top - TETHER_FROM;
            return (
              <div
                key={p.event.id}
                className="absolute"
                style={{ left: p.x, top, width: CARD_W }}
              >
                <div
                  aria-hidden
                  className="absolute left-1/2 w-px bg-line"
                  style={{ top: TETHER_FROM, height: Math.max(0, tether) }}
                />
                <Link
                  href={`/events/${p.event.id}`}
                  /* A closed deadline is de-emphasised by swapping ink for
                     muted on the parts that carry text, not by dropping the
                     whole card's opacity. opacity-30 compounded with the
                     translucent surface and put the title at ~2.9:1 — it
                     disappeared, and a past event is still something you might
                     want to open to see when it ran. */
                  className={`block border px-3 py-2.5 backdrop-blur-sm transition-colors duration-200 hover:border-line-hi ${
                    p.past ? "bg-raised/20" : "bg-raised/50"
                  } ${p.nearest ? "border-primary/60" : "border-line"}`}
                  style={{ borderRadius: 2 }}
                >
                  {p.nearest && (
                    <span
                      aria-hidden
                      className="absolute bottom-0 left-0 top-0 w-[3px] bg-closing"
                    />
                  )}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${accentFor(p.event.eventType)}`}
                    />
                    <span
                      className={`text-[9px] uppercase tracking-[0.14em] ${accentTextFor(p.event.eventType)}`}
                    >
                      {EVENT_TYPE_LABELS[p.event.eventType] ?? "Event"}
                    </span>
                  </div>
                  <p
                    className={`mt-1.5 line-clamp-2 font-serif text-[13.5px] leading-snug ${
                      p.past ? "text-muted" : "text-ink"
                    }`}
                  >
                    {p.event.title}
                  </p>
                  <p
                    className={`mt-1.5 font-mono text-[10px] uppercase tracking-[0.06em] ${
                      p.past ? "text-faint-dim" : "text-closing"
                    }`}
                  >
                    {countdown(p.event.endDate ?? p.event.date)}
                  </p>
                  {/* Which date that countdown measures, and where it came
                      from. Two of the four sources publish no registration
                      deadline, so this is not a cosmetic label. */}
                  <p className="mt-0.5 truncate text-[9px] uppercase tracking-[0.1em] text-faint-dim">
                    {countdownHeading(p.event) ?? "Closed"}
                    {" · "}
                    {SOURCE_LABELS[p.event.source] ?? p.event.source}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.1em] text-faint">
                    {p.event.isOnline ? "Online" : p.event.city ?? "TBA"}
                  </p>
                  {/* The skim line, so a card carries enough to decide on
                      without opening it. Rendered inside a native title
                      attribute as well, which is what actually appears as a
                      tooltip on desktop. */}
                  {axisSkim(p.event) && (
                    <p
                      className="mt-1 line-clamp-2 text-[10px] leading-snug text-faint"
                      title={axisSkim(p.event) ?? undefined}
                    >
                      {axisSkim(p.event)}
                    </p>
                  )}
                </Link>
              </div>
            );
          })}

          {/* NOW. Fixed to the viewport while the axis scrolls beneath it.
              Zero-width so `left` places the line precisely rather than
              shifting a full-width box off the right edge. */}
          <div className="sticky top-0 z-20 h-0 w-0" style={{ left: model.nowX }}>
            <div
              aria-hidden
              className="w-px bg-primary shadow-[0_0_14px_rgba(124,107,255,0.55)]"
              style={{ height: model.bandH }}
            />
            <div
              aria-hidden
              className="absolute h-1.5 w-1.5 rounded-full bg-primary"
              style={{ left: -3, top: model.axisY - 3 }}
            />
            <span className="absolute text-[9px] uppercase tracking-[0.2em] text-primary" style={{ left: -12, top: 4 }}>
              Now
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
