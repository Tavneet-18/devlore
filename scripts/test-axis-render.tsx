// Render the front page's axis the way the browser does, with real rows.
//
// The homepage fetches its events inside useEffect, so Next renders the loading
// skeleton on the server and the axis only ever mounts in the browser. A TDZ
// bug in that component therefore type-checks, lints, builds, returns HTTP 200
// with valid HTML, and passes every local smoke test — and still blanks the
// page for every reader. That is exactly what happened: TimeAxis read
// `rangeEnd` inside the filter callback that runs immediately, before the
// `const rangeEnd` on the line below had initialised.
//
// SSR does not exercise the component either, so this does: renderToStatic-
// Markup mounts it directly and runs the layout maths against the live
// dataset. Any use-before-initialise in that path throws here.
import { renderToStaticMarkup } from "react-dom/server";
import type { EventDTO } from "../lib/events";
import { TimeAxis } from "../components/TimeAxis";
import { TimeAxisMobile } from "../components/TimeAxisMobile";
import { IndexRow } from "../components/IndexRow";

const API = process.env.EVENTS_API ?? "https://devlore-kappa.vercel.app/api/events";

async function main() {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`events API ${res.status}`);
  const { events } = (await res.json()) as { events: EventDTO[] };
  if (events.length === 0) throw new Error("no events to render");
  console.log(`events: ${events.length}`);

  const DAY = 86400000;
  const PAST_DAYS = 2;
  const FUTURE_DAYS = 28;
  // Mirrors the constants in components/TimeAxis.tsx. If either side moves,
  // this test is the thing that notices.
  const EXPECTED_PX_PER_DAY = 96;
  const EXPECTED_CARD_W = 196;
  const EXPECTED_BAND_W = (PAST_DAYS + FUTURE_DAYS) * EXPECTED_PX_PER_DAY;
  const deadlineOf = (e: EventDTO) =>
    e.endDate ? new Date(e.endDate).getTime() : new Date(e.date).getTime();
  const startOfDayMs = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  // The axis takes the closable set — everything without an event-end date.
  const closable = events.filter((e) => e.deadlineKind !== "event-end");
  const now = Date.now();
  let failures = 0;

  // Rendered at today's clock, then at horizons either side of the window, so
  // the range arithmetic is exercised with events on both edges of the axis.
  for (const [label, at] of [
    ["now", now],
    ["+90d", now + 90 * DAY],
    ["-90d", now - 90 * DAY],
  ] as const) {
    const iso = new Date(at).toISOString();
    const startOfDay = (t: number) => {
      const d = new Date(t);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    const from = startOfDay(at) - PAST_DAYS * DAY;
    const to = startOfDay(at) + FUTURE_DAYS * DAY;
    const expected = closable.filter((e) => {
      const d = deadlineOf(e);
      return d >= from && d <= to;
    }).length;

    try {
      const html = renderToStaticMarkup(<TimeAxis events={closable} now={iso} />);
      const cards = (html.match(/href="\/events\//g) ?? []).length;
      if (cards !== expected) {
        failures++;
        console.log(
          `  [FAIL] TimeAxis @ ${label}: ${cards} cards rendered, ${expected} events in window`
        );
      } else {
        console.log(`  [ok] TimeAxis @ ${label}: ${html.length} bytes, ${cards} cards`);
      }

      // DESKTOP GEOMETRY LOCK.
      //
      // The mobile axis is a separate component that renders from the same
      // model, precisely so that desktop is never edited to accommodate it.
      // These assertions are what makes that claim checkable instead of merely
      // stated: if any phase parameterises, scales, or reflows this layout, the
      // numbers below move and the build goes red.
      //
      // Locked to the values in force since the axis shipped:
      //   PX_PER_DAY 96 · CARD_W 196 · 30 days (2 past + 28 future) => 2880px
      const band = html.match(/<div class="relative" style="width:(\d+)px/);
      if (!band) {
        failures++;
        console.log(`  [FAIL] TimeAxis @ ${label}: no band element in markup`);
      } else if (Number(band[1]) !== EXPECTED_BAND_W) {
        failures++;
        console.log(
          `  [FAIL] TimeAxis @ ${label}: band ${band[1]}px, expected ${EXPECTED_BAND_W}px`
        );
      }

      // Every card sits in an absolutely-positioned wrapper carrying the width.
      const cardWidths = [...html.matchAll(/<div class="absolute" style="left:[\d.]+px;top:\d+px;width:(\d+)px"/g)]
        .map((m) => m[1]);
      const wrong = cardWidths.filter((w) => w !== String(EXPECTED_CARD_W));
      if (wrong.length > 0) {
        failures++;
        console.log(
          `  [FAIL] TimeAxis @ ${label}: ${wrong.length}/${cardWidths.length} cards off ${EXPECTED_CARD_W}px (${[...new Set(wrong)].join(", ")})`
        );
      } else {
        console.log(
          `  [ok] geometry @ ${label}: band ${EXPECTED_BAND_W}px, ${cardWidths.length} cards at ${EXPECTED_CARD_W}px`
        );
      }
    } catch (err) {
      failures++;
      console.log(`  [FAIL] TimeAxis @ ${label}: ${(err as Error).message}`);
    }
  }

  // Index rows are the other surface that formats every field on a real row.
  for (const [i, e] of events.entries()) {
    try {
      renderToStaticMarkup(<IndexRow event={e} index={i + 1} />);
    } catch (err) {
      failures++;
      console.log(`  [FAIL] IndexRow ${e.source}/${e.title.slice(0, 40)}: ${(err as Error).message}`);
    }
  }
  console.log(`  [ok] IndexRow: ${events.length} rows`);

  // An axis fed a single event, and fed nothing, are the two degenerate cases
  // that produce empty reductions and divide-by-zero widths.
  for (const [label, rows] of [
    ["single", closable.slice(0, 1)],
    ["empty", []],
  ] as const) {
    try {
      renderToStaticMarkup(<TimeAxis events={rows as EventDTO[]} now={new Date(now).toISOString()} />);
      console.log(`  [ok] TimeAxis ${label}`);
    } catch (err) {
      failures++;
      console.log(`  [FAIL] TimeAxis ${label}: ${(err as Error).message}`);
    }
  }

  // The mobile axis: same model, rotated. Rendered at the same three clock
  // positions so both windows are exercised with events on their edges.
  //
  // Its two invariants are structural rather than geometric, because there is
  // no width to lock: every date in the window gets a row whether or not
  // anything closes on it (the empty space is part of what the axis shows),
  // and every event appears exactly once.
  const MOBILE_PAST_DAYS = 2;
  const MOBILE_FUTURE_DAYS = 7;
  const MOBILE_DAYS = MOBILE_PAST_DAYS + MOBILE_FUTURE_DAYS;

  for (const [label, at] of [
    ["now", now],
    ["+90d", now + 90 * DAY],
    ["-90d", now - 90 * DAY],
  ] as const) {
    const iso = new Date(at).toISOString();
    const from = startOfDayMs(at) - MOBILE_PAST_DAYS * DAY;
    const to = startOfDayMs(at) + MOBILE_FUTURE_DAYS * DAY;
    const expected = closable.filter((e) => {
      const d = deadlineOf(e);
      return d >= from && d <= to;
    }).length;

    try {
      const html = renderToStaticMarkup(<TimeAxisMobile events={closable} now={iso} />);
      const rowCount = (html.match(/flex gap-3 border-t py-2\.5/g) ?? []).length;
      const cards = (html.match(/href="\/events\//g) ?? []).length;

      if (rowCount !== MOBILE_DAYS) {
        failures++;
        console.log(`  [FAIL] TimeAxisMobile @ ${label}: ${rowCount} date rows, expected ${MOBILE_DAYS}`);
      } else if (cards !== expected) {
        failures++;
        console.log(`  [FAIL] TimeAxisMobile @ ${label}: ${cards} cards, ${expected} events in window`);
      } else {
        console.log(`  [ok] TimeAxisMobile @ ${label}: ${rowCount} date rows, ${cards} cards`);
      }
    } catch (err) {
      failures++;
      console.log(`  [FAIL] TimeAxisMobile @ ${label}: ${(err as Error).message}`);
    }
  }

  // Same degenerate cases as the desktop axis: one event, and none.
  for (const [label, rows] of [
    ["single", closable.slice(0, 1)],
    ["empty", []],
  ] as const) {
    try {
      renderToStaticMarkup(<TimeAxisMobile events={rows as EventDTO[]} now={new Date(now).toISOString()} />);
      console.log(`  [ok] TimeAxisMobile ${label}`);
    } catch (err) {
      failures++;
      console.log(`  [FAIL] TimeAxisMobile ${label}: ${(err as Error).message}`);
    }
  }

  const soonest = [...closable].sort((a, b) => deadlineOf(a) - deadlineOf(b))[0];
  console.log(
    `\n${failures === 0 ? "PASS" : `FAIL (${failures})`} — axis renders on real data` +
      (soonest ? `; soonest deadline ${new Date(deadlineOf(soonest)).toISOString().slice(0, 10)}` : "")
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();