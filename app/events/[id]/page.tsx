import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { parseTags, toEventDTO, eventSelect, asSelected, actionableEventWhere } from "@/lib/events";
import { similarEvents } from "@/lib/recommendations";
import {
  countdown,
  formatDateTime,
  DISPLAY_TZ_LABEL,
} from "@/lib/format";
import { EVENT_TYPE_LABELS, sourceLabel } from "@/lib/constants";
import { parseDetails } from "@/lib/event-details";
import { whoCanJoinFrom } from "@/lib/ai/brief";
import {
  eventOneLiner,
  metaDescription,
  registrationDeadline,
  countdownHeading,
  buildGlance,
  type GlanceRow,
} from "@/lib/event-summary";
import { buildIcs, googleCalendarUrl } from "@/lib/calendar";
import { BookmarkButton } from "@/components/BookmarkButton";
import { ReportEventButton } from "@/components/ReportEventButton";
import { IndexRow } from "@/components/IndexRow";
import { EventPoster, accentFor, accentTextFor } from "@/components/EventCard";
import { getViewerId } from "@/lib/session";
import { eventDates, eventStatus, isActionable } from "@/lib/event-dates";

export const dynamic = "force-dynamic";

/**
 * How many candidates the similar-events strip scores.
 *
 * Bounded on purpose. The strip shows three, so this only has to be large
 * enough that three plausible matches usually survive the `score > 0` filter.
 * Sixty is comfortably more than the strip can use while keeping the query a
 * bounded index scan rather than a table read.
 */
const SIMILAR_POOL = 60;

/**
 * The sentence for a fact the source never published.
 *
 * A missing venue, eligibility, fee or unknown deadline is stated as missing
 * rather than omitted, so a reader can tell "the source didn't say" apart from
 * "this page forgot to show it". Nothing is inferred to fill the gap.
 */
const NOT_PUBLISHED = "Not published by the source";

/**
 * Append the missing-fact rows to a glance list.
 *
 * Mirrored in components/EventQuickLook.tsx — keep the labels and the value
 * identical so both surfaces say the same thing. Deliberately local to each
 * file rather than shared from lib: the labels are display copy, and neither
 * surface may import the other's helpers.
 *
 * The deadline row only appears when the listing carries no deadline kind at
 * all, meaning even the meaning of its dates is unknown. Listings with a known
 * kind already speak for themselves: registration shows its closing date, and
 * end-date-only sources show "Runs until" without pretending it is a deadline.
 */
function withMissingRows(
  rows: GlanceRow[],
  opts: { isOnline: boolean; deadlineKind: string | null }
): GlanceRow[] {
  const seen = new Set(rows.map((r) => r.label));
  const out = [...rows];
  if (!opts.isOnline && !seen.has("Venue")) out.push({ label: "Venue", value: NOT_PUBLISHED });
  if (!seen.has("Who can join")) out.push({ label: "Who can join", value: NOT_PUBLISHED });
  if (!seen.has("Entry fee")) out.push({ label: "Entry fee", value: NOT_PUBLISHED });
  if (!opts.deadlineKind && !seen.has("Registration deadline") && !seen.has("Registration closes")) {
    out.push({ label: "Registration deadline", value: NOT_PUBLISHED });
  }
  return out;
}

async function loadEvent(id: string) {
  const event = await db.event.findUnique({ where: { id }, select: await eventSelect() });
  if (!event) return null;
  return asSelected([event])[0];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await loadEvent(id);
  if (!event) return { title: "Event not found" };

  const details = parseDetails(event.details);
  const summary = metaDescription({
    title: event.title,
    source: event.source,
    date: event.date.toISOString(),
    endDate: event.endDate?.toISOString() ?? null,
    deadlineKind: event.deadlineKind,
    isOnline: event.isOnline,
    city: event.city,
    details,
    whoCanJoin: event.whoCanJoin ?? null,
    brief: event.brief,
  });

  // The canonical URL and OG image point at this page, so a shared link opens
  // the detail page rather than the index with no context.
  const url = `/events/${event.id}`;
  return {
    title: `${event.title} — Devlore`,
    description: summary,
    alternates: { canonical: url },
    openGraph: {
      title: event.title,
      description: summary,
      type: "article",
      url,
      ...(event.imageUrl ? { images: [{ url: event.imageUrl }] } : {}),
    },
    twitter: {
      card: event.imageUrl ? "summary_large_image" : "summary",
      title: event.title,
      description: summary,
      ...(event.imageUrl ? { images: [event.imageUrl] } : {}),
    },
  };
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await loadEvent(id);
  if (!event) notFound();

  const viewerId = await getViewerId();
  const select = await eventSelect();
  const [bookmark, similarPool, refs] = await Promise.all([
    viewerId ? db.bookmark.findUnique({ where: { viewerId_eventId: { viewerId, eventId: id } } }) : null,
    // Candidates for the "similar" strip, narrowed in SQL.
    //
    // This used to read every APPROVED event on the site on every detail-page
    // render and pick 3 out of them in JavaScript. That is a full table scan
    // plus a full hydration of every row — including rawPayload — to fill a
    // three-item strip, and it got linearly worse as the index grew.
    //
    // Scoring reads five fields: shared tags, eventType, beginnerFriendly,
    // isOnline and city. Only eventType and city are indexable (tags is a text
    // column holding a JSON array, so no btree and no GIN), so the query
    // narrows on the three it can and `mode` scoring still happens in JS over a
    // bounded pool. The branches are OR'd rather than AND'd so a page never
    // ends up with an empty strip just because its own type is rare — that is
    // the failure a strict same-type filter would have.
    db.event.findMany({
      where: {
        status: "APPROVED",
        id: { not: id },
        AND: [actionableEventWhere()],
        OR: [
          { eventType: event.eventType },
          { isOnline: event.isOnline },
          ...(event.city ? [{ city: event.city }] : []),
        ],
      },
      // Soonest first, so the pool is the events a reader could still act on.
      orderBy: { date: "asc" },
      take: SIMILAR_POOL,
      select,
    }),
    // Tolerates the pre-migration schema, where this table does not exist.
    db.eventSourceRef
      .findMany({ where: { eventId: id }, select: { source: true, link: true } })
      .catch(() => []),
  ]);

  const similarRows = asSelected(
    similarEvents(event, asSelected(similarPool), 3)
  ).map((e) => toEventDTO(e));

  const details = parseDetails(event.details);
  const whoCanJoin = event.whoCanJoin ?? whoCanJoinFrom(details);
  const dto = toEventDTO(event, new Set(bookmark ? [id] : []), refs);

  const timing = eventStatus(dto);
  const active = isActionable(dto);
  const dates = eventDates(dto);
  const target = dates.deadline ?? dates.end ?? dates.start;
  const typeLabel = EVENT_TYPE_LABELS[dto.eventType] ?? "Event";
  const dot = accentFor(dto.eventType);
  const accentText = accentTextFor(dto.eventType);
  const tags = parseTags(event);
  const sourceName = sourceLabel(dto.source);

  // The adapters store city: "India" when the source published no city, so the
  // string means "somewhere in the country", never a venue. Everything
  // downstream of location — the header line and the JSON-LD — treats it as
  // missing rather than printing the country as the venue.
  const venueName =
    (details?.venue && details.venue !== "India" ? details.venue : null) ??
    (dto.city && dto.city !== "India" ? dto.city : null);

  const summaryInput = {
    title: dto.title,
    source: dto.source,
    date: dto.date,
    endDate: dto.endDate,
    deadlineKind: dto.deadlineKind,
    isOnline: dto.isOnline,
    city: dto.city,
    details,
    whoCanJoin,
  };
  const oneLiner = eventOneLiner(summaryInput);

  // Null unless there is a real, future registration deadline. This is what
  // suppresses the calendar buttons for end-date-only sources.
  const deadline = registrationDeadline(summaryInput);
  const heading = countdownHeading(summaryInput);
  const calendarNotes = [whoCanJoin, details?.prize ? `Prize: ${details.prize}` : null].filter(
    (n): n is string => Boolean(n)
  );
  const ics = deadline
    ? buildIcs({
        title: dto.title,
        deadlineIso: deadline,
        deadlineKind: dto.deadlineKind,
        deadlineLabel: formatDateTime(deadline),
        link: dto.link,
        notes: calendarNotes,
      })
    : null;
  const googleUrl = deadline
    ? googleCalendarUrl({
        title: dto.title,
        deadlineIso: deadline,
        deadlineKind: dto.deadlineKind,
        deadlineLabel: formatDateTime(deadline),
        link: dto.link,
        notes: calendarNotes,
      })
    : null;

  // The at-a-glance rows. Built in lib/event-summary, then marked where the
  // source published nothing: venue, eligibility, fee and an unknown deadline
  // read as "Not published by the source" rather than vanishing silently.
  // "India" is the adapters' fallback for a missing city, never a venue, so a
  // Venue row carrying it is rewritten too. Labels match EventQuickLook.
  const glance = withMissingRows(
    buildGlance({ ...summaryInput, whoCanJoin }).map((row) =>
      row.label === "Venue" && row.value === "India" ? { ...row, value: NOT_PUBLISHED } : row
    ),
    { isOnline: dto.isOnline, deadlineKind: dto.deadlineKind }
  );
  const location = dto.isOnline ? "Online" : (venueName ?? NOT_PUBLISHED);

  const jsonLd = buildEventJsonLd(dto, details?.organiser ?? null, whoCanJoin, venueName);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
      <script
        type="application/ld+json"
        // Serialised from a typed object we build ourselves; no user input is
        // interpolated into the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mb-10 flex items-center gap-3 border-b border-line pb-5">
        <nav className="min-w-0 flex-1 text-[11px] uppercase tracking-[0.12em] text-faint">
          <Link href="/" className="transition-colors hover:text-ink">
            Discover
          </Link>
          {/* faint-dim, not line-hi: --color-line-hi is a hairline tuned to be
              1px-visible against the page, which is the wrong target for a
              glyph. As text it measured 2.4:1 and vanished. */}
          <span className="mx-2 text-faint-dim">/</span>
          <span className="truncate normal-case tracking-normal text-muted">{dto.title}</span>
        </nav>
        <BookmarkButton eventId={dto.id} initialBookmarked={!!bookmark} />
      </div>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
            <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${accentText}`}>
              {typeLabel}
            </span>
            <span className="text-[11px] uppercase tracking-[0.12em] text-faint">
              {sourceName}
            </span>
          </div>

          <h1 className="mt-4 font-serif text-[clamp(2.1rem,5vw,3.2rem)] font-normal leading-[1.05] tracking-[-0.015em] text-ink">
            {dto.title}
          </h1>

          {/* Location and organiser only. A view count used to sit here, and it had been
            a permanent 0 on every event since launch — only the bookmark route
            handlers ever set the viewer cookie, so a reader who never saved
            anything was never attributable. Counting anonymous reads would mean
            putting an identifier on every visitor, so the counter was dropped
            instead (20261004010000_drop_view_counter) rather than left reading
            zero or dressed up as social proof. */}
          <p className="mt-4 text-[13px] text-faint">
            {location} · {dto.organizer}
          </p>

          {dto.imageUrl && (
            <div className="mt-9">
              <EventPoster
                src={dto.imageUrl}
                alt={dto.title}
                initials={dto.title.slice(0, 2).toUpperCase()}
                className="h-48 w-48"
              />
            </div>
          )}

          {/* The brief, when there was enough source text to write one.
              There is no fallback copy: if it is absent the structured facts
              below stand on their own. */}
          {dto.brief && (
            <p className="mt-9 border-t border-line pt-7 font-serif text-[21px] leading-[1.55] text-ink">
              {dto.brief}
            </p>
          )}

          {whoCanJoin && (
            <p className="mt-6 flex items-start gap-2 text-[14px] leading-relaxed text-muted">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-line-hi" aria-hidden />
              {whoCanJoin}
            </p>
          )}

          {glance.length > 0 && (
            <>
              <h2 className="mt-12 font-serif text-[22px] leading-none tracking-tight text-ink">
                At a glance
              </h2>
              <dl className="mt-4 border-t border-line">
                {glance.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-1 gap-1 border-b border-line py-3.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6"
                  >
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-faint sm:pt-0.5">
                      {row.label}
                    </dt>
                    <dd className="text-[15px] leading-relaxed text-ink">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {tags.length > 0 && (
            <p className="mt-7 text-[11px] uppercase tracking-[0.12em] text-faint">
              {tags.join(" · ")}
            </p>
          )}

          {/* Provenance. A listing scraped from a third party is a snapshot,
              and the reader is about to leave the site to act on it. */}
          <div className="mt-12 border-t border-line pt-5">
            <p className="text-[12px] leading-relaxed text-faint">
              Last checked {formatDateTime(dto.fetchedAt)} from {sourceName}.
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
              Details can change. Confirm on the official page before registering.
            </p>
          </div>

          <div className="mt-8 border-t border-line pt-5">
            <ReportEventButton eventId={dto.id} />
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          {heading ? (
            <>
              <p className="text-[11px] uppercase tracking-[0.14em] text-faint">
                {heading} · {DISPLAY_TZ_LABEL}
              </p>
              <p className="mt-2 font-mono text-[30px] tracking-tight text-ink tabular-nums">
                {target ? countdown(target) : ""}
              </p>
            </>
          ) : (
            <p className="text-[11px] uppercase tracking-[0.14em] text-faint">
              {timing}
            </p>
          )}

          {dto.link ? (
            <a
              href={dto.link}
              target="_blank"
              rel="noopener noreferrer"
              data-devlore-outbound={dto.id}
              className="glow-primary mt-8 block rounded-[2px] bg-gradient-to-r from-primary to-primary-2 px-4 py-2.5 text-center text-sm font-semibold text-bg transition-all duration-200 hover:brightness-105"
            >
              {active && dates.kind === "registration" ? "Register on" : active && dates.kind === "submission" ? "View submissions on" : "View listing on"} {sourceName}
            </a>
          ) : (
            <p className="mt-8 border-y border-line px-4 py-3 text-center text-[13px] text-faint">
              No registration link provided
            </p>
          )}

          {/* Calendar links appear only for a real registration deadline. */}
          {deadline && (ics || googleUrl) && (
            <div className="mt-4 space-y-2">
              {ics && (
                <a
                  href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`}
                  download={`${dto.title.replace(/[^\w-]+/g, "-").slice(0, 60)}.ics`}
                  className="block border border-line px-4 py-2 text-center text-[13px] text-muted transition-colors hover:border-line-hi hover:text-ink"
                >
                  Add deadline to calendar
                </a>
              )}
              {googleUrl && (
                <a
                  href={googleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block border border-line px-4 py-2 text-center text-[13px] text-muted transition-colors hover:border-line-hi hover:text-ink"
                >
                  Google Calendar
                </a>
              )}
            </div>
          )}

          {/* Every platform this same event was seen on, after a merge. */}
          {dto.alsoOn.length > 0 && (
            <div className="mt-8 border-t border-line pt-5">
              <p className="text-[11px] uppercase tracking-[0.12em] text-faint">Also listed on</p>
              <ul className="mt-2.5 space-y-1.5">
                {dto.alsoOn.map((ref) => (
                  <li key={ref.source}>
                    {ref.link ? (
                      <a
                        href={ref.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[14px] text-muted underline decoration-line-hi underline-offset-4 transition-colors hover:text-ink"
                      >
                        {sourceLabel(ref.source)}
                      </a>
                    ) : (
                      <span className="text-[14px] text-muted">{sourceLabel(ref.source)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8 space-y-5 border-t border-line pt-6">
            <Meta label="Source" value={sourceName} />
            <Meta label="Status" value={timing} />
            <p className="text-[12px] leading-relaxed text-faint">{oneLiner}</p>
          </div>
        </aside>
      </div>

      {similarRows.length > 0 && (
        <section className="mt-28">
          <h2 className="font-serif text-[26px] leading-none tracking-tight text-ink">
            Also worth a look
          </h2>
          <div className="mt-4">
            {similarRows.map((e, i) => (
              <IndexRow key={e.id} event={e} index={i + 1} />
            ))}
            <div className="border-t border-line" />
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * schema.org Event, with a JSON-LD `subEvent`-free shape.
 *
 * `endDate` is only emitted when the source published one, and the event
 * status is derived rather than asserted. The organiser falls back to the
 * listing's own text rather than to the platform name, which would be false.
 * The location is omitted entirely when no venue was published: the alternative
 * would be the adapters' "India" fallback, which is a country, not a venue.
 */
function buildEventJsonLd(
  dto: ReturnType<typeof toEventDTO>,
  organiser: string | null,
  whoCanJoin: string | null,
  venueName: string | null
) {
  const dates = eventDates(dto);

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: dto.title,
    ...(dto.brief ? { description: dto.brief } : { description: whoCanJoin ?? undefined }),
    ...(dates.start ? { startDate: dates.start } : {}),
    ...(dates.end ? { endDate: dates.end } : {}),
    eventAttendanceMode: dto.isOnline
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    ...(dto.isOnline || !venueName
      ? {}
      : {
          location: {
            "@type": "Place",
            name: venueName,
            address: { "@type": "PostalAddress", addressCountry: dto.country },
          },
        }),
    ...(dto.link ? { url: dto.link } : {}),
    ...(dto.imageUrl ? { image: dto.imageUrl } : {}),
    // isAccessibleForFree is only claimed when the source said the entry is
    // free. Omitted otherwise, rather than defaulted to false — "unknown" and
    // "paid" are different claims and only one of them is supported here.
    ...(dto.details?.fee === "free"
      ? { isAccessibleForFree: true, offers: { "@type": "Offer", price: 0, priceCurrency: "INR" } }
      : {}),
    ...(dto.details?.organiser ?? organiser
      ? { organizer: { "@type": "Organization", name: (dto.details?.organiser ?? organiser)! } }
      : {}),
    ...(dto.tags.length ? { keywords: dto.tags.join(", ") } : {}),
  };
}

function Meta({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.12em] text-faint">{label}</p>
      <p className={`mt-1 text-[14px] text-ink ${capitalize ? "capitalize" : ""}`}>{value}</p>
    </div>
  );
}
