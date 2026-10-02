// Sweep every production event through the display logic the client renders.
// The zod-in-client crash was at module init and is gone by construction;
// this covers the data-dependent paths (one-liner, glance, calendar guard,
// countdown heading) against real rows.
import { parseDetails } from "../lib/event-details";
import { whoCanJoinFrom } from "../lib/ai/brief";
import {
  eventOneLiner,
  metaDescription,
  registrationDeadline,
  countdownHeading,
  buildGlance,
} from "../lib/event-summary";
import { buildIcs, googleCalendarUrl } from "../lib/calendar";
import { formatDateTime } from "../lib/format";

async function main() {
  const res = await fetch("https://devlore-kappa.vercel.app/api/events");
  if (!res.ok) throw new Error(`events API ${res.status}`);
  const { events } = (await res.json()) as { events: Record<string, unknown>[] };
  console.log(`events: ${events.length}`);

  let failures = 0;
  const check = (label: string, ok: boolean, detail = "") => {
    if (!ok) {
      failures++;
      console.log(`  [FAIL] ${label}  ${detail}`);
    }
  };

  for (const e of events) {
    const tag = `${e.source}/${String(e.title).slice(0, 40)}`;
    const details = parseDetails(e.details);
    const whoCanJoin = (e.whoCanJoin as string | null) ?? whoCanJoinFrom(details);
    const input = {
      title: String(e.title),
      date: String(e.date),
      endDate: (e.endDate as string | null) ?? null,
      deadlineKind: (e.deadlineKind as string | null) ?? null,
      isOnline: Boolean(e.isOnline),
      city: (e.city as string | null) ?? null,
      details,
      whoCanJoin,
      brief: (e.brief as string | null) ?? null,
    };

    // Every pure display function must return without throwing, on every row.
    let line = "";
    let meta = "";
    let glance: { label: string; value: string }[] = [];
    try {
      line = eventOneLiner(input);
      meta = metaDescription(input);
      glance = buildGlance(input);
      countdownHeading(input);
      registrationDeadline(input);
    } catch (err) {
      check("display functions throw", false, `${tag}: ${(err as Error).message}`);
      continue;
    }

    check("one-liner non-empty", line.length > 0, tag);
    check("meta non-empty", meta.length > 0, tag);
    check(
      "no placeholder rows",
      glance.every((r) => r.value.trim().length > 0 && !/^(—|TBA|Unknown|N\/A)$/i.test(r.value.trim())),
      tag
    );

    // Calendar invariant: offered iff a real future registration deadline.
    const dl = registrationDeadline(input);
    const ics = dl
      ? buildIcs({ title: input.title, deadlineIso: dl, deadlineKind: input.deadlineKind, deadlineLabel: formatDateTime(dl) })
      : null;
    const gcal = dl
      ? googleCalendarUrl({ title: input.title, deadlineIso: dl, deadlineKind: input.deadlineKind, deadlineLabel: formatDateTime(dl) })
      : null;
    check("calendar matches deadline", Boolean(ics || gcal) === Boolean(dl), tag);
    if (input.deadlineKind === "event-end") {
      check("event-end gets no calendar", !ics && !gcal, tag);
      check("event-end has no Registration closes row", !glance.some((r) => r.label === "Registration closes"), tag);
    }
  }

  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  if (failures > 0) process.exitCode = 1;
}

void main();
