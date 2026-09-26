import type { DiscoverySource, RawEvent } from "../types";

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
 * Source coverage:
 *   devpost — working (public API, real upcoming hackathons)
 *   unstop  — working (public search API)
 *   gdg     — best effort (community API is unstable)
 *   meetup  — disabled, needs a MEETUP_TOKEN for its GraphQL endpoint
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
const CITY_ALIASES: Record<string, string[]> = {
  bangalore: ["bangalore", "bengaluru", "blr", "whitefield", "koramangala", "indiranagar", "hsr"],
  mumbai: ["mumbai", "bombay", "navi mumbai", "thane", "bkc", "powai", "andheri"],
  delhi: ["delhi", "ncr", "gurgaon", "gurugram", "noida", "okhla", "dwarka", "rohini"],
  hyderabad: ["hyderabad", "hitec city", "gachibowli", "kukatpally", "banjara hills"],
  pune: ["pune", "baner", "hinjawadi", "kothrud", "viman nagar", "magarpatta"],
  chennai: ["chennai", "madras", "adyar", "anna nagar", "velachery", "guindy", "omr"],
};

/** All lowercase spellings that represent the requested city. */
function cityNeedles(city: string): string[] {
  const base = city.toLowerCase().split(",")[0].trim();
  return CITY_ALIASES[base] ?? [base];
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
 * Online entries have no city, so they are included for every query — that
 * is intentional, since our own city filter already treats online events as
 * matching every city.
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
            `Apply on Devpost and build with a team in ${
              isOnline ? "a virtual open-source sprint" : location || city
            }.`,
          ]
            .filter(Boolean)
            .join(" "),
          date: range.start,
          endDate: range.end,
          venue: location || undefined,
          city: isOnline ? undefined : location || city,
          isOnline,
          organizer: String(h.organization_name ?? "Devpost"),
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
const unstopFetch: ExtractFn = async (city) => {
  try {
    const url =
      `https://unstop.com/api/public/opportunity/search-result?opportunity=hackathon` +
      `&searchTerm=${encodeURIComponent(city)}&page=1&perPage=12&oppstatus=open`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(String(res.status));

    const data = await res.json();
    const items = (data.data?.data ?? data.data ?? []) as Record<string, unknown>[];

    const out: RawEvent[] = [];
    for (const o of items) {
      const title = String(o.title ?? o.opportunityTitle ?? "").trim();
      if (!title) continue;

      const regn = (o.regnRequirements ?? {}) as {
        startDate?: string;
        endDate?: string;
        eligible?: string;
      };
      const start = parseEventDate(String(o.startDate ?? regn.startDate ?? ""));
      if (!start || !isStillRelevant(start)) continue;
      const end = parseEventDate(String(o.endDate ?? regn.endDate ?? ""));

      const locationText = String(o.location ?? o.city ?? "");
      const isOnline = /online|virtual|remote|pan-?india/i.test(locationText);
      const isStudentTrack = /student|beginner|fresher|undergraduate|college/i.test(
        `${regn.eligible ?? ""} ${title}`
      );

      out.push({
        source: "unstop",
        title,
        description:
          stripHtml(String(o.description ?? o.des ?? "")) ||
          `${title} — open for registration on Unstop.${
            isStudentTrack ? " Open to students, freshers and beginners." : ""
          } Apply and form a team to compete.`,
        date: start,
        endDate: end ?? undefined,
        venue: locationText || undefined,
        city: isOnline ? undefined : city,
        isOnline,
        organizer: String(
          (o.organisation as { name?: string } | undefined)?.name ?? o.organisationName ?? "Unstop"
        ),
        link: String(o.seoUrl ? `https://unstop.com/${o.seoUrl}` : "https://unstop.com/hackathons"),
        eventType: "hackathon",
      });
    }
    return out.slice(0, 8);
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
const gdgFetch: ExtractFn = async (city) => {
  try {
    const url = `https://gdg.community.dev/api/search?query=${encodeURIComponent(city)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(String(res.status));

    const data = await res.json();
    const items = (data.results ?? data.data ?? []) as Record<string, unknown>[];

    const out: RawEvent[] = [];
    for (const g of items) {
      const title = String(g.title ?? "").trim();
      if (!title) continue;

      const date = parseEventDate(String(g.start_date ?? g.date ?? ""));
      if (!date || !isStillRelevant(date)) continue;

      const location = String(g.location ?? "");

      out.push({
        source: "gdg",
        title,
        description:
          stripHtml(String(g.description ?? "")) ||
          `Google Developer Group community session in ${city}. Talks, demos and networking.`,
        date,
        venue: location || undefined,
        city,
        isOnline: /online|virtual/i.test(location),
        organizer: String((g.chapter as { title?: string } | undefined)?.title ?? "GDG Community"),
        link: String(g.url ?? "https://gdg.community.dev/"),
        eventType: "meetup",
      });
    }
    return out.slice(0, 6);
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
