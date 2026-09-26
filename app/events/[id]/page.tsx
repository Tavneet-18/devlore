import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parseTags, toEventDTO } from "@/lib/events";
import { similarEvents } from "@/lib/recommendations";
import {
  countdown,
  eventPhase,
  eventTiming,
  formatDay,
  referenceDate,
} from "@/lib/format";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { BookmarkButton } from "@/components/BookmarkButton";
import { EventCard, EventPoster } from "@/components/EventCard";
import { getViewerId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await db.event.findUnique({ where: { id } });
  if (!event) notFound();

  const viewerId = await getViewerId();
  const [bookmark, allApproved] = await Promise.all([
    viewerId ? db.bookmark.findUnique({ where: { viewerId_eventId: { viewerId, eventId: id } } }) : null,
    db.event.findMany({ where: { status: "APPROVED" }, orderBy: { date: "asc" } }),
  ]);

  const similar = similarEvents(event, allApproved, 3).map((e) => toEventDTO(e));
  const dto = toEventDTO(event, new Set(bookmark ? [id] : []));

  const phase = eventPhase(dto.date, dto.endDate);
  const timing = eventTiming(dto.date, dto.endDate);
  const target = referenceDate(dto.date, dto.endDate);
  const location = dto.isOnline ? "Online" : (dto.city ?? "Location TBA");
  const typeLabel = EVENT_TYPE_LABELS[dto.eventType] ?? "Event";
  const tags = parseTags(event);
  const closed = phase === "ended";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Breadcrumb */}
      <div className="mb-8 flex items-center gap-3">
        <nav className="min-w-0 flex-1 text-[13px] text-faint">
          <Link href="/" className="hover:text-ink">
            Discover
          </Link>
          <span className="mx-2">/</span>
          <span className="truncate text-muted">{dto.title}</span>
        </nav>
        <BookmarkButton eventId={dto.id} initialBookmarked={!!bookmark} />
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Main */}
        <div>
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-ink">
            {dto.title}
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            {location} · {typeLabel} · by {dto.organizer} ·{" "}
            {dto.viewCount.toLocaleString()} {dto.viewCount === 1 ? "view" : "views"}
          </p>

          {dto.imageUrl && (
            <div className="mt-6">
              <EventPoster
                src={dto.imageUrl}
                alt={dto.title}
                initials={dto.title.slice(0, 2).toUpperCase()}
                className="h-40 w-40"
              />
            </div>
          )}

          {dto.summary && (
            <p className="mt-8 border-t border-line pt-6 text-[16px] leading-relaxed text-ink">
              {dto.summary}
            </p>
          )}

          {dto.description && (
            <p className="mt-5 whitespace-pre-line text-[15px] leading-[1.7] text-muted">
              {dto.description}
            </p>
          )}

          {tags.length > 0 && (
            <p className="mt-6 text-[13px] text-faint">{tags.join(", ")}</p>
          )}

          {/* Facts */}
          <dl className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
            <Fact label="Starts" value={formatDay(dto.date)} />
            <Fact label="Ends" value={dto.endDate ? formatDay(dto.endDate) : "—"} />
            <Fact label="Status" value={timing} />
          </dl>
        </div>

        {/* Sidebar */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-lg border border-line bg-surface p-5">
            <p className="text-[13px] text-muted">
              {closed ? "This event has closed" : phase === "ongoing" ? "Registration closes in" : "Starts in"}
            </p>
            <p className="mt-1 font-mono text-[24px] font-semibold tracking-tight text-ink">
              {countdown(target)}
            </p>

            <div className="mt-5 border-t border-line pt-4">
              <p className="text-[13px] text-faint">Organiser</p>
              <p className="mt-0.5 text-[14px] text-ink">{dto.organizer}</p>
            </div>
            <div className="mt-4">
              <p className="text-[13px] text-faint">Source</p>
              <p className="mt-0.5 text-[14px] capitalize text-ink">{dto.source}</p>
            </div>
            <div className="mt-4">
              <p className="text-[13px] text-faint">Views</p>
              <p className="mt-0.5 text-[14px] text-ink">{dto.viewCount.toLocaleString()}</p>
            </div>

            {dto.link ? (
              <a
                href={dto.link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 block rounded-md bg-ink px-4 py-2.5 text-center text-[14px] font-medium text-bg transition-opacity hover:opacity-90"
              >
                Register on {dto.source}
              </a>
            ) : (
              <p className="mt-6 rounded-md border border-line px-4 py-2.5 text-center text-[14px] text-faint">
                No registration link provided
              </p>
            )}

            <p className="mt-4 text-[12px] leading-relaxed text-faint">
              Listing provided by {dto.source}. Verify details with the organiser before
              travelling or paying.
            </p>
          </div>
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="mt-16 border-t border-line pt-8">
          <h2 className="mb-5 text-[18px] font-semibold tracking-tight text-ink">
            Similar events
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((e, i) => (
              <EventCard key={e.id} event={e} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface p-4">
      <dt className="text-[12px] uppercase tracking-[0.06em] text-faint">{label}</dt>
      <dd className="mt-1 text-[15px] text-ink">{value}</dd>
    </div>
  );
}
