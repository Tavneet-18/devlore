import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { eventDates, eventDateLabel, eventStatus, isActionable } from "../lib/event-dates";
import { buildGlance, eventOneLiner, registrationDeadline, countdownHeading } from "../lib/event-summary";
import { eventPhase, formatDateRange } from "../lib/format";
import { buildEventWhere, actionableEventWhere, type EventDTO } from "../lib/events";
import { similarEvents } from "../lib/recommendations";
import { parseDetails } from "../lib/event-details";
import { startOfDay } from "../lib/use-axis-model";
import { IndexRow } from "../components/IndexRow";
import { TimeAxis } from "../components/TimeAxis";
import { TimeAxisMobile } from "../components/TimeAxisMobile";
import { CITY_AGNOSTIC_SOURCES } from "../lib/ai/sources/indiaSources";

const now = Date.parse("2026-10-06T12:00:00.000Z");
const originalNow = Date.now;
Date.now = () => now;
const legacy = {
  title: "Q-HACK INDIA 2026", source: "devfolio", isOnline: false,
  date: "2026-10-30T03:00:00.000Z", endDate: "2026-10-07T18:29:00.000Z",
  deadlineKind: "registration",
};

async function main() {
  assert.equal(eventDates(legacy).end, null);
  assert.match(eventDateLabel(legacy), /^Starts .*Oct 30/);
  assert.equal(eventStatus(legacy), "Registration open");
  assert.equal(registrationDeadline(legacy), legacy.endDate);
  assert.equal(buildGlance(legacy).some(r => r.label === "Runs"), false);
  assert.equal(buildGlance(legacy).find(r => r.label === "Registration closes")?.value, "07 Oct, 23:59 IST");

  const closed = { ...legacy, endDate: "2026-10-05T18:29:00.000Z" };
  assert.equal(eventStatus(closed), "Registration closed");
  assert.equal(isActionable(closed), false);
  assert.equal(registrationDeadline(closed), null);
  assert.match(eventOneLiner(closed), /^Registration closed/);
  assert.ok(buildGlance(closed).some(r => r.label === "Registration closes"));
  assert.equal(countdownHeading(closed), null);

  for (const source of ["unstop", "hack2skill"]) {
    const item = { ...legacy, source };
    assert.equal(eventDates(item).start, null);
    assert.equal(eventDates(item).end, null);
    assert.equal(eventDateLabel(item), "Event dates not published");
  }
  const devpost = { ...legacy, source: "devpost" };
  assert.equal(eventDates(devpost).kind, "submission");
  assert.match(eventOneLiner(devpost), /^Submissions close/);
  assert.equal(countdownHeading(devpost), "Submissions close in");
  assert.equal(registrationDeadline(devpost), null);

  const actual = { ...legacy, details: parseDetails({
    eventStart: legacy.date, eventEnd: "2026-10-31T12:00:00.000Z", regEnd: legacy.endDate,
  }) };
  assert.ok(actual.details);
  assert.match(buildGlance(actual).find(r => r.label === "Runs")!.value, /Oct 30.*Oct 31/);
  assert.equal(eventDates(actual).deadline, legacy.endDate);
  assert.equal(parseDetails({ regEnd: "invalid" }), null);
  assert.equal(eventPhase("2026-10-10T00:00:00Z", "2026-10-11T00:00:00Z"), "upcoming");
  assert.equal(eventPhase("2026-10-05T00:00:00Z", "2026-10-08T00:00:00Z"), "ongoing");
  assert.equal(eventPhase("2026-10-01T00:00:00Z", "2026-10-03T00:00:00Z"), "ended");
  assert.equal(formatDateRange(legacy.date, legacy.endDate), formatDateRange(legacy.date));
  // Both UTC dates land on the same IST day; the range must collapse.
  assert.equal(formatDateRange("2026-10-06T19:00:00Z", "2026-10-07T02:00:00Z"), "Wed, Oct 7");
  assert.equal(startOfDay(Date.parse("2026-10-06T20:00:00Z")), Date.parse("2026-10-06T18:30:00Z"));

  assert.deepEqual(actionableEventWhere(new Date(now)), { OR: [
    { endDate: { gt: new Date(now) } }, { endDate: null, date: { gt: new Date(now) } },
  ] });
  const where = buildEventWhere({ timeframe: "week" }, new Date(now));
  assert.deepEqual(where.AND, [actionableEventWhere(new Date(now)), { OR: [
    { endDate: { lte: new Date(now + 7 * 86400000) } },
    { endDate: null, date: { lte: new Date(now + 7 * 86400000) } },
  ] }]);

  const scored = (id: string, end: string, status = "APPROVED") => ({
    id, date: new Date(legacy.date), endDate: new Date(end), source: "devfolio",
    deadlineKind: "registration", status, tags: "[]", eventType: "hackathon",
    beginnerFriendly: false, isOnline: false, city: "India",
  });
  const viewer = scored("current", legacy.endDate);
  assert.deepEqual(similarEvents(viewer, [
    scored("closed", closed.endDate), scored("pending", legacy.endDate, "PENDING"),
    viewer, scored("open", legacy.endDate), scored("at-boundary", new Date(now).toISOString()),
  ], 3, now).map(e => e.id), ["open"]);

  const dto: EventDTO = {
    ...legacy, id: "test", summary: null, description: null, city: "India", country: "India",
    eventType: "hackathon", organizer: "Test", link: null, imageUrl: null, tags: [],
    beginnerFriendly: false, alsoOn: [], brief: null, whoCanJoin: null, details: null,
    fetchedAt: new Date(now).toISOString(), status: "APPROVED", createdAt: new Date(now).toISOString(),
  };
  const row = renderToStaticMarkup(<IndexRow event={dto} index={1} />);
  assert.match(row, /Registration open/);
  assert.doesNotMatch(row, /Oct 30.*– Oct 7/);
  const axis = renderToStaticMarkup(<TimeAxis events={[dto]} now={new Date(now).toISOString()} />);
  assert.match(axis, /Registration closes in/);
  const mobile = renderToStaticMarkup(<TimeAxisMobile events={[dto]} now={new Date(now).toISOString()} />);
  assert.match(mobile, /Registration closes in/);

  // Adapter contract test using a fixture response: no network or database writes.
  const originalFetch = globalThis.fetch;
  const payload = { props: { pageProps: { dehydratedState: { queries: [{ state: { data: {
    open_hackathons: [{ name: legacy.title, uuid: "fixture", starts_at: legacy.date,
      ends_at: "2026-10-31T12:00:00.000Z", settings: { reg_ends_at: legacy.endDate,
        site: "https://example.com" } }],
  } } }] } } } };
  globalThis.fetch = async () => new Response(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script>`);
  try {
    const adapter = CITY_AGNOSTIC_SOURCES.find(s => s.id === "devfolio")!;
    const result = await adapter.fetch();
    assert.equal(result.length, 1);
    assert.equal(result[0].details?.regEnd, legacy.endDate);
    assert.equal(result[0].details?.eventStart, legacy.date);
    assert.equal(result[0].details?.eventEnd, "2026-10-31T12:00:00.000Z");
  } finally { globalThis.fetch = originalFetch; }
  console.log("Event date, deadline, discovery, recommendation, render and adapter regressions passed.");
}

main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => { Date.now = originalNow; });
