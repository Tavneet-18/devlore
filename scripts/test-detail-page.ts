// The detail page's data rules, exercised against one real event per source.
//
// The point of this file is the blanks: a row must be absent, never a dash, and
// an end-date-only event must never produce a calendar button.
import { CITY_AGNOSTIC_SOURCES } from "../lib/ai/sources/indiaSources";
import { parseDetails } from "../lib/event-details";
import { whoCanJoinFrom, canBrief } from "../lib/ai/brief";
import { buildGlance, eventOneLiner, metaDescription, registrationDeadline } from "../lib/event-summary";
import { buildIcs, googleCalendarUrl } from "../lib/calendar";
import { sourceLabel } from "../lib/constants";
import { formatDateTime } from "../lib/format";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`  [${ok ? "ok  " : "FAIL"}] ${label}${detail ? `  ${detail}` : ""}`);
};

async function main() {
  for (const src of CITY_AGNOSTIC_SOURCES) {
    const events = await src.fetch();
    if (events.length === 0) {
      console.log(`\n${src.displayName}: 0 events, skipped`);
      continue;
    }
    const e = events[0];
    const details = parseDetails(e.details);
    const whoCanJoin = whoCanJoinFrom(details);
    const input = {
      title: e.title,
      date: e.date,
      endDate: e.endDate ?? null,
      deadlineKind: e.deadlineKind ?? null,
      isOnline: e.isOnline ?? false,
      city: e.city ?? null,
      details,
      whoCanJoin,
    };

    console.log(`\n===== ${src.displayName} — ${e.title.slice(0, 50)} =====`);
    console.log(`  sourceLabel: ${sourceLabel(e.source)}`);

    const glance = buildGlance(input);
    for (const row of glance) console.log(`    ${row.label.padEnd(22)} ${row.value}`);

    // Rule 1: no row may be blank, and none may be a placeholder dash.
    check(
      "no blank / placeholder rows",
      glance.every((r) => r.value.trim().length > 0 && r.value.trim() !== "—" && !/^(TBA|Unknown|N\/A)$/i.test(r.value.trim()))
    );

    // Rule 2: calendar only for a real, future registration deadline.
    const deadline = registrationDeadline(input);
    const hasCalendar = Boolean(
      buildIcs({ title: e.title, deadlineIso: deadline ?? e.date, deadlineKind: e.deadlineKind, deadlineLabel: "x", link: e.link }) ||
        googleCalendarUrl({ title: e.title, deadlineIso: deadline ?? e.date, deadlineKind: e.deadlineKind, deadlineLabel: "x", link: e.link })
    );
    check(
      "calendar offered iff a real future registration deadline exists",
      hasCalendar === Boolean(deadline),
      `deadline=${deadline ? formatDateTime(deadline) : "none"}`
    );

    if (e.deadlineKind === "event-end") {
      check("event-end source never offers a calendar", hasCalendar === false);
      const dlRow = glance.find((r) => r.label === "Registration deadline");
      check("event-end explains the missing deadline", Boolean(dlRow), dlRow?.value.slice(0, 60) ?? "row absent");
    }

    // Rule 3: the "Registration closes" row may only appear for a real deadline.
    const closesRow = glance.find((r) => r.label === "Registration closes");
    check(
      '"Registration closes" row matches a real deadline',
      Boolean(closesRow) === Boolean(deadline),
      closesRow ? closesRow.value : "row absent"
    );

    // Rule 4: no brief is claimed, because no source publishes prose.
    check("brief correctly skipped (no source text)", !canBrief(details));

    // Rule 5: whoCanJoin, when present, is made only of source facts.
    if (whoCanJoin) {
      console.log(`    whoCanJoin: ${whoCanJoin}`);
      check("whoCanJoin is a single sentence", /^[A-Z].*[.!?]$/.test(whoCanJoin));
    }

    console.log(`    one-liner : ${eventOneLiner(input)}`);
    console.log(`    meta      : ${metaDescription({ ...input, brief: null })}`);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

void main();
