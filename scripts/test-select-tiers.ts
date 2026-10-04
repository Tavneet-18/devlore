// eventSelect() must never name a column the database lacks.
//
// A missing column in a select is a hard Postgres error, not a null, so picking
// the wrong tier takes down every Event read at once. This is the check that
// would have caught the outage: the base schema has no sourceId, and the old
// base select asked for it anyway.
import { EventDetailsSchema, parseDetails } from "../lib/event-details";

/** The three Event schemas this code can meet, in migration order. */
const SCHEMAS = {
  "base (pre-001)": [
    "id", "title", "summary", "description", "date", "endDate", "city", "country",
    "isOnline", "eventType", "organizer", "link", "imageUrl", "tags",
    "beginnerFriendly", "source", "status", "createdAt",
    "updatedAt", "externalId", "hash", "fetchedAt", "rawPayload", "expiresAt",
  ],
  "after 001": [
    "id", "title", "summary", "description", "date", "endDate", "city", "country",
    "isOnline", "eventType", "organizer", "link", "imageUrl", "tags",
    "beginnerFriendly", "source", "status", "createdAt",
    "updatedAt", "externalId", "hash", "fetchedAt", "rawPayload", "expiresAt",
    "sourceId", "deadlineKind",
  ],
  "after 004": [
    "id", "title", "summary", "description", "date", "endDate", "city", "country",
    "isOnline", "eventType", "organizer", "link", "imageUrl", "tags",
    "beginnerFriendly", "source", "status", "createdAt",
    "updatedAt", "externalId", "hash", "fetchedAt", "rawPayload", "expiresAt",
    "sourceId", "deadlineKind",
    "details", "brief", "whoCanJoin", "briefedAt",
  ],
};

/** Mirrors the probe in lib/schema-capabilities.ts. */
function probe(columns: string[], hasIngestRun: boolean) {
  const present = new Set(columns);
  return {
    sourceIdentity: present.has("sourceId") && present.has("deadlineKind"),
    ingestRun: hasIngestRun,
    eventDetails: ["details", "brief", "whoCanJoin", "briefedAt"].every((c) => present.has(c)),
  };
}

/** Mirrors eventSelect()'s tier choice. */
function eventSelect(caps: { sourceIdentity: boolean; eventDetails: boolean }) {
  const base = {
    id: true, title: true, summary: true, description: true,
    date: true, endDate: true, city: true, country: true,
    isOnline: true, eventType: true, organizer: true, link: true,
    imageUrl: true, tags: true, beginnerFriendly: true, source: true,
    status: true, createdAt: true, fetchedAt: true,
  };
  const withIdentity = { ...base, sourceId: true, deadlineKind: true };
  if (caps.eventDetails) return { ...withIdentity, brief: true, whoCanJoin: true, details: true };
  if (caps.sourceIdentity) return withIdentity;
  return base;
}

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`  [${ok ? "ok  " : "FAIL"}] ${label}${detail ? `  ${detail}` : ""}`);
};

console.log("=== every schema state produces a legal select ===");
for (const [label, columns] of Object.entries(SCHEMAS)) {
  const present = new Set(columns);
  const caps = probe(columns, true);
  const select = eventSelect(caps);
  const requested = Object.keys(select);
  const absent = requested.filter((c) => !present.has(c));
  check(
    `${label.padEnd(14)} selects only existing columns`,
    absent.length === 0,
    absent.length ? `MISSING: ${absent.join(", ")}` : `${requested.length} columns`
  );
  // The base schema is the case that broke production.
  if (!caps.sourceIdentity) {
    check(
      "  base schema does NOT request sourceId",
      !requested.includes("sourceId") && !requested.includes("deadlineKind")
    );
  }
}

console.log("\n=== a probe failure falls back to the safest tier ===");
const broken = probe([], false);
const brokenSelect = eventSelect(broken);
check(
  "empty probe result selects only base columns",
  !("sourceId" in brokenSelect) && !("brief" in brokenSelect),
  `${Object.keys(brokenSelect).length} columns`
);

console.log("\n=== details parsing is independent of schema state ===");
check("null details -> null", parseDetails(null) === null);
check("valid details survive", parseDetails({ teamMin: 1, teamMax: 4, fee: "free" })?.teamMax === 4);
check("bad details dropped", parseDetails({ teamMin: "four" }) === null);
check("sourceText is capped", EventDetailsSchema.safeParse({ sourceText: "x".repeat(5000) }).success === false);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
if (failures > 0) process.exitCode = 1;
