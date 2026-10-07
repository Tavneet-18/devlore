# Source adapters

Method, yield and constraints for every source, recorded so the next person
does not have to re-derive it. Verified against the live sites on 29 Sep 2026.

All adapters share `lib/ai/sources/http.ts`, which provides the three
obligations every source has:

- a descriptive `User-Agent` with a contact URL
- at most one request per second per host (in-process; bounds bursts within a
  run, not across lambda instances)
- a timeout, a small retry with backoff, and `return []` on failure so a dead
  platform can never abort a run

Every adapter returns `[]` rather than throwing. `scripts/test-new-sources.ts`
runs them all live and asserts that, plus that no row is missing a `sourceId`,
`link` or `date`, and that nothing past-dated leaks through.

## Confirmed working

| Source | Method | Yield | Registration deadline |
|---|---|---|---|
| Devfolio | (b) `__NEXT_DATA__` | 20 | yes — `settings.reg_ends_at` |
| Hack2Skill | (a) public JSON API | 5 | yes — `registrationEnd` |
| WeMakeDevs | (b) RSC flight payload | 3 | no — `endDate` only |
| MLH | (b) Inertia JSON island | 72 | no — `endsAt` only |

### Devfolio — `https://devfolio.co/hackathons`

`__NEXT_DATA__` → `props.pageProps.dehydratedState.queries[0].state.data.open_hackathons`.

robots.txt is `User-agent: * / Disallow:` — empty, i.e. allow all.

The only source publishing a genuine registration deadline, which is the date
this product counts down to. Also gives `uuid`, `settings.site` (the real
registration link), `featured_cover_img` and `participants_count`.

Caveat: a fixed global list of 20. No city filter and no pagination — verified
that `?city=`, `?page=2` and `?status=` all return the same 20. There is also no
city field, so offline events get `city: "India"` rather than a guessed city.

### Hack2Skill — `/api/v1/event/<slug>/event-details`

Method (a). `/events` is a 404 inside their Vite SPA and the HTML shell is 9KB
with no data, so the endpoint was found by loading a real event page in a
browser and reading its network log.

There is **no list endpoint** (eight shapes probed, all 404). Slugs come from
the `sitemap.xml` that robots.txt itself declares.

robots.txt disallows **356 individual event slugs**. The audit showed zero
overlap with the 327 sitemap slugs, but the adapter subtracts the blocked set
before requesting anything, so a future sitemap change cannot make us fetch a
disallowed page. The 180-day `lastmod` window and a 40-request cap bound the
run; measured hit rate is ~40% of touched slugs having a future deadline.

### WeMakeDevs — `https://www.wemakedevs.org/hackathons`

Method (b). Next.js App Router, so the data is an RSC flight payload
(`self.__next_f.push`). 29 cards, of which 3 have a future end date.
`/meetups` has a different card shape with no `endDate` and 0 future events.

No robots.txt (404) and no `noindex` meta on the pages. They also publish an
`/llms.txt` describing the platform.

### MLH — `https://www.mlh.com/seasons/<year>/events`

Method (b). Inertia app; data is in `<script data-page="app" type="application/json">`
under `props.upcomingEvents`.

`api.mlh.com` returns **401** and is deliberately not used. robots.txt allows
public pages and disallows `/account`, `/tools`, `/auth`, `/admin`.

The 2026 season has 1 upcoming event but **2027 has 71** — hence querying
several seasons newest-first. These are mostly North American university
hackathons, which widens the site's geographic scope beyond the six Indian
cities. Filter them out by source if that is not wanted.

No status filter is applied. MLH's own public upcoming page is the authority
on what is published, and its events carry `status: "pending"` (an internal
review state) — filtering on the status string returned zero events.

## Skipped

| Source | Why |
|---|---|
| HackerEarth | Listing is an RSC payload with **0 ISO datetimes**; almost certainly a separate challenges API that was not found. |
| Luma | robots.txt has **no `User-agent: *` block at all** (only Googlebot rules), and the API requires a key. No permitted public route found. |
| Hack Club | `__NEXT_DATA__` contains only a `months` calendar; no event objects. |
| Meetup | Pre-existing: needs `MEETUP_TOKEN` for its GraphQL endpoint. |

## Deadline semantics

Two of the four sources publish a registration deadline and two do not, so
`Event.deadlineKind` records which date the countdown is measuring:

- `registration` — a real registration deadline (Devfolio, Hack2Skill)
- `event-end` — no deadline published; we count down to the event's end date
  (WeMakeDevs, MLH)
- `null` — manual submissions, which have no deadline of any kind

The UI must not label an `event-end` row "Registration closes". Until that
label ships, the values are stored correctly but the existing copy is generic.

## Fixtures

`tests/fixtures/` holds one real captured payload per source, with
`scripts/capture-fixtures.mjs` and `capture-fixture-hack2skill.mjs` /
`capture-fixture-wmd.mjs` to re-capture them. Intended for parser unit tests
that must not hit the network.


## Date compatibility and display (7 October 2026)

The database date/endDate columns remain legacy index bounds: for listings
with a closing deadline, endDate (or date when endDate is absent) is the
closing reference. They must not be rendered directly as the event run range.

The existing details JSON now stores eventStart, eventEnd, regEnd and
submissionEnd separately. Explicit null event dates mean the source did not
publish them. No database migration is required. Devfolio preserves its real
start and finish alongside registration close. Hack2Skill and Unstop do not
promote registration dates to event dates. Devpost's listing period ends with
submissions, so its countdown says "Submissions close" and does not offer a
registration-deadline calendar entry.

lib/event-dates.ts interprets both old and newly ingested rows. Old Devfolio
rows display the known start but omit the unrecorded actual end. Old
Hack2Skill/Unstop rows omit event dates. Next ingestion refreshes separated
facts naturally; this change does not perform a production backfill.

Discovery and recommendation queries use the closing reference exclusively,
so a later event start cannot keep closed registration in actionable results.
A second source cannot replace a primary source timeline with a different
kind of deadline. The date/endDate convention remains in place until a future
schema migration introduces dedicated indexed date columns.

Offline regression verification:
node node_modules/tsx/dist/cli.mjs scripts/test-event-dates.tsx
