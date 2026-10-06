import type { DiscoveryOptions, RawEvent } from "../types";
import { politeFetch, fetchText, fetchJson, extractNextData, decodeFlightPayload } from "./http";
import type { EventDetails } from "../../event-details";
import { readTeamSize } from "../../event-details";

/**
 * Adapters for Devfolio, Hack2Skill, WeMakeDevs and MLH.
 *
 * Each was verified against the live site before being written; the method used
 * and the yield measured are recorded in docs/source-adapters.md. Captured
 * payloads live in tests/fixtures/ so the parsers can be unit tested without
 * hitting the network.
 *
 * Every adapter returns [] on any failure. A platform that is down, has moved
 * its markup, or has started blocking us must never abort a run — the ingest
 * records the error against that source and carries on.
 *
 * robots.txt notes, because they constrain what may be requested:
 *   devfolio.co   "User-agent: * / Disallow:" — empty, i.e. allow all
 *   hack2skill    Allow: /event/ but 356 individual event slugs are Disallowed.
 *                 Slugs come from their robots-declared sitemap and the
 *                 blocked set is subtracted before anything is requested; the
 *                 audit showed zero overlap, but the filter is enforced anyway.
 *   wemakedevs    no robots.txt (404). Pages carry no noindex meta.
 *   mlh.com       Disallow on /account, /tools, /auth, /admin etc., then
 *                 "Allow: /". Public season pages are permitted. The JSON API
 *                 at api.mlh.com returns 401 and is NOT used.
 */

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

const DAY = 86400000;

/** Keep only events whose reference date is still ahead of us. */
function isStillRelevant(date: string | null | undefined): boolean {
  if (!date) return false;
  const t = new Date(date).getTime();
  return !Number.isNaN(t) && t >= Date.now() - DAY;
}

/** Absolute-ise a URL, returning null if it is not usable. */
function safeUrl(value: string | undefined | null, base: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const withScheme = raw.startsWith("//") ? `https:${raw}` : raw;
  const absolute = /^https?:\/\//i.test(withScheme) ? withScheme : `${base}${withScheme.startsWith("/") ? "" : "/"}${withScheme}`;
  try {
    const u = new URL(absolute);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Strip tags and collapse whitespace. */
function plain(value: unknown, max = 600): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Scope gate for end-date-only sources.
 *
 * Devfolio and Hack2Skill publish a real registration deadline, which is what
 * this product is built around. WeMakeDevs and MLH do not — for those the only
 * date is when the event finishes, which is a different fact and must not be
 * presented as a closing deadline.
 *
 * Keeping every MLH event therefore added 70-odd North American university
 * hackathons to a site built around Indian builders, and gave the closing axis
 * numbers that were not closings. So for these sources we keep only what is
 * genuinely relevant here: anything online, plus anything physically in India.
 */
const INDIA_HINTS =
  /\b(india|indian|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|chennai|kolkata|ahmedabad|jaipur|indore|kochi|coimbatore|chandigarh|noida|gurgaon|gurugram|haryana|maharashtra|karnataka|telangana|gujarat|rajasthan|madhya pradesh|tamil nadu|uttar pradesh|new delhi|navi mumbai|thane|pune)\b/i;

/**
 * A location string that names a delivery format rather than a place.
 *
 * WeMakeDevs puts "Hybrid" or "Online" in its location field for events with no
 * fixed venue. Treating that as an address would put "Venue: Hybrid" on the
 * detail page, which is not a venue.
 */
function isFormatWord(value: string): boolean {
  return /^(online|virtual|remote|hybrid|in[- ]?person|offline|tbd|anywhere|global)$/i.test(value.trim());
}

function isInScope(raw: { isOnline?: boolean; city?: string | null; venue?: string }): boolean {
  if (raw.isOnline) return true;
  return INDIA_HINTS.test(`${raw.city ?? ""} ${raw.venue ?? ""}`);
}

/* -------------------------------------------------------------------------- */
/* Devfolio — method (b), __NEXT_DATA__ JSON island                           */
/* ---------------------------------------------------------------------------- */
/* The largest Indian hackathon platform. Yields ~20 open events and, uniquely, */
/* a genuine REGISTRATION deadline in settings.reg_ends_at — which is the date  */
/* our whole product counts down to.                                         */

const DEVFOLIO_BASE = "https://devfolio.co";

interface DevfolioHackathon {
  uuid?: string;
  slug?: string;
  name?: string;
  type?: string;
  starts_at?: string;
  ends_at?: string;
  is_online?: boolean;
  timezone?: string;
  participants_count?: number;
  themes?: { theme?: { name?: string } }[];
  settings?: {
    reg_ends_at?: string | null;
    reg_starts_at?: string | null;
    site?: string | null;
    external_apply_url?: string | null;
    featured_cover_img?: string | null;
    featured_cover_img_v2?: string | null;
  };
}

/** Shape of the nested react-query cache Devfolio ships inside __NEXT_DATA__. */
interface DevfolioNextData {
  props?: {
    pageProps?: {
      dehydratedState?: {
        queries?: { state?: { data?: { open_hackathons?: DevfolioHackathon[] } } }[];
      };
    };
  };
}

const devfolioFetch = async (): Promise<RawEvent[]> => {
  const html = await fetchText(`${DEVFOLIO_BASE}/hackathons`, { timeoutMs: 20_000 });
  if (!html) return [];

  const next = extractNextData(html) as DevfolioNextData | null;

  const list = next?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data?.open_hackathons ?? [];
  if (!Array.isArray(list)) return [];

  const out: RawEvent[] = [];

  for (const h of list) {
    try {
      const title = plain(h.name, 200);
      if (!title) continue;

      // Prefer the registration deadline. Fall back to the event end and say so.
      const regEnd = h.settings?.reg_ends_at ?? null;
      const eventEnd = h.ends_at ?? null;
      const reference = regEnd ?? eventEnd;
      if (!isStillRelevant(reference)) continue;

      const sourceId = String(h.uuid ?? h.slug ?? "").trim();
      if (!sourceId) continue;

      const themes = (h.themes ?? [])
        .map((t) => t?.theme?.name)
        .filter((n): n is string => Boolean(n))
        .slice(0, 4);

      const participants = Number(h.participants_count ?? 0);
      const link =
        safeUrl(h.settings?.external_apply_url, DEVFOLIO_BASE) ??
        safeUrl(h.settings?.site, DEVFOLIO_BASE) ??
        (h.slug ? `${DEVFOLIO_BASE}/hackathons/${h.slug}` : null);
      if (!link) continue;

      const isOnline = h.is_online === true;
      const start = h.starts_at ?? eventEnd;

      // Devfolio's public listing publishes no description, prize, team size,
      // fee, venue or eligibility — verified against the live payload, and its
      // per-hackathon page 404s, so there is nowhere else to look. What it does
      // publish is themes and a participant count, and those are recorded.
      const details: EventDetails = {
        ...(themes.length ? { themes } : {}),
        ...(participants > 0 ? { participants } : {}),
        ...(h.settings?.reg_starts_at ? { regStart: String(h.settings.reg_starts_at) } : {}),
        ...(regEnd ? {} : { noDeadlineReason: "Devfolio lists no registration deadline for this hackathon." }),
      };

      out.push({
        source: "devfolio",
        sourceId,
        title,
        description: [
          themes.length ? `Tracks: ${themes.join(", ")}.` : "",
          participants > 0 ? `${participants.toLocaleString()} participants on Devfolio.` : "",
          `Apply on Devfolio and build with a team in ${isOnline ? "a virtual sprint" : "India"}.`,
        ]
          .filter(Boolean)
          .join(" "),
        date: start ?? String(reference),
        endDate: reference ?? undefined,
        deadlineKind: regEnd ? "registration" : "event-end",
        city: isOnline ? undefined : "India",
        isOnline,
        // Devfolio is the platform hosting the listing. The organising body is
        // not in the payload, so this says so instead of naming the platform
        // as the organiser.
        organizer: "Not stated by the listing (on Devfolio)",
        link,
        imageUrl: safeUrl(h.settings?.featured_cover_img_v2 ?? h.settings?.featured_cover_img, DEVFOLIO_BASE) ?? undefined,
        eventType: "hackathon",
        details,
      });
    } catch {
      // One malformed row must not drop the rest.
    }
  }

  return out;
};

/* -------------------------------------------------------------------------- */
/* Hack2Skill — method (a), public JSON API                                   */
/* ---------------------------------------------------------------------------- */
/* No list endpoint exists, so slugs come from the robots-declared sitemap and  */
/* are filtered against the disallowed set before any request. Measured ~40% of */
/* recently-touched slugs have a future registrationEnd, so a 180-day window   */
/* yields roughly 8-10 open events in about 30s at one request per second.    */

const H2S_BASE = "https://hack2skill.com";
const H2S_SITEMAP = `${H2S_BASE}/sitemap.xml`;
/** How far back a sitemap entry may have been touched and still be worth checking. */
const H2S_LOOKBACK_DAYS = 180;
/** Cap on requests per run, so a site-wide change cannot blow the run budget. */
const H2S_MAX_FETCHES = 40;

interface H2sEventDetails {
  status?: string;
  title?: string;
  logo?: string;
  registrationStart?: string | null;
  registrationEnd?: string | null;
  submissionStart?: string | null;
  submissionEnd?: string | null;
  tags?: {
    mode?: { value?: string };
    registrations?: { value?: number };
    ticket?: { value?: string };
    teamSize?: { min?: number; max?: number };
    age?: { min?: number; max?: number };
  };
  sections?: H2sSection[];
}

/**
 * Sections are nested three deep and each leaf may hold either a bare string or
 * a `{ value }` object depending on which field the editor wrote into it.
 */
interface H2sSection {
  title?: string;
  content?: string | { value?: string };
  category?: { title?: string; data?: H2sLeaf[] }[];
}

interface H2sLeaf {
  content?: string | { value?: string };
  value?: string;
}

/** Pull every scrap of prose out of a section tree, keyed by section title. */
function h2sSectionText(sections: H2sSection[] | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of sections ?? []) {
    const parts: string[] = [];
    const take = (v: H2sLeaf["content"] | H2sLeaf["value"]) => {
      if (typeof v === "string" && v.trim()) parts.push(v.trim());
      else if (v && typeof v === "object" && typeof v.value === "string" && v.value.trim())
        parts.push(v.value.trim());
    };
    take(s?.content);
    for (const c of s?.category ?? []) for (const d of c?.data ?? []) { take(d?.content); take(d?.value); }
    if (parts.length && s?.title) out.set(s.title, plain(parts.join(" "), 1200));
  }
  return out;
}

/** Parse robots.txt into the set of /event/ slugs we must never request. */
function parseBlockedSlugs(robots: string): Set<string> {
  const blocked = new Set<string>();
  let inStar = false;
  for (const raw of robots.split("\n")) {
    const line = raw.trim();
    if (/^user-agent\s*:/i.test(line)) {
      inStar = /\*\s*$/i.test(line);
      continue;
    }
    if (!inStar) continue;
    const m = line.match(/^disallow\s*:\s*\/event\/(\S+)/i);
    if (m) blocked.add(m[1].replace(/\/$/, "").toLowerCase());
  }
  return blocked;
}

const hack2skillFetch = async (_location = "", opts?: DiscoveryOptions): Promise<RawEvent[]> => {
  const robots = await fetchText(`${H2S_BASE}/robots.txt`, { timeoutMs: 10_000 });
  const blocked = robots ? parseBlockedSlugs(robots) : new Set<string>();

  const sitemap = await fetchText(H2S_SITEMAP, { timeoutMs: 20_000 });
  if (!sitemap) return [];

  const now = Date.now();
  const cutoff = now - H2S_LOOKBACK_DAYS * DAY;
  const seen = new Set(opts?.excludeSourceIds ?? []);

  /**
   * The budget goes to slugs we have never fetched.
   *
   * This adapter caps itself at H2S_MAX_FETCHES requests per run and used to
   * spend all of them on the same newest-40 slugs, every run. Two consequences,
   * both permanent rather than temporary:
   *
   * Starvation. Anything ranked 41st or lower was never requested and could
   * only ever become reachable once 40 newer entries aged out of the 180-day
   * window. Since the sitemap keeps growing and old pages keep being touched,
   * that may never happen. Measured across the sitemap: 301 slugs are excluded
   * by the lookback, and 1 in 10 of those has a registration deadline still in
   * the future, so roughly 30 events are being missed outright.
   *
   * Wasted work. All 40 requests were re-issued daily at one-per-second purely
   * so hashContent could match and the row could be skipped — about 40 seconds
   * of wall time per run to conclude nothing had changed.
   *
   * Excluding what we already hold fixes both, and the row the request would
   * have produced is already in the database.
   */
  const candidates = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)]
    .map((m) => ({
      loc: m[1].match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "",
      lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? "",
    }))
    .filter((e) => /\/event\//.test(e.loc))
    .map((e) => ({ ...e, slug: (e.loc.split("/event/")[1] ?? "").split("/")[0]?.toLowerCase() ?? "" }))
    // Honour robots.txt before anything is requested.
    .filter((e) => e.slug && !blocked.has(e.slug))
    // Already fetched and stored. Dropped before the lookback and the cap, so
    // the budget can only ever go to something new.
    .filter((e) => !seen.has(e.slug))
    .filter((e) => {
      const t = new Date(e.lastmod).getTime();
      // A URL with no <lastmod> used to be discarded here unconditionally, which
      // made such a slug permanently unreachable — there is no lastmod to fall
      // out of the window. It is still fetched once if we have never seen it;
      // the adapter's own isStillRelevant check then decides on the real dates,
      // which is a far better test than a sitemap timestamp.
      if (Number.isNaN(t)) return true;
      return t >= cutoff;
    })
    .sort((a, b) => b.lastmod.localeCompare(a.lastmod))
    .slice(0, H2S_MAX_FETCHES);

  const out: RawEvent[] = [];

  for (const c of candidates) {
    const res = await fetchJson<{ data?: H2sEventDetails }>(
      `${H2S_BASE}/api/v1/event/${c.slug}/event-details`,
      { timeoutMs: 15_000, retries: 0 }
    );
    const d = res?.data;
    if (!d) continue;

    try {
      if (d.status && d.status !== "APPROVED") continue;

      const title = plain(d.title, 200);
      if (!title) continue;

      const regEnd = d.registrationEnd ?? null;
      const reference = regEnd ?? d.submissionEnd ?? null;
      if (!isStillRelevant(reference)) continue;

      const mode = String(d.tags?.mode?.value ?? "").toUpperCase();
      const isOnline = mode === "VIRTUAL" || mode === "REMOTE";
      const isHybrid = mode === "HYBRID";
      // Hack2skill publishes no city and no venue for any of these events. The
      // offline ones previously got city "India", which the detail page then
      // rendered as "Venue: India" — a country is not a venue, and the source
      // said nothing about where the event is.
      const city: string | undefined = undefined;

      // Measured on all four open events: every section's data array is empty,
      // so `sectionText` is almost always empty and the brief is correctly
      // skipped. It is read anyway because it costs nothing and the payload
      // could change.
      const sectionText = h2sSectionText(d.sections);
      const eligibilityText = [...sectionText.entries()]
        .filter(([heading]) => /who can|eligib/i.test(heading))
        .map(([, body]) => body)
        .join(" ");

      // The sections most likely to carry a real description, in the order
      // they should be preferred.
      const overviewHeading =
        ["Event Overview", "Overview", "About", "Why participate"].find((h) => sectionText.has(h)) ??
        [...sectionText.keys()].find((h) => !/contact|faq|rule|social|timeline|attend/i.test(h));
      const sourceText = overviewHeading ? sectionText.get(overviewHeading) : undefined;

      const registrations = Number(d.tags?.registrations?.value ?? 0);
      const registrationNote =
        registrations > 0 ? ` ${registrations.toLocaleString()} registered on Hack2skill.` : "";

      // The platform is the marketplace, not the organiser. These listings name
      // no organising body, so say that rather than printing "Hack2skill" as if
      // it were the host.
      const organiser: string | undefined = undefined;

      // Age limits arrive as 16-65 on every Hack2skill event, which is the
      // platform default rather than a stated rule. Only surface a bound that is
      // actually narrower than that default.
      const age = d.tags?.age;
      const ageNote =
        age?.min !== undefined && age?.max !== undefined && (age.min > 16 || age.max < 65)
          ? `Ages ${age.min}-${age.max}.`
          : "";

      const ticket = String(d.tags?.ticket?.value ?? "").toUpperCase();
      const eligibility = [eligibilityText, ageNote].filter(Boolean).join(" ").trim();

      const details: EventDetails = {
        ...(sourceText ? { sourceText } : {}),
        ...readTeamSize(d.tags?.teamSize?.min, d.tags?.teamSize?.max),
        ...(ticket === "FREE" ? { fee: "free" as const } : {}),
        ...(eligibility ? { eligibility: plain(eligibility, 300) } : {}),
        ...(registrations > 0 ? { participants: registrations } : {}),
        ...(d.registrationStart ? { regStart: d.registrationStart } : {}),
        ...(d.submissionStart ? { submissionStart: d.submissionStart } : {}),
        ...(regEnd
          ? {}
          : { noDeadlineReason: "Hack2skill publishes no registration deadline for this event." }),
      };

      out.push({
        source: "hack2skill",
        sourceId: c.slug,
        title,
        description:
          (sourceText ||
            `${title} on Hack2skill. ${isOnline ? "Online event." : isHybrid ? "Hybrid event." : "In-person event."}`) +
          registrationNote,
        date: d.registrationStart ?? d.submissionStart ?? String(reference),
        endDate: String(reference),
        deadlineKind: regEnd ? "registration" : "event-end",
        city,
        isOnline: isOnline || isHybrid,
        organizer: organiser ?? "Hack2skill listing (organiser not stated)",
        link: `${H2S_BASE}/event/${c.slug}`,
        imageUrl: safeUrl(d.logo, H2S_BASE) ?? undefined,
        eventType: "hackathon",
        details,
      });
      void ageNote;
    } catch {
      // Skip this one, keep going.
    }
  }

  return out;
};

/* -------------------------------------------------------------------------- */
/* WeMakeDevs — method (b), Next.js RSC flight payload                       */
/* ---------------------------------------------------------------------------- */
/* /hackathons carries 29 cards, of which 3 have a future end date. There is  */
/* no registration-deadline field anywhere in the payload, so these are        */
/* labelled event-end and the UI shows the start and end dates instead of a   */
/* "closes in" countdown.                                                     */

const WMD_BASE = "https://www.wemakedevs.org";

const wemakedevsFetch = async (): Promise<RawEvent[]> => {
  const html = await fetchText(`${WMD_BASE}/hackathons`, { timeoutMs: 20_000 });
  if (!html) return [];

  const flight = decodeFlightPayload(html);
  const out: RawEvent[] = [];
  const now = Date.now();

  for (const m of flight.match(/\{"id":"[0-9a-f-]{36}","title":[\s\S]{0,900}?\}/g) ?? []) {
    let card: {
      id?: string; title?: string; location?: string; formats?: string[];
      prize?: string; image?: string; href?: string; isExternal?: boolean;
      startDate?: string; endDate?: string; hackathonSlug?: string | null; seriesSlug?: string | null;
    };
    try {
      card = JSON.parse(m);
    } catch {
      continue;
    }

    try {
      const title = plain(card.title, 200);
      const sourceId = String(card.id ?? card.hackathonSlug ?? "").trim();
      if (!title || !sourceId) continue;
      if (!card.endDate || new Date(card.endDate).getTime() < now) continue;
      if (!isStillRelevant(card.endDate)) continue;

      const formats = (card.formats ?? []).map((f) => String(f).toLowerCase());
      const isOnline = formats.includes("online") || /remote|online/i.test(String(card.location ?? ""));
      const rawLocation = plain(card.location, 60);
      const venue = isFormatWord(rawLocation) ? "" : rawLocation;

      // Scope gate: no registration deadline is published, so these are
      // end-date-only. Keep only what is online or actually in India.
      if (!isInScope({ isOnline, city: venue, venue })) continue;

      const href = card.isExternal ? card.href : `${WMD_BASE}${card.href ?? ""}`;
      const link = safeUrl(href, WMD_BASE);
      if (!link) continue;

      // WeMakeDevs cards publish a prize string and a location, and nothing
      // else of substance — no description, team size, eligibility or fee.
      const prize = card.prize ? plain(card.prize, 250) : undefined;
      const details: EventDetails = {
        ...(prize ? { prize } : {}),
        ...(venue ? { venue } : {}),
        ...(card.startDate ? { regStart: String(card.startDate) } : {}),
        // Explicit, because a reader looking for a closing date deserves to be
        // told the platform does not publish one.
        noDeadlineReason: "WeMakeDevs publishes no registration deadline for this hackathon.",
      };

      out.push({
        source: "wemakedevs",
        sourceId,
        title,
        description: [
          prize ? `Prizes: ${prize}.` : "",
          `${title} on WeMakeDevs — a global developer community across 40 countries.`,
        ]
          .filter(Boolean)
          .join(" "),
        date: card.startDate ?? String(card.endDate),
        endDate: String(card.endDate),
        // No registration deadline is published; we count down to the end date.
        deadlineKind: "event-end",
        city: isOnline ? undefined : venue || "India",
        isOnline,
        organizer: "Not stated by the listing (on WeMakeDevs)",
        link,
        imageUrl: safeUrl(card.image, WMD_BASE) ?? undefined,
        eventType: "hackathon",
        details,
      });
    } catch {
      // Skip.
    }
  }

  return out;
};

/* -------------------------------------------------------------------------- */
/* MLH — method (b), Inertia JSON island                                      */
/* ---------------------------------------------------------------------------- */
/* The 2026 season currently has a single upcoming event, and publishes no    */
/* registration deadline — only startsAt/endsAt, so it is labelled event-end.  */
/* api.mlh.com returns 401 and is deliberately not used.                       */

const MLH_BASE = "https://www.mlh.com";
/** Seasons to check, newest first. Each is one request. */
const MLH_SEASONS = [2027, 2026, 2025];

const mlhFetch = async (): Promise<RawEvent[]> => {
  const out: RawEvent[] = [];
  const now = Date.now();

  for (const season of MLH_SEASONS) {
    const html = await fetchText(`${MLH_BASE}/seasons/${season}/events`, { timeoutMs: 20_000 });
    if (!html) continue;

    const m = html.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) continue;

    let page: { props?: { upcomingEvents?: unknown[] } };
    try {
      page = JSON.parse(m[1]);
    } catch {
      continue;
    }

    const list = Array.isArray(page.props?.upcomingEvents) ? page.props!.upcomingEvents! : [];

    for (const raw of list) {
      try {
        const e = raw as {
          id?: string; slug?: string; name?: string; status?: string;
          startsAt?: string; endsAt?: string; location?: string;
          formatType?: string; backgroundUrl?: string; websiteUrl?: string;
          venueAddress?: { city?: string; state?: string; country?: string };
        };

        const title = plain(e.name, 200);
        const sourceId = String(e.id ?? e.slug ?? "").trim();
        if (!title || !sourceId) continue;
        // No status filter here. MLH's own public "upcoming" page is the
        // authority on what is published, and the events it lists carry
        // status "pending" (its internal review state), not "approved".
        // Filtering on the status string returned zero events.
        if (!isStillRelevant(e.endsAt ?? e.startsAt)) continue;
        if (new Date(e.endsAt ?? e.startsAt ?? 0).getTime() < now) continue;

        const format = String(e.formatType ?? "").toLowerCase();
        const isOnline = format === "virtual" || format === "online";
        const venue = plain(e.location, 60);

        // MLH's 2027 season is dominated by North American university
        // hackathons, and none of them publish a registration deadline. Keep
        // only what is online or actually in India.
        if (!isInScope({ isOnline, city: venue, venue })) continue;

        // MLH events carry a real venue in the payload, and MLH genuinely is
        // the organiser for its own events — unlike Devfolio and Hack2skill,
        // where the platform is only the marketplace.
        const address = e.venueAddress;
        // `location` usually already reads "City, State", so appending the
        // structured address yields "Ghaziabad, Uttar Pradesh, Ghaziabad,
        // Uttar Pradesh, IN". Keep a part only if the text so far does not
        // already contain it — an exact-match set is not enough, because the
        // two sources are fragments of the same string, not duplicates of it.
        const venueFull = [e.location, address?.city, address?.state, address?.country]
          .map((p) => plain(p, 60))
          .filter(Boolean)
          .reduce<string[]>((acc, part) => {
            const lower = acc.join(" ").toLowerCase();
            return lower.includes(part.toLowerCase()) ? acc : [...acc, part];
          }, [])
          .join(", ")
          .slice(0, 200);

        const details: EventDetails = {
          ...(venueFull ? { organiser: "Major League Hacking", venue: venueFull } : {}),
          // MLH publishes a date range and nothing else about entry.
          noDeadlineReason: "Major League Hacking publishes no registration deadline for this event.",
        };

        out.push({
          source: "mlh",
          sourceId,
          title,
          description: `${title} — a Major League Hacking event${venue ? ` in ${venue}` : ""}.`,
          date: e.startsAt ?? String(e.endsAt),
          endDate: e.endsAt ?? undefined,
          // No registration deadline is published by MLH.
          deadlineKind: "event-end",
          city: isOnline ? undefined : venue || "India",
          isOnline,
          organizer: "Major League Hacking",
          link: safeUrl(e.websiteUrl, MLH_BASE) ?? `${MLH_BASE}/events/${e.slug ?? ""}`,
          imageUrl: safeUrl(e.backgroundUrl, MLH_BASE) ?? undefined,
          eventType: "hackathon",
          details,
        });
      } catch {
        // Skip.
      }
    }
  }

  return out;
};

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * City-agnostic sources.
 *
 * These platforms publish a single global listing with no location field, so
 * running them once per city would re-fetch the same page six times and, more
 * importantly, would label every offline event with whichever city happened to
 * be queried. They are therefore fetched once, and the ingest's (source,
 * sourceId) upsert makes the repeats harmless.
 */
export const CITY_AGNOSTIC_SOURCES = [
  { id: "devfolio", displayName: "Devfolio", fetch: devfolioFetch },
  { id: "hack2skill", displayName: "Hack2Skill", fetch: hack2skillFetch },
  { id: "wemakedevs", displayName: "WeMakeDevs", fetch: wemakedevsFetch },
  { id: "mlh", displayName: "Major League Hacking", fetch: mlhFetch },
];

export { politeFetch };
