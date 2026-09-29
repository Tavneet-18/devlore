"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { EventDTO } from "@/lib/events";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { countdown, deadlineLabel, eventPhase } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { accentFor, accentTextFor } from "./EventCard";
import { eventOneLiner } from "@/lib/event-summary";

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

const DAY = 86400000;
const PX_PER_DAY = 96;
const PAST_DAYS = 2;
const FUTURE_DAYS = 28;

const CARD_W = 196;
const CARD_H = 84;
const LANE_H = 108;
const CARD_GAP = 20;
const CARD_TOP = 34;

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

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

  const model = useMemo(() => {
    const todayStart = startOfDay(now);
    const rangeStart = todayStart - PAST_DAYS * DAY;

    const deadlineOf = (e: EventDTO) =>
      e.endDate ? new Date(e.endDate).getTime() : new Date(e.date).getTime();

    // Filter on the DEADLINE, matching how cards are positioned below.
    // Filtering on the start date let an event that opened inside the window
    // but closes weeks later render past the right edge, stretching the band
    // to 5188px for a 2880px horizon.
    const inWindow = events.filter(
      (e) => deadlineOf(e) >= rangeStart && deadlineOf(e) <= rangeEnd
    );

    // A FIXED horizon. This used to stretch to fit the furthest deadline, and
    // a single event closing in seven weeks stretched the band to 6480px with
    // thirteen events marooned across it — mostly empty space. The axis is a
    // near-term view; anything past the horizon simply lives in the index
    // instead, which already carries the full roster.
    const rangeEnd = todayStart + FUTURE_DAYS * DAY;
    const totalDays = Math.ceil((rangeEnd - rangeStart) / DAY);
    const width = totalDays * PX_PER_DAY;

    // The single nearest future deadline gets emphasised.
    const future = inWindow.filter((e) => deadlineOf(e) >= now);
    const nearestId = future.length
      ? future.reduce((a, b) => (deadlineOf(a) <= deadlineOf(b) ? a : b)).id
      : null;

    // Position by deadline, then stack into lanes so cards never overlap.
    // This is interval partitioning: each lane remembers the right edge of
    // its last card, and an event takes the first lane that has room.
    //
    // The deadline, not the start, is the date a reader can act on. It is
    // also what every countdown on the page already shows. Positioning by the
    // start instead collapses every event that opened weeks ago but is still
    // open onto the left edge, where they stack into a tower.
    const sorted = [...inWindow].sort((a, b) => deadlineOf(a) - deadlineOf(b));
    const laneEnds: number[] = [];
    const placed: Placed[] = sorted.map((e) => {
      const when = deadlineOf(e);
      const x = Math.max(0, ((startOfDay(when) - rangeStart) / DAY) * PX_PER_DAY);
      let lane = laneEnds.findIndex((end) => x >= end);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = x + CARD_W + CARD_GAP;
      return { event: e, x, lane, past: deadlineOf(e) < now, nearest: e.id === nearestId };
    });

    const maxLanes = Math.max(1, ...placed.map((p) => p.lane + 1));
    const axisY = Math.max(340, CARD_TOP + maxLanes * LANE_H + 54);
    const bandH = axisY + 96;
    const nowX = Math.min(width, Math.max(0, ((now - rangeStart) / DAY) * PX_PER_DAY));

    const days = Array.from({ length: totalDays }, (_, i) => rangeStart + i * DAY);
    const horizonDays = Math.round((rangeEnd - todayStart) / DAY);

    // Month labels, rendered once at each month boundary inside the range.
    const months: { x: number; label: string }[] = [];
    let lastMonth = -1;
    days.forEach((d, i) => {
      const m = new Date(d).getMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        months.push({ x: i * PX_PER_DAY, label: MONTHS[m] });
      }
    });

    const expiringSoon = future.filter((e) => deadlineOf(e) - now < 7 * DAY).length;
    // Not dropped, just not on the axis — the index carries them.
    const furtherOut = events.filter((e) => deadlineOf(e) > rangeEnd).length;

    return { placed, days, months, width, bandH, axisY, nowX, expiringSoon, horizonDays, furtherOut };
  }, [events, now]);

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-faint">Spatial axis</p>
          <p className="mt-1.5 font-serif text-[24px] leading-none tracking-tight text-ink">
            The next {model.horizonDays} days
          </p>
        </div>
        <p className="shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-faint">
          {model.expiringSoon > 0 ? `${model.expiringSoon} expiring this week · ` : ""}
          scroll to traverse time <span className="text-primary">→</span>
          {model.furtherOut > 0 && (
            <span className="mt-1 block normal-case tracking-normal text-faint/70">
              {model.furtherOut} closing beyond the horizon — see the index
            </span>
          )}
        </p>
      </div>

      <div className="no-scrollbar overflow-x-auto">
        <div className="relative" style={{ width: model.width, height: model.bandH }}>
          {/* The past, shaded so the divide reads before the NOW line does. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 bg-ink/[0.02]"
            style={{ width: model.nowX, height: model.bandH }}
          />

          {/* Date labels below the axis. */}
          {model.days.map((d, i) => {
            const date = new Date(d);
            const day = date.getDay();
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
                    isToday ? "text-ink" : dim ? "text-faint/40" : "text-faint"
                  }`}
                >
                  {date.getDate()}
                </span>
                <span className="text-[9px] uppercase tracking-[0.16em] text-faint/50">
                  {WEEKDAYS[day]}
                </span>
              </div>
            );
          })}

          {/* Month labels across the top, above every card. */}
          {model.months.map((m) => (
            <span
              key={m.label + m.x}
              className="absolute text-[10px] uppercase tracking-[0.22em] text-faint/70"
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
            const tether = model.axisY - top - CARD_H;
            return (
              <div
                key={p.event.id}
                className="absolute"
                style={{ left: p.x, top, width: CARD_W }}
              >
                <div
                  aria-hidden
                  className="absolute left-1/2 w-px bg-line"
                  style={{ top: CARD_H, height: Math.max(0, tether) }}
                />
                <Link
                  href={`/events/${p.event.id}`}
                  className={`block border bg-raised/50 px-3 py-2.5 backdrop-blur-sm transition-colors duration-200 hover:border-line-hi ${
                    p.past ? "opacity-30" : "opacity-100"
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
                  <p className="mt-1.5 line-clamp-2 font-serif text-[13.5px] leading-snug text-ink">
                    {p.event.title}
                  </p>
                  <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-closing">
                    {countdown(p.event.endDate ?? p.event.date)}
                  </p>
                  {/* Which date that countdown measures, and where it came
                      from. Two of the four sources publish no registration
                      deadline, so this is not a cosmetic label. */}
                  <p className="mt-0.5 truncate text-[9px] uppercase tracking-[0.1em] text-faint/70">
                    {deadlineLabel(p.event.deadlineKind, eventPhase(p.event.date, p.event.endDate))}
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
                      className="mt-1 line-clamp-2 text-[10px] leading-snug text-faint/80"
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
