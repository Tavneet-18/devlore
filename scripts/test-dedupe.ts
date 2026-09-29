import { normaliseTitle, findDuplicates, rangesOverlap, placesCompatible } from "../lib/dedupe";

function main() {
  console.log("=== title normalisation ===");
  for (const t of [
    "HACKBIOS 2K26",
    "Hackbios 2k26",
    "Global Distributed Systems Hackweek 2026",
    "Global Distributed Systems Hack Week",
    "AI Builder Cup 2026 - Edition III",
    "Bharat Builds Tour",
  ]) {
    console.log(`  ${JSON.stringify(t).padEnd(48)} -> ${JSON.stringify(normaliseTitle(t))}`);
  }

  const key = (t: string) => normaliseTitle(t);
  console.log("\n  same event, different casing/edition :", key("HACKBIOS 2K26") === key("Hackbios 2k26"));
  console.log("  same event, spaces vs words         :", key("Global Distributed Systems Hackweek 2026") === key("Global Distributed Systems Hack Week"));
  console.log("  year stripped (dates disambiguate)  :", key("Hackathon 2025") === key("Hackathon 2026"));
  console.log("  different events stay different    :", key("Bharat Builds Tour") !== key("Environmental Hacks"));

  console.log("\n=== ranges ===");
  const d = (s: string) => new Date(s).getTime();
  console.log("  overlap        :", rangesOverlap({ start: d("2026-10-01"), end: d("2026-10-10") }, { start: d("2026-10-08"), end: d("2026-10-20") }));
  console.log("  no overlap     :", rangesOverlap({ start: d("2026-10-01"), end: d("2026-10-02") }, { start: d("2026-11-08"), end: d("2026-11-20") }));
  console.log("  1 day apart ok  :", rangesOverlap({ start: d("2026-10-01"), end: d("2026-10-02") }, { start: d("2026-10-03"), end: d("2026-10-05") }));

  console.log("\n=== places ===");
  console.log("  online matches anything:", placesCompatible({ city: "Delhi", isOnline: false }, { city: null, isOnline: true }));
  console.log("  same city              :", placesCompatible({ city: "Bengaluru" }, { city: "bengaluru" }));
  console.log("  different cities       :", placesCompatible({ city: "Bengaluru" }, { city: "Mumbai" }));

  console.log("\n=== full match decision ===");
  const incoming = {
    id: "__incoming__",
    title: "Hackbios 2K26",
    date: "2026-10-08T18:30:00.000Z",
    endDate: "2026-10-09T18:30:00.000Z",
    city: "Bengaluru",
    isOnline: false,
  };
  const scenarios: [string, unknown[]][] = [
    ["same title, overlapping dates, same city -> MERGE", [{ id: "a", title: "HACKBIOS 2K26", date: "2026-10-08T00:00:00.000Z", endDate: "2026-10-09T00:00:00.000Z", city: "Bengaluru" }]],
    ["same title, far-apart dates -> NO merge", [{ id: "b", title: "HACKBIOS 2K26", date: "2027-03-01T00:00:00.000Z", endDate: "2027-03-02T00:00:00.000Z", city: "Bengaluru" }]],
    ["same title+dates, different city -> NO merge", [{ id: "c", title: "HACKBIOS 2K26", date: "2026-10-08T00:00:00.000Z", endDate: "2026-10-09T00:00:00.000Z", city: "Mumbai" }]],
    ["same title+dates, other one online -> MERGE", [{ id: "d", title: "HACKBIOS 2K26", date: "2026-10-08T00:00:00.000Z", endDate: "2026-10-09T00:00:00.000Z", city: null, isOnline: true }]],
    ["different title entirely -> NO merge", [{ id: "e", title: "Codeutsava X.0", date: "2026-10-08T00:00:00.000Z", endDate: "2026-10-09T00:00:00.000Z", city: "Bengaluru" }]],
  ];

  for (const [label, candidates] of scenarios) {
    const r = findDuplicates(incoming, candidates as never[]);
    console.log(`  ${r.length ? "MERGE  " : "no-merge"} ${label}`);
  }
}

main();
