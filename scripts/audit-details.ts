// Which structured fields does each adapter actually extract, live?
// Prints a coverage matrix so a blank row is a known blank, not a guess.
import { CITY_AGNOSTIC_SOURCES } from "../lib/ai/sources/indiaSources";
import { parseDetails, teamSizeLabel, feeLabel } from "../lib/event-details";
import { whoCanJoinFrom, canBrief } from "../lib/ai/brief";

const FIELDS = [
  "sourceText", "prize", "teamMin", "teamMax", "eligibility",
  "fee", "feeAmount", "themes", "venue", "organiser", "participants",
] as const;

async function main() {
  for (const src of CITY_AGNOSTIC_SOURCES) {
    let events: Awaited<ReturnType<typeof src.fetch>> = [];
    try {
      events = await src.fetch();
    } catch (e) {
      console.log(`${src.id.padEnd(14)} FAILED: ${(e as Error).message}`);
      continue;
    }
    if (events.length === 0) {
      console.log(`${src.id.padEnd(14)} 0 events`);
      continue;
    }

    const counts: Record<string, number> = {};
    for (const f of FIELDS) counts[f] = 0;
    let withDetails = 0;
    let briefable = 0;
    let whoCanJoin = 0;
    const samples: string[] = [];

    for (const e of events) {
      const d = parseDetails(e.details);
      if (d) withDetails++;
      for (const f of FIELDS) if (d?.[f] !== undefined && d[f] !== null) counts[f]++;
      if (canBrief(d)) briefable++;
      const w = whoCanJoinFrom(d);
      if (w) {
        whoCanJoin++;
        if (samples.length < 2) samples.push(`${teamSizeLabel(d) ?? "?"} / ${feeLabel(d) ?? "fee?"}`);
      }
    }

    const n = events.length;
    console.log(`${src.id.padEnd(14)} ${n} events, details on ${withDetails}`);
    console.log(`  ${FIELDS.map((f) => `${f}=${counts[f]}`).join("  ")}`);
    console.log(`  briefable=${briefable}  whoCanJoin=${whoCanJoin}`);
    for (const s of samples) console.log(`    > team/fee: ${s}`);
    for (const w of events) {
      const line = whoCanJoinFrom(parseDetails(w.details));
      if (line) { console.log(`    > ${w.title.slice(0, 44).padEnd(44)} ${line}`); break; }
    }
    console.log("");
  }
}

void main();
