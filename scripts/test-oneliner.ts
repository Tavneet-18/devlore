// Does the one-liner read well on real ingested events?
import { CITY_AGNOSTIC_SOURCES } from "../lib/ai/sources/indiaSources";
import { parseDetails } from "../lib/event-details";
import { whoCanJoinFrom } from "../lib/ai/brief";
import { eventOneLiner, metaDescription, registrationDeadline, countdownHeading } from "../lib/event-summary";

async function main() {
  for (const src of CITY_AGNOSTIC_SOURCES) {
    const events = await src.fetch();
    console.log(`\n===== ${src.displayName} =====`);
    for (const e of events.slice(0, 3)) {
      const details = parseDetails(e.details);
      const input = {
        title: e.title,
        date: e.date,
        endDate: e.endDate ?? null,
        deadlineKind: e.deadlineKind ?? null,
        isOnline: e.isOnline ?? false,
        city: e.city ?? null,
        details,
        whoCanJoin: whoCanJoinFrom(details),
      };
      console.log(`\n  ${e.title}`);
      console.log(`    one-liner : ${eventOneLiner(input)}`);
      console.log(`    whoCanJoin: ${input.whoCanJoin ?? "(none)"}`);
      console.log(`    meta      : ${metaDescription(input)}`);
      const dl = registrationDeadline(input);
      console.log(`    countdown : ${countdownHeading(input) ?? "(none)"} -> ${dl ? dl.slice(0, 16) : "no calendar button"}`);
    }
  }
}

void main();
