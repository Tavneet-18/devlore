import type { DiscoverySource, RawEvent } from "../types";
import { cityAliases } from "../../event-filters";
import { USER_AGENT } from "./http";

/**
 * Live event sources — free, no API keys.
 *
 * Each source reads a public JSON endpoint and maps the response into the
 * RawEvent contract. Anything that cannot be verified (unparseable date,
 * closed registration, missing title) is dropped rather than guessed, so a
 * flaky source degrades to "no events" instead of polluting the database.
 *
 * Active when DISCOVERY_MODE=live. Swap is one line in lib/ai/index.ts.
 *
 * Source coverage, as measured rather than as hoped:
 *   devpost — working; the largest single source (17 of 49 events)
 *   unstop  — wired but yielding nothing: the endpoint returns an empty array
 *             for every parameter combination tried. See the note on unstopFetch.
 *   gdg     — working, but thin: 7 upcoming events across 6 Indian chapters,
 *            all virtual. Fixes the type mix, not the volume.
 *   meetup  — disabled, needs a MEETUP_TOKEN for its GraphQL endpoint
 *
 * The corollary is that the index is almost entirely hackathons, because every
 * source that actually returns rows only lists hackathons. GDG is the one
 * adapter here that yields a different event type. Widening the mix means
 * finding in-person tech-event sources, not tuning these.
 */

type ExtractFn = (city: string) => Promise<RawEvent[]>;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Parse a date or a date range into { start, end } ISO strings.
 *
 * Handles the shapes our sources actually emit:
 *   - ISO / RFC                 "2026-05-10T10:00:00Z"
 *   - Devpost range             "Sep 01 - Oct 23, 2026"
 *   - Devpost range, one month  "Jul 23 - Aug 31, 2026"
 *   - Devpost single day        "Apr 28, 2022"
 *   - Month + day, no year      "Feb 28"
 *
 * Returns null when nothing parses, so callers drop the row instead of
 * inventing a date. A missing end falls back to the start.
 */
function parseDateRange(raw: string | undefined | null): { start: string; end: string } | null {
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    const iso = direct.toISOString();
    return { start: iso, end: iso };
  }

  const text = raw.replace(/\s+/g, " ").trim();
  const yearMatch = text.match(/(\d{4})/);
  const explicitYear = yearMatch ? Number(yearMatch[1]) : null;

  // Collect every "Month DD" or "DD Month" pair in the string, in order.
  const monthFirst = [...text.matchAll(/([A-Za-z]{3,9})\s+(\d{1,2})/g)];
  const dayFirst = [...text.matchAll(/(\d{1,2})[-\s]([A-Za-z]{3,9})/g)];

  const parts: { month: number; day: number }[] = [];
  for (const m of monthFirst) {
    const idx = MONTHS.findIndex((x) => m[1].toLowerCase().startsWith(x));
    if (idx >= 0) parts.push({ month: idx, day: Number(m[2]) });
  }
  if (parts.length === 0) {
    for (const m of dayFirst) {
      const idx = MONTHS.findIndex((x) => m[2].toLowerCase().startsWith(x));
      if (idx >= 0) parts.push({ month: idx, day: Number(m[1]) });
    }
  }
  if (parts.length === 0) return null;

  const first = parts[0];
  const last = parts[parts.length - 1];

  const build = (p: { month: number; day: number }, isLast: boolean) => {
    const year = explicitYear ?? new Date().getFullYear();
    const d = new Date(Date.UTC(year, p.month, p.day, 9, 0, 0));
    // With no explicit year, roll forward if the month has already passed.
    if (explicitYear === null && d.getTime() < Date.now() - 86400000) {
      d.setUTCFullYear(year + 1);
    }
    // A range that wrapped the new year (e.g. Dec 28 - Jan 05) needs the end
    // date in the following year.
    if (isLast && explicitYear === null && last.month < first.month) {
      d.setUTCFullYear(year + 1);
    }
    return d;
  };

  const start = build(first, false);
  const end = build(last, true);
  if (Number.isNaN(start.getTime())) return null;

  return { start: start.toISOString(), end: end.toISOString() };
}

/** Convenience wrapper for sources that expose a single date. */
function parseEventDate(raw: string | undefined | null): string | null {
  return parseDateRange(raw)?.start ?? null;
}

/** Strip HTML tags from prize strings like "₹ <span ...>100,000</span>". */
function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Devpost returns protocol-relative thumbnail paths ("//host/path"). Browsers
 * need an absolute URL, so promote them to https. Anything unparseable is
 * dropped rather than rendered as a broken image.
 */
function normaliseImage(value: string): string | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  const withScheme = raw.startsWith("//") ? `https:${raw}` : raw;
  if (!/^https?:\/\//i.test(withScheme)) return undefined;
  return withScheme;
}

/**
 * Source listings spell our cities inconsistently (Bengaluru vs Bangalore,
 * "Navi Mumbai" vs Mumbai, "Delhi NCR" vs Delhi). Expand each requested city
 * into the set of spellings that should count as a match.
 */
/** All source spellings for the requested city, shared with public filters. */
function cityNeedles(city: string): readonly string[] {
  return cityAliases(city.split(",")[0]);
}

/** Drop rows that are closed, undated, or already in the past. */
function isStillRelevant(date: string): boolean {
  return new Date(date).getTime() >= Date.now() - 86400000;
}

// --- Devpost (public JSON API, no key) ---
/**
 * Devpost's `search` parameter matches the title only, so a city query
 * (e.g. "Bangalore") mostly returns 10-year-old archived events. The
 * `status[]` filter is the reliable way to get live registrations, so we
 * page through the open list instead and then filter by city ourselves.
 *
 * Online entries are collected once alongside local results. The public city
 * filter still requires a published city; online does not imply every city.
 */
const devpostFetch: ExtractFn = async (city) => {
  const needles = cityNeedles(city);
  const online: RawEvent[] = [];
  const inCity: RawEvent[] = [];

  try {
    // Page 1 is dominated by global/online events, so city-specific offline
    // entries usually appear a few pages in. Scan a few pages, keep the best
    // of each bucket, then prefer the city-specific results.
    for (let page = 1; page <= 4; page++) {
      const url =
        `https://devpost.com/api/hackathons?status[]=upcoming&status[]=open` +
        `&per_page=50&page=${page}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) break;

      const data = await res.json();
      const items = (data.hackathons ?? []) as Record<string, unknown>[];
      if (items.length === 0) break;

      for (const h of items) {
        const title = String(h.title ?? h.name ?? "").trim();
        if (!title) continue;

        // Defensive: skip anything already closed even if the filter missed it.
        const openState = String(h.open_state ?? "").toLowerCase();
        const timeLeft = String(h.time_left_to_submission ?? "").toLowerCase();
        if (openState === "ended" || timeLeft === "ended") continue;

        // Devpost gives a submission window, e.g. "Sep 01 - Oct 23, 2026".
        // The window may have already opened while registration is still open,
        // so relevance is judged on the END of the window, not the start.
        const range = parseDateRange(String(h.submission_period_dates ?? h.start_date ?? ""));
        if (!range || !isStillRelevant(range.end)) continue;

        const location = String(
          (h.displayed_location as { location?: string } | undefined)?.location ?? ""
        ).trim();
        const isOnline = /online|virtual|worldwide/i.test(location);

        const prize = stripHtml(String(h.prize_amount ?? ""));
        const registrations = Number(h.registrations_count ?? 0);
        const themes = ((h.themes as { name?: string }[] | undefined) ?? [])
          .map((t) => String(t.name ?? "").trim())
          .filter(Boolean);

        const event: RawEvent = {
          source: "devpost",
          title,
          description: [
            themes.length ? `Tracks: ${themes.join(", ")}.` : "",
            prize ? `Prize pool: ${prize}.` : "",
            registrations ? `${registrations.toLocaleString()} registered builders.` : "",
          ]
            .filter(Boolean)
            .join(" "),
          date: range.start,
          endDate: range.end,
          // This is a submission deadline, not a registration deadline.
          deadlineKind: "submission",
          details: {
            eventStart: null, eventEnd: null, submissionStart: range.start, submissionEnd: range.end,
            ...(prize ? { prize: prize.slice(0, 300) } : {}),
            ...(themes.length ? { themes: themes.slice(0, 20).map(theme => theme.slice(0, 60)) } : {}),
            ...(Number.isInteger(registrations) && registrations >= 0 && registrations <= 1_000_000 && h.registrations_count != null ? { participants: registrations } : {}),
            ...(!isOnline && location ? { venue: location.slice(0, 200) } : {}),
            ...(String(h.organization_name ?? "").trim() ? { organiser: String(h.organization_name).trim().slice(0, 120) } : {}),
          },
          venue: isOnline ? undefined : location || undefined,
          city: isOnline ? undefined : location || undefined,
          isOnline,
          organizer: String(h.organization_name ?? "").trim() || "Not stated by the listing (on Devpost)",
          link: String(h.url ?? "https://devpost.com/hackathons"),
          imageUrl: normaliseImage(String(h.thumbnail_url ?? "")),
          eventType: "hackathon",
        };

        if (isOnline) {
          if (online.length < 8) online.push(event);
          continue;
        }

        // Offline: only keep it when the requested city is actually mentioned.
        const haystack = `${title} ${location} ${String(h.organization_name ?? "")}`.toLowerCase();
        if (needles.some((n) => haystack.includes(n)) && inCity.length < 8) inCity.push(event);
      }

      // Enough of both buckets — stop paging early.
      if (inCity.length >= 4 && online.length >= 4) break;
    }
  } catch {
    // fall through to whatever we collected
  }

  // City-specific events first, topped up with online ones.
  return [...inCity, ...online].slice(0, 8);
};

// --- Unstop (public JSON search) ---
//
// Yielded NOTHING for its entire life, through three independent bugs stacked on
// top of each other. Each was independently sufficient to produce zero rows,
// which is why guessing at parameters never found the problem and the source
// got written off as dead.
//
// 1. `opportunity=hackathon`, singular. The correct value is `hackathons`. The
//    API answers 200 with a valid empty array rather than an error, so a typo
//    in one filter value is indistinguishable from a dead endpoint.
// 2. The response is a paginated envelope, `{ data: { data: [...] } }`. The
//    adapter read `data.data ?? data`, which is the envelope, not the rows.
// 3. Every field name it read was absent from the payload. There is no
//    `startDate`, `endDate`, `location`, `city` or `description` — they are
//    `start_regn_dt`, `end_regn_dt`, `address_with_country_logo` and `details`.
//    So `parseEventDate("")` returned null and the date guard dropped all 263
//    open listings on the first parse.
//
// Found by rendering unstop.com/hackathons and reading the request the page
// actually makes, rather than continuing to guess. The endpoint was never
// broken and never needed a session.
//
// 263 open hackathons, which makes this the second-largest source on the site
// after Devfolio.
const UNSTOP_PER_PAGE = 50;

const unstopFetch: ExtractFn = async (_city) => {
  try {
    const url =
      `https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons` +
      `&page=1&per_page=${UNSTOP_PER_PAGE}&oppstatus=open`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        // The endpoint is public, but it sits behind a bot filter that treats a
        // request with no referer as unattributed.
        Referer: "https://unstop.com/hackathons",
      },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const items = (data?.data?.data ?? []) as Record<string, unknown>[];

    const out: RawEvent[] = [];
    for (const o of items) {
      const title = String(o.title ?? "").trim();
      if (!title) continue;

      const regn = (o.regnRequirements ?? {}) as {
        start_regn_dt?: string;
        end_regn_dt?: string;
        min_team_size?: number;
        max_team_size?: number;
      };

      // THE HONESTY PROBLEM, and the reason this mapping is careful.
      //
      // Unstop's search payload publishes a REGISTRATION window and no event
      // start date at all. There is no field to read for when the hackathon
      // actually runs.
      //
      // date is the legacy index bound. Explicit null event dates prevent
      // this registration deadline being displayed as an event date.
      const regEnd = parseEventDate(regn.end_regn_dt);
      if (!regEnd || !isStillRelevant(regEnd)) continue;
      const regStart = parseEventDate(regn.start_regn_dt);

      // Unstop's own online/offline flag, which is more reliable than sniffing
      // the location text for the word "online".
      const addr = (o.address_with_country_logo ?? {}) as {
        address?: string;
        city?: string;
        state?: string;
      };
      // Unstop repeats the city across address, city and state — Jammu publishes
      // address "Jammu", city "Jammu", state "Jammu and Kashmir", which
      // concatenated naively reads "Jammu, Jammu, Jammu and Kashmir". Assemble
      // the parts in order and drop any that add nothing the earlier ones did
      // not already say.
      const venueRaw = [addr.address, addr.city, addr.state]
        .map((s) => String(s ?? "").trim())
        .filter(Boolean)
        .filter((part, i, all) => !all.slice(0, i).some((prev) => prev.includes(part)))
        .join(", ");
      const isOnline = String(o.region ?? "").toLowerCase() === "online";

      // Only LIVE listings. Without this the adapter had no way to tell a
      // closed registration from an open one.
      if (String(o.status ?? "").toUpperCase() !== "LIVE") continue;

      const orgName = String((o.organisation as { name?: string } | undefined)?.name ?? "").trim();
      const seoUrl = String(o.seo_url ?? "").trim();

      // Eligibility as the platform names it. `filters` carries readable
      // audience groups ("Engineering Students"); the raw `eligibility` blob is
      // a JSON string of internal sector codes, which is not something to show
      // a reader.
      const eligibleLabels = Array.isArray(o.filters)
        ? (o.filters as { type?: string; name?: string }[])
            .filter((f) => f.type === "eligible" && f.name && f.name !== "All")
            .map((f) => String(f.name).trim())
        : [];
      const eligibility = eligibleLabels.length ? eligibleLabels.join(", ") : null;

      // Prizes as published — a list of { rank, cash }. Rendered as the ranked
      // list Unstop states, not summed into a single headline number, because
      // Unstop does not publish one and a total would be our arithmetic.
      const prizes = Array.isArray(o.prizes)
        ? (o.prizes as { rank?: string; cash?: number; currency?: string }[])
            .filter((p) => Number(p.cash) > 0)
            .map((p) => `${String(p.rank ?? "").trim() || "Prize"} ₹${Number(p.cash).toLocaleString("en-IN")}`)
        : [];
      const prizeLabel = prizes.length ? prizes.join(", ") : null;

      // Paid entries, from the amount Unstop publishes. Its absence never
      // implies free — that distinction is the whole point of `feeAmount` being
      // separate from `fee`.
      const services = Array.isArray(o.payment_services)
        ? (o.payment_services as { amount?: number }[])
        : [];
      const paidAmount = services.reduce((s, p) => s + Number(p.amount ?? 0), 0);

      const teamMin = Number(regn.min_team_size ?? 0);
      const teamMax = Number(regn.max_team_size ?? 0);
      const registered = Number(o.registerCount ?? 0);

      out.push({
        source: "unstop",
        // The platform's own numeric id. Stable across title edits, which the
        // SEO url is not.
        sourceId: o.id ? String(o.id) : seoUrl || undefined,
        title,
        // The organiser's own words, and nothing substituted when empty. The
        // previous fallback invented "Apply and form a team to compete" for any
        // record with a blank description, asserting that a listing was a team
        // competition when it might be a workshop, a quiz or a fellowship.
        description: stripHtml(String(o.details ?? "")),
        date: regEnd,
        endDate: undefined,
        deadlineKind: "registration",
        venue: isOnline ? undefined : venueRaw || undefined,
        city: isOnline ? undefined : String(addr.city ?? "").trim() || undefined,
        isOnline,
        organizer: orgName || "Not stated by the listing (on Unstop)",
        link: seoUrl || undefined,
        // The organiser's mark, not an event poster. Unstop publishes no event
        // image in this payload — `thumb` is the literal string "null" — so
        // logoUrl2 is the difference between a real image and a broken one.
        imageUrl: normaliseImage(String(o.logoUrl2 ?? "")),
        // Justified by the request itself: the query pins
        // `opportunity=hackathons`, so every row this adapter can see is one.
        // The parameter, not the platform, decides the type.
        eventType: "hackathon",
        details: {
          eventStart: null,
          eventEnd: null,
          regEnd,
          ...(!isOnline && venueRaw ? { venue: venueRaw.slice(0, 200) } : {}),
          ...(prizeLabel ? { prize: prizeLabel.slice(0, 300) } : {}),
          ...(eligibility ? { eligibility: eligibility.slice(0, 400) } : {}),
          ...(teamMin >= 1 ? { teamMin } : {}),
          ...(teamMax >= 1 ? { teamMax } : {}),
          ...(registered > 0 ? { participants: registered } : {}),
          ...(regStart ? { regStart } : {}),
          ...(paidAmount > 0 ? { feeAmount: `₹${paidAmount.toLocaleString("en-IN")}` } : {}),
          ...(orgName ? { organiser: orgName.slice(0, 120) } : {}),
        },
      });
    }
    return out;
  } catch {
    return [];
  }
};

// --- Meetup ---
// Meetup's event search lives behind an internal GraphQL endpoint that requires
// an auth cookie. Without a token we cannot read it reliably, so this source
// intentionally returns [] rather than injecting unverified data.
// Add MEETUP_TOKEN and implement the GQL query here to enable it.
const meetupFetch: ExtractFn = async () => [];

// --- GDG Community chapters ---
//
// The previous adapter called /api/search?query=<city>, which is a chapter
// *directory* search rather than an events endpoint — it answers HTTP 400 for
// every parameter spelling, and even when it answers, a chapter record carries
// no event date, so every row was dropped by the date guard. It then papered
// over the empty description with an invented sentence ("Talks, demos and
// networking"), which is exactly the fabrication this site must never publish.
// Both problems are fixed by reading the real endpoint below.
//
// gdg.community.dev runs on Bevy, which exposes each chapter's events as JSON at
// /api/event_slim/for_chapter/<id>/. The id is not documented anywhere, but it
// appears in the chapter's own page HTML, so it is resolved at runtime and
// cached rather than hardcoded — if Google renumbers a chapter the adapter
// follows, instead of silently returning nothing forever.
//
// Measured yield, because it is thin and worth being honest about: across
// Bangalore, Hyderabad, Chennai, Pune and Kolkata, 426 events are published in
// total but only SEVEN are still upcoming, and all seven are virtual. Most
// Indian GDG chapters now run their sessions online, and the platform keeps
// years of archive. This source fixes the "no non-hackathon types" gap rather
// than adding volume, and it is documented as such so nobody later assumes the
// site has broad chapter coverage.

/**
 * City -> chapter slug.
 *
 * Not every city has a chapter here, and the slugs are not derivable from the
 * city name: Delhi is "gdg-new-delhi", and Mumbai has no chapter on this
 * platform at all (checked against every plausible slug). A city absent here is
 * skipped, not guessed at.
 */
const GDG_CHAPTERS: Record<string, string> = {
  bangalore: "gdg-bangalore",
  delhi: "gdg-new-delhi",
  hyderabad: "gdg-hyderabad",
  pune: "gdg-pune",
  chennai: "gdg-chennai",
  kolkata: "gdg-kolkata",
};

/** slug -> chapter id, or null once we know the page does not exist. */
const gdgChapterIds = new Map<string, string | null>();

async function resolveGdgChapterId(slug: string): Promise<string | null> {
  const cached = gdgChapterIds.get(slug);
  if (cached !== undefined) return cached;

  let id: string | null = null;
  try {
    const res = await fetch(`https://gdg.community.dev/${slug}/`, {
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "text/html", "User-Agent": USER_AGENT },
    });
    if (res.ok) {
      const html = await res.text();
      id = html.match(/for_chapter\/(\d+)/)?.[1] ?? null;
    }
  } catch {
    id = null;
  }

  // Cached either way, including the failure: a chapter page that 404s today
  // will 404 tomorrow, and re-requesting it once per city per run is a request
  // spent to learn nothing.
  gdgChapterIds.set(slug, id);
  return id;
}

const gdgFetch: ExtractFn = async (city) => {
  const slug = GDG_CHAPTERS[city.toLowerCase().trim()];
  if (!slug) return [];

  try {
    const chapterId = await resolveGdgChapterId(slug);
    if (!chapterId) return [];

    const url =
      `https://gdg.community.dev/api/event_slim/for_chapter/${chapterId}/` +
      `?page_size=100&order=start_date&page=1`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const items = (data?.results ?? []) as Record<string, unknown>[];
    const chapterTitle = String(items[0]?.chapter_title ?? "").trim();

    const out: RawEvent[] = [];
    for (const e of items) {
      if (e.is_hidden) continue;

      const title = String(e.title ?? "").trim();
      if (!title) continue;

      const date = parseEventDate(String(e.start_date ?? ""));
      // Relevance is judged on the session's own start. A chapter that published
      // last year's archive is not a source of upcoming events, and filtering
      // here is what keeps 400-odd past rows out of the database.
      if (!date || !isStillRelevant(date)) continue;

      const end = parseEventDate(String(e.end_date ?? ""));
      // Bevy's end_date is when the session finishes, never a registration
      // deadline. Saying so explicitly matters: without it the site labels a
      // finish date as "Closes", which is the distinction the whole deadline
      // model rests on.
      const endDate = end && new Date(end) > new Date(date) ? end : undefined;

      const isOnline = Boolean(e.is_virtual_event);
      const link = String(e.static_url ?? "").trim() || undefined;
      const image = normaliseImage(
        String(
          (e.picture as { url?: string } | null)?.url ?? e.cropped_picture_url ?? ""
        )
      );

      out.push({
        source: "gdg",
        // static_url is chapter-stable, which is what the upsert keys on. The
        // listing URL is not: platforms rewrite those.
        sourceId: link ? `${chapterId}:${link}` : undefined,
        title,
        // The organiser's own words, and nothing else. The previous adapter
        // invented "Talks, demos and networking" when this was empty, which
        // asserted content about a session it had never read — a GDG event can
        // be a workshop, a study jam or a conference. An empty description is
        // the honest value and every other source already produces one.
        description: stripHtml(String(e.description_short ?? e.description ?? "")).slice(0, 600),
        date,
        endDate,
        deadlineKind: "event-end",
        // A virtual session has no venue, and claiming the chapter's city as one
        // would put a location on an event with no physical location.
        venue: undefined,
        city: isOnline ? undefined : city,
        isOnline,
        // The chapter, named by the platform. Not "GDG Community", which is a
        // programme rather than an organiser.
        organizer: chapterTitle || "GDG Community",
        link,
        imageUrl: image,
        eventType: "meetup",
        details: {
          eventStart: date,
          eventEnd: endDate ?? null,
          ...(chapterTitle ? { organiser: chapterTitle.slice(0, 120) } : {}),
          noDeadlineReason: "The chapter publishes no registration deadline for this session.",
        },
      });
    }
    return out;
  } catch {
    return [];
  }
};

export const LIVE_SOURCES: DiscoverySource[] = [
  { id: "devpost", displayName: "Devpost", fetch: devpostFetch },
  { id: "unstop", displayName: "Unstop", fetch: unstopFetch },
  { id: "meetup", displayName: "Meetup", fetch: meetupFetch },
  { id: "gdg", displayName: "GDG Events", fetch: gdgFetch },
];
