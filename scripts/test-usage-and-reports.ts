import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Every database method used below is replaced before calling route handlers.
// The dummy URL and disabled remote limiter prevent external database writes.
async function main() {
  process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1:1/fixture";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const { db } = await import("../lib/db");
  const { countUsage } = await import("../lib/usage");
  const { POST: usage } = await import("../app/api/usage/route");
  const { POST: report } = await import("../app/api/event-reports/route");
  const { ReportSchema } = await import("../lib/feedback-contracts");
  const totals = new Map<string, number>();
  let failStore = false;
  let eventFound = true;
  const reports: unknown[] = [];
  Object.assign(db.dailyMetric, { upsert: async (input: { create: { day: Date; kind: string } }) => {
    if (failStore) throw new Error("fixture storage outage");
    const key = `${input.create.day.toISOString().slice(0, 10)}:${input.create.kind}`;
    totals.set(key, (totals.get(key) ?? 0) + 1);
    return {};
  } });
  Object.assign(db, { $transaction: (queries: Promise<unknown>[]) => Promise.all(queries) });
  Object.assign(db.event, { findFirst: async () => eventFound ? { id: "fixture" } : null });
  Object.assign(db.eventReport, { create: async (input: { data: unknown }) => {
    if (failStore) throw new Error("fixture storage outage");
    reports.push(input.data); return {};
  } });
  let requestNumber = 0;
  const request = (path: string, body: unknown, headers = {}) => new NextRequest(`http://localhost${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `fixture-${++requestNumber}`, ...headers }, body: JSON.stringify(body),
  });
  try {
    const day = new Date("2026-10-10T23:59:59Z");
    assert.equal(await countUsage(["search", "empty_search"], day), true);
    await Promise.all(Array.from({ length: 10 }, () => countUsage(["save"], day)));
    assert.equal(totals.get("2026-10-10:save"), 10);
    assert.equal(totals.get("2026-10-10:empty_search"), 1);
    assert.equal((await usage(request("/api/usage", { kind: "search", empty: true }))).status, 204);
    assert.equal((await usage(request("/api/usage", { kind: "search", empty: false, q: "private search text" }))).status, 400);
    assert.equal((await usage(request("/api/usage", { kind: "save" }))).status, 400, "browser must not manufacture save counters");
    assert.equal((await usage(request("/api/usage", { kind: "outbound_click", eventId: "fixture" }))).status, 204);
    eventFound = false;
    assert.equal((await usage(request("/api/usage", { kind: "outbound_click", eventId: "missing" }))).status, 404);
    assert.equal((await report(request("/api/event-reports", { eventId: "missing", reason: "wrong_date" }))).status, 404);
    eventFound = true;
    assert.equal(ReportSchema.safeParse(null).success, false);
    assert.equal(ReportSchema.safeParse({ eventId: "fixture", reason: "other", comment: "a".repeat(501) }).success, false);
    assert.equal((await report(request("/api/event-reports", { eventId: "fixture", reason: "wrong_date", comment: " Date is wrong " }))).status, 201);
    assert.deepEqual(reports, [{ eventId: "fixture", reason: "wrong_date", comment: "Date is wrong" }]);
    assert.equal((await report(request("/api/event-reports", { eventId: "fixture", reason: "invalid" }))).status, 400);
    assert.equal((await report(request("/api/event-reports", { eventId: "fixture", reason: "other" }, { origin: "https://unrelated.example" }))).status, 400);
    assert.equal((await report(request("/api/event-reports", null))).status, 400);
    failStore = true;
    assert.equal((await usage(request("/api/usage", { kind: "search", empty: false }))).status, 503);
    assert.equal((await report(request("/api/event-reports", { eventId: "fixture", reason: "broken_link" }))).status, 503);
    failStore = false;
    const limitedRequest = () => request("/api/event-reports", { eventId: "fixture", reason: "other" }, { "x-forwarded-for": "rate-limit-fixture" });
    for (let i = 0; i < 5; i++) assert.equal((await report(limitedRequest())).status, 201);
    const limited = await report(limitedRequest());
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("Retry-After")) > 0);
    console.log("Usage persistence, strict payloads, report validation, unavailable storage and rate limiting passed offline.");
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
