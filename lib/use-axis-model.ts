"use client";

import { useMemo } from "react";
import type { EventDTO } from "./events";

/**
 * The axis model: which events are in the window, where they sit on it, and
 * which of them is nearest.
 *
 * This exists so the desktop axis and the mobile axis cannot disagree. Both
 * render from this, so a card can never be "nearest" on one and ordinary on the
 * other, and the counts in each header come from the same arithmetic.
 *
 * What is shared is the *data* — the window, the day grid, the month
 * boundaries, the past/nearest flags, the counts. What is NOT shared is the
 * *placement*: desktop stacks colliding events into lanes along a horizontal
 * band, while mobile groups them by day and runs them side by side down a
 * vertical list. Forcing one placement strategy on both would mean the desktop
 * geometry had to be parameterised for mobile, which is exactly the coupling
 * this split avoids.
 */

export const DAY = 86400000;

/** Desktop band geometry. Locked by scripts/test-axis-render.tsx. */
export const PX_PER_DAY = 96;
export const CARD_W = 196;

/**
 * Vertical room per lane.
 *
 * This has to exceed the tallest card the axis can produce. It was 108px while
 * real cards measure 131–164px, so lanes overlapped: 34 of 35 cards collided,
 * worst case 196px wide by 37px deep, and because a card is `bg-raised/50` with
 * a backdrop blur, the upper card's translucent panel sat over the lower one
 * and both titles were muddled together. The axis stacked rather than
 * overlapped only in the source, never on screen.
 *
 * 180px is the measured worst case (164px) plus a 16px gutter. The card's
 * height is structurally bounded — title and skim are both line-clamp-2 — so
 * this does not need to grow with content. `scripts/test-browser-render.mjs`
 * asserts the rendered cards do not overlap, so if that ever stops being true
 * the suite says so rather than the page.
 *
 * Note there is no CARD_H constant. The cards are not a fixed height: they run
 * from 131px to 164px depending on whether the title and skim wrap. The tether
 * to the axis line is drawn from 84px, which lands correctly only because the
 * card covers the shortfall. Correct by accident, and `CARD_H` recorded that
 * accident as though it were the truth.
 */
export const LANE_H = 180;
export const CARD_GAP = 20;
export const CARD_TOP = 34;

/**
 * Where the tether to the axis line is drawn from, measured down the card.
 *
 * Deliberately less than the tallest card, and deliberately not equal to the
 * shortest one either. There is no correct constant: the card's height depends
 * on whether its title and skim wrap, and SSR cannot measure that. Starting
 * short works because the card is painted over the shortfall, so the line a
 * reader sees always begins at the card's true bottom.
 */
export const TETHER_FROM = 84;

export const DESKTOP_WINDOW = { pastDays: 2, futureDays: 28 } as const;

/**
 * Phone window: two days of past and a week ahead. Deliberately much shorter
 * than desktop — the index below carries the full roster either way, and the
 * axis is a glanceable overview rather than the list. Widening it is a change
 * to this one constant.
 */
export const MOBILE_WINDOW = { pastDays: 2, futureDays: 7 } as const;

export const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
export const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

export function startOfDay(t: number): number {
  const istOffset = 5.5 * 3600000;
  return Math.floor((t + istOffset) / DAY) * DAY - istOffset;
}

/**
 * Position by deadline, not start date.
 *
 * The deadline is the date a reader can act on, and it is what every countdown
 * on the page already shows. Two of the four sources publish no registration
 * deadline at all, so for those the event's own end date is the only actionable
 * date there is.
 */
export function deadlineOf(e: EventDTO): number {
  return e.endDate ? new Date(e.endDate).getTime() : new Date(e.date).getTime();
}

export type AxisEvent = {
  event: EventDTO;
  /** Midnight of the deadline's day, so events on one date share a key. */
  day: number;
  /** Days from the start of the window; fractional, for the desktop band. */
  offset: number;
  past: boolean;
  nearest: boolean;
};

export type AxisModel = {
  /** Every event whose deadline falls inside the window, in deadline order. */
  inWindow: AxisEvent[];
  days: number[];
  /** Day index -> month label, for the first day of each month in the range. */
  monthStarts: { index: number; label: string }[];
  rangeStart: number;
  rangeEnd: number;
  horizonDays: number;
  expiringSoon: number;
  /** Not dropped, just not on the axis — the index carries them. */
  furtherOut: number;
  now: number;
};

export function useAxisModel(
  events: EventDTO[],
  now: number,
  window: { pastDays: number; futureDays: number } = DESKTOP_WINDOW
): AxisModel {
  return useMemo(() => {
    const todayStart = startOfDay(now);
    const rangeStart = todayStart - window.pastDays * DAY;

    // A FIXED horizon. This used to stretch to fit the furthest deadline, and
    // a single event closing in seven weeks stretched the band to 6480px with
    // thirteen events marooned across it — mostly empty space.
    const rangeEnd = todayStart + window.futureDays * DAY;

    // Filter on the DEADLINE, matching how cards are positioned.
    //
    // `rangeEnd` has to be declared above this filter, not below it. The
    // callback runs during the call, so reading it first threw a TDZ error
    // that blanked the whole page for every reader.
    const inWindow = events.filter((e) => {
      const d = deadlineOf(e);
      return d >= rangeStart && d < rangeEnd;
    });

    const sorted = [...inWindow].sort((a, b) => deadlineOf(a) - deadlineOf(b));

    // The single nearest future deadline gets emphasised.
    const future = sorted.filter((e) => deadlineOf(e) > now);
    const nearestId = future.length
      ? future.reduce((a, b) => (deadlineOf(a) <= deadlineOf(b) ? a : b)).id
      : null;

    const rows: AxisEvent[] = sorted.map((e) => {
      const d = deadlineOf(e);
      const day = startOfDay(d);
      return {
        event: e,
        day,
        offset: Math.max(0, ((day - rangeStart) / DAY)),
        past: d <= now,
        nearest: e.id === nearestId,
      };
    });

    const totalDays = Math.ceil((rangeEnd - rangeStart) / DAY);
    const days = Array.from({ length: totalDays }, (_, i) => rangeStart + i * DAY);

    // Month labels, rendered once at each month boundary inside the range.
    const monthStarts: { index: number; label: string }[] = [];
    let lastMonth = -1;
    days.forEach((d, i) => {
      const m = new Date(d + 5.5 * 3600000).getUTCMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        monthStarts.push({ index: i, label: MONTHS[m] });
      }
    });

    const expiringSoon = future.filter((e) => deadlineOf(e) - now < 7 * DAY).length;
    const furtherOut = events.filter((e) => deadlineOf(e) >= rangeEnd).length;

    return {
      inWindow: rows,
      days,
      monthStarts,
      rangeStart,
      rangeEnd,
      horizonDays: Math.round((rangeEnd - todayStart) / DAY),
      expiringSoon,
      furtherOut,
      now,
    };
  }, [events, now, window.pastDays, window.futureDays]);
}