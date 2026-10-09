import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { EventQuickLook } from "../components/EventQuickLook";
import { ReportEventButton } from "../components/ReportEventButton";
import type { EventDTO } from "../lib/events";

const fixture: EventDTO = {
  id: "fixture", title: "Offline fixture", source: "unstop",
  date: "2099-01-01T00:00:00Z", endDate: null, city: "India", country: "India",
  isOnline: false, eventType: "hackathon", organizer: "Fixture organiser",
  summary: null, description: null, link: "https://example.com", imageUrl: null,
  tags: [], beginnerFriendly: false, deadlineKind: "registration", alsoOn: [],
  brief: null, whoCanJoin: null, details: { eventStart: null, eventEnd: null, regEnd: "2099-01-01T00:00:00Z" },
  fetchedAt: "2026-10-10T00:00:00Z", createdAt: "2026-10-10T00:00:00Z", status: "APPROVED",
};
const render = (event: EventDTO) => renderToStaticMarkup(<EventQuickLook event={event} onClose={() => {}} />);
const offline = render(fixture);
assert.match(offline, /Venue/);
assert.match(offline, /Who can join/);
assert.match(offline, /Entry fee/);
assert.match(offline, /Not published by the source/);
assert.doesNotMatch(offline, />India</);
assert.match(offline, /Registration closes/);
assert.doesNotMatch(offline, /Registration deadline/);
assert.doesNotMatch(render({ ...fixture, isOnline: true }), />Venue</);
const published = render({ ...fixture, details: { ...fixture.details, venue: "Campus Hall", eligibility: "College students", fee: "free" } });
assert.match(published, /Campus Hall/);
assert.match(published, /College students/);
assert.match(published, /Free/);
const unknown = render({ ...fixture, deadlineKind: null, details: null });
assert.match(unknown, /Registration deadline/);
const form = renderToStaticMarkup(<ReportEventButton eventId="fixture" />);
for (const reason of ["wrong_date", "wrong_location", "broken_link", "duplicate", "other"]) assert.match(form, new RegExp(`value="${reason}"`));
assert.match(form, /maxLength="500"/i);
assert.match(form, /<legend/);
assert.match(form, /aria-describedby=/);
assert.match(form, /type="submit"/);
console.log("Combined quick-look facts, missing rows and accessible report-form render checks passed.");
