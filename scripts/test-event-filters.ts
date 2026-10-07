import assert from "node:assert/strict";
import { buildEventWhere } from "../lib/events";
import { cityAliases, normaliseMode } from "../lib/event-filters";
import { LIVE_SOURCES } from "../lib/ai/sources/liveSources";

// Interpret the small Prisma predicate subset used here against realistic rows.
// This checks combinations and aliases, rather than only the generated shape.
type Row = { city: string | null; title: string; summary: string; tags: string;
  status: string; date: Date; endDate: Date | null; isOnline: boolean };
function matches(row: Row, where: unknown): boolean {
  const rule = where as Record<string, unknown>;
  return Object.entries(rule).every(([key, value]) => {
    if (key === "AND") return (Array.isArray(value) ? value : [value]).every(v => matches(row, v));
    if (key === "OR") return (value as unknown[]).some(v => matches(row, v));
    const actual = row[key as keyof Row];
    if (value === null || typeof value !== "object") return actual === value;
    const op = value as { contains?: string; mode?: string; gt?: Date; lte?: Date };
    if (op.contains !== undefined) return typeof actual === "string" &&
      (op.mode === "insensitive" ? actual.toLowerCase().includes(op.contains.toLowerCase()) : actual.includes(op.contains));
    if (op.gt) return actual instanceof Date && actual > op.gt;
    if (op.lte) return actual instanceof Date && actual <= op.lte;
    throw new Error(`Unsupported operator ${key}`);
  });
}
const now = new Date("2026-10-07T06:00:00Z");
const base: Row = { city: null, title: "AI Hackathon", summary: "Build with AI", tags: "[]",
  status: "APPROVED", date: new Date("2026-10-30T00:00:00Z"),
  endDate: new Date("2026-10-10T00:00:00Z"), isOnline: false };
const rows = [
  { ...base, title: "Bengaluru event", city: "Tripura Vasini Palace Grounds, Bengaluru" },
  { ...base, title: "Bangalore event", city: "Bangalore Urban" },
  { ...base, title: "Mumbai event", city: "Vile Parle" },
  { ...base, title: "Delhi event", city: "Rohini" },
  { ...base, title: "Pune event", city: "Hinjewadi, Pune" },
  { ...base, title: "Global online", isOnline: true },
  { ...base, title: "Unknown location" },
  { ...base, title: "Local online", city: "Bengaluru", isOnline: true },
  { ...base, title: "Closed registration", city: "Bangalore", endDate: new Date("2026-10-06T00:00:00Z") },
];
const result = (query: Parameters<typeof buildEventWhere>[0]) =>
  rows.filter(row => matches(row, buildEventWhere(query, now))).map(row => row.title);
assert.deepEqual(result({ city: "Bangalore" }), ["Bengaluru event", "Bangalore event", "Local online"]);
assert.deepEqual(result({ city: "Bengaluru", mode: "offline" }), ["Bengaluru event", "Bangalore event"]);
assert.deepEqual(result({ city: "Bangalore", mode: "online" }), ["Local online"]);
assert.deepEqual(result({ mode: "online" }), ["Global online", "Local online"]);
assert.deepEqual(result({ city: "Mumbai", mode: "offline" }), ["Mumbai event"]);
assert.deepEqual(result({ city: "Delhi" }), ["Delhi event"]);
assert.deepEqual(result({ city: "Pune", mode: "online" }), []);
assert.ok(result({ mode: "offline" }).includes("Unknown location"));
assert.equal(result({ city: "Delhi", q: "MUMBAI" }).length, 0);
assert.equal(normaliseMode(" ONLINE "), "online");
assert.equal(normaliseMode("in-person"), "offline");
assert.equal(normaliseMode("all"), undefined);
assert.ok(cityAliases("Bengaluru").includes("bangalore"));
assert.ok(cityAliases("Delhi").includes("greater noida"));
assert.ok(!result({ city: "Bangalore" }).includes("Global online"));

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: { data: [{
    id: 123, title: "Unknown city event", status: "LIVE", region: "offline",
    regnRequirements: { end_regn_dt: "2099-01-01T00:00:00Z" },
    organisation: { name: "Fixture organiser" }, seo_url: "https://example.com/event",
  }] } });
  try {
    const source = LIVE_SOURCES.find(s => s.id === "unstop")!;
    const result = await source.fetch("Bangalore");
    assert.equal(result.length, 1);
    assert.equal(result[0].city, undefined, "global adapter must not invent its requested city");
    assert.equal(result[0].isOnline, false);
  } finally { globalThis.fetch = originalFetch; }
  console.log("City aliases, city/format combinations, deadline boundaries and unknown-location regressions passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
