import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { parseTags, toEventDTO, eventSelect, asSelected } from "@/lib/events";
import { similarEvents } from "@/lib/recommendations";
import {
  countdown,
  eventPhase,
  eventTiming,
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
} from "@/lib/event-summary";
import { buildIcs, googleCalendarUrl } from "@/lib/calendar";
import { BookmarkButton } from "@/components/BookmarkButton";
import { IndexRow, EventPoster, accentFor, accentTextFor } from "@/components/EventCard";
import { getViewerId } from "@/lib/session";

export const dynamic = "force-dynamic";

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
  const [bookmark, allApproved, refs] = await Promise.all([
    viewerId ? db.bookmark.findUnique({ where: { viewerId_eventId: { viewerId, eventId: id } } }) : null,
    db.event.findMany({
      where: { status: "APPROVED" },
      orderBy: { date: "asc" },
      select,
    }),
    // Tolerates the pre-migration schema, where this table does not exist.
    db.eventSourceRef
      .findMany({ where: { eventId: id }, select: { source: true, link: true } })
      .catch(() => []),
  ]);

  const similarRows = asSelected(
    similarEvents(event, asSelected(allApproved), 3)
  ).map((e) => toEventDTO(e));

  const details = parseDetails(event.details);
  const whoCanJoin = event.whoCanJoin ?? whoCanJoinFrom(details);
  const dto = toEventDTO(event, new Set(bookmark ? [id] : []), refs);

  const timing = eventTiming(dto.date, dto.endDate);
  const target = dto.endDate ?? dto.date;
  const typeLabel = EVENT_TYPE_LABELS[dto.eventType] ?? "Event";
  const dot = accentFor(dto.eventType);
  const accentText = accentTextFor(dto.eventType);
  const tags = parseTags(event);
  const sourceName = sourceLabel(dto.source);

  const summaryInput = {
    title: dto.title,
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

  // The at-a-glance rows. Built and filtered in lib/event-summary so the same
  // omission rules apply here and in the tests. A row with no data is absent,
  // never rendered with a dash.
  const glance = buildGlance({ ...summaryInput, whoCanJoin });
  const location = dto.isOnline ? "Online" : (dto.city ?? "Location TBA");

  const jsonLd = buildEventJsonLd(dto, details?.organiser ?? null, whoCanJoin);

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
          <span className="mx-2 text-line-hi">/</span>
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

          <p className="mt-4 text-[13px] text-faint">
            {location} · {dto.organizer} ·{" "}
            {dto.viewCount.toLocaleString()} {dto.viewCount === 1 ? "view" : "views"}
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
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          {heading ? (
            <>
              <p className="text-[11px] uppercase tracking-[0.14em] text-faint">
                {heading} · {DISPLAY_TZ_LABEL}
              </p>
              <p className="mt-2 font-mono text-[30px] tracking-tight text-ink tabular-nums">
                {countdown(target)}
              </p>
            </>
          ) : (
            <p className="text-[11px] uppercase tracking-[0.14em] text-faint">
              {timing === "Ended" ? "This event has closed" : `Happening now`}
            </p>
          )}

          {dto.link ? (
            <a
              href={dto.link}
              target="_blank"
              rel="noopener noreferrer"
              className="glow-primary mt-8 block rounded-[2px] bg-gradient-to-r from-primary to-primary-2 px-4 py-2.5 text-center text-sm font-semibold text-bg transition-all duration-200 hover:brightness-105"
            >
              Register on {sourceName}
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
 */
function buildEventJsonLd(
  dto: ReturnType<typeof toEventDTO>,
  organiser: string | null,
  whoCanJoin: string | null
) {
  const phase = eventPhase(dto.date, dto.endDate);
  const status =
    phase === "ended" ? "https://schema.org/EventCompleted" : "https://schema.org/EventScheduled";

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: dto.title,
    ...(dto.brief ? { description: dto.brief } : { description: whoCanJoin ?? undefined }),
    startDate: dto.date,
    ...(dto.endDate ? { endDate: dto.endDate } : {}),
    eventStatus: status,
    eventAttendanceMode: dto.isOnline
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    ...(dto.isOnline
      ? {}
      : {
          location: {
            "@type": "Place",
            name: dto.details?.venue ?? dto.city ?? "India",
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
