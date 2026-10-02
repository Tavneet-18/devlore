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
import { IndexRow } from "../components/EventCard";

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
  const deadlineOf = (e: EventDTO) =>
    e.endDate ? new Date(e.endDate).getTime() : new Date(e.date).getTime();

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

  const soonest = [...closable].sort((a, b) => deadlineOf(a) - deadlineOf(b))[0];
  console.log(
    `\n${failures === 0 ? "PASS" : `FAIL (${failures})`} — axis renders on real data` +
      (soonest ? `; soonest deadline ${new Date(deadlineOf(soonest)).toISOString().slice(0, 10)}` : "")
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();