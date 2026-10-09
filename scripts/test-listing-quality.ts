import assert from "node:assert/strict";
import { LIVE_SOURCES } from "../lib/ai/sources/liveSources";
import { CITY_AGNOSTIC_SOURCES } from "../lib/ai/sources/indiaSources";
import { parseDetails } from "../lib/event-details";
import { buildGlance } from "../lib/event-summary";

const start = "2099-01-01T00:00:00Z";
const end = "2099-01-03T00:00:00Z";
async function main() {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ hackathons: [{
      title: "Published facts", submission_period_dates: end,
      displayed_location: { location: "Online" }, prize_amount: "$<b>500</b>",
      registrations_count: 23, themes: [{ name: "AI" }], organization_name: "Actual organiser",
      url: "https://example.com/hackathon",
    }] });
    const devpost = (await LIVE_SOURCES.find(s => s.id === "devpost")!.fetch("Bangalore"))[0];
    const facts = parseDetails(devpost.details)!;
    assert.equal(facts.prize, "$500");
    assert.deepEqual(facts.themes, ["AI"]);
    assert.equal(facts.participants, 23);
    assert.equal(facts.organiser, "Actual organiser");
    assert.equal(facts.venue, undefined);
    assert.equal(facts.eventStart, null);
    assert.doesNotMatch(devpost.description, /open-source|sprint|team/);

    globalThis.fetch = async () => Response.json({ data: { data: [{
      id: 1, title: "Offline event", status: "LIVE", region: "offline",
      regnRequirements: { end_regn_dt: end }, address_with_country_logo: { address: "Campus", city: "Pune", state: "Maharashtra" },
    }] } });
    const unstop = (await LIVE_SOURCES.find(s => s.id === "unstop")!.fetch("Mumbai"))[0];
    assert.equal(parseDetails(unstop.details)?.venue, "Campus, Pune, Maharashtra");
    assert.equal(unstop.city, "Pune");
    assert.equal(unstop.details?.fee, undefined);

    const card = { id: "00000000-0000-0000-0000-000000000000", title: "Event date fixture",
      formats: ["online"], location: "Online", startDate: "2099-01-01", endDate: "2099-01-03", href: "/fixture" };
    globalThis.fetch = async () => new Response(`<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(card))}])</script>`);
    const wmd = (await CITY_AGNOSTIC_SOURCES.find(s => s.id === "wemakedevs")!.fetch())[0];
    assert.ok(wmd);
    assert.ok(parseDetails(wmd.details));
    assert.equal(wmd.details?.regStart, undefined);
    assert.equal(wmd.details?.eventStart, new Date(start).toISOString());
    assert.equal(wmd.details?.eventEnd, new Date(end).toISOString());
    assert.equal(wmd.city, undefined);

    globalThis.fetch = async () => new Response(`<script data-page="app" type="application/json">${JSON.stringify({ props: { upcomingEvents: [{
      id: "mlh-fixture", name: "Member event", startsAt: start, endsAt: end,
      venueAddress: { city: "Pune", country: "IN" }, formatType: "in-person",
    }] } })}</script>`);
    const mlh = (await CITY_AGNOSTIC_SOURCES.find(s => s.id === "mlh")!.fetch())[0];
    assert.ok(mlh, "structured India address keeps event in scope even without location text");
    assert.equal(mlh.city, "Pune");
    assert.equal(mlh.details?.organiser, undefined, "MLH membership does not establish organiser identity");
    assert.ok(parseDetails(mlh.details));
    assert.equal(mlh.details?.eventStart, new Date(start).toISOString());

    const base = { title: "Fixture", source: "devfolio", date: start, city: "India", isOnline: false };
    assert.equal(buildGlance(base).some(row => row.label === "Venue"), false);
    assert.equal(buildGlance({ ...base, details: { venue: "India" } }).some(row => row.label === "Venue"), false);
    assert.equal(buildGlance({ ...base, details: { venue: "Campus Hall, Pune" } }).find(row => row.label === "Venue")?.value, "Campus Hall, Pune");
    console.log("Published facts, missing venue, organiser identity and event-date source regressions passed.");
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
