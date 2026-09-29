// Run each new adapter against the live sites and report what comes back.
import { CITY_AGNOSTIC_SOURCES } from "../lib/ai/sources/indiaSources";

async function main() {
  const only = process.argv[2];
  const targets = only ? CITY_AGNOSTIC_SOURCES.filter((s) => s.id === only) : CITY_AGNOSTIC_SOURCES;

  for (const source of targets) {
    const t0 = Date.now();
    let events: Awaited<ReturnType<typeof source.fetch>> = [];
    let err: string | null = null;
    try {
      events = await source.fetch();
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    const ms = Date.now() - t0;

    console.log("=".repeat(68));
    console.log(`${source.id}  (${source.displayName})  ->  ${events.length} events in ${ms}ms`);
    if (err) console.log("  THREW:", err, "<- adapter should never throw");
    console.log("=".repeat(68));

    for (const e of events.slice(0, 6)) {
      const d = e.endDate ? String(e.endDate).slice(0, 10) : "-";
      console.log(
        `  ${String(e.title).slice(0, 38).padEnd(40)} ref=${d} kind=${String(e.deadlineKind).padEnd(12)} online=${e.isOnline ? "y" : "n"}`
      );
      console.log(`     id  : ${String(e.sourceId).slice(0, 40)}`);
      console.log(`     link: ${String(e.link).slice(0, 86)}`);
    }

    const noId = events.filter((e) => !e.sourceId).length;
    const noLink = events.filter((e) => !e.link).length;
    const noDate = events.filter((e) => !e.date).length;
    const past = events.filter((e) => new Date(String(e.endDate ?? e.date)).getTime() < Date.now()).length;
    const kinds = [...new Set(events.map((e) => e.deadlineKind))];
    console.log(`  integrity: missingId=${noId} missingLink=${noLink} missingDate=${noDate} pastLeaked=${past}`);
    console.log(`  deadlineKinds: ${kinds.join(", ")}`);
    console.log("");
  }
}

void main();
