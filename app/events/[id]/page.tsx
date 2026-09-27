import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parseTags, toEventDTO } from "@/lib/events";
import { similarEvents } from "@/lib/recommendations";
import { countdown, eventPhase, eventTiming, formatDay, referenceDate } from "@/lib/format";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { BookmarkButton } from "@/components/BookmarkButton";
import { IndexRow, EventPoster, accentFor, accentTextFor } from "@/components/EventCard";
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
  const dot = accentFor(dto.eventType);
  const accentText = accentTextFor(dto.eventType);
  const tags = parseTags(event);
  const closed = phase === "ended";

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
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
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
            <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${accentText}`}>
              {typeLabel}
            </span>
          </div>

          <h1 className="mt-4 font-serif text-[clamp(2.1rem,5vw,3.2rem)] font-normal leading-[1.05] tracking-[-0.015em] text-ink">
            {dto.title}
          </h1>
          <p className="mt-4 text-[13px] text-faint">
            {location} · by {dto.organizer} ·{" "}
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

          {dto.summary && (
            <p className="mt-9 border-t border-line pt-7 font-serif text-[21px] leading-[1.5] text-ink">
              {dto.summary}
            </p>
          )}

          {dto.description && (
            <p className="mt-6 whitespace-pre-line text-[15px] leading-[1.75] text-muted">
              {dto.description}
            </p>
          )}

          {tags.length > 0 && (
            <p className="mt-7 text-[11px] uppercase tracking-[0.12em] text-faint">
              {tags.join(" · ")}
            </p>
          )}

          <dl className="mt-11 grid grid-cols-1 divide-y divide-line border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Fact label="Starts" value={formatDay(dto.date)} />
            <Fact label="Ends" value={dto.endDate ? formatDay(dto.endDate) : "—"} />
            <Fact label="Status" value={timing} />
          </dl>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-[11px] uppercase tracking-[0.14em] text-faint">
            {closed
              ? "This event has closed"
              : phase === "ongoing"
                ? "Registration closes in"
                : "Starts in"}
          </p>
          <p className="mt-2 font-mono text-[30px] tracking-tight text-ink tabular-nums">
            {countdown(target)}
          </p>

          <div className="mt-8 space-y-5 border-t border-line pt-6">
            <Meta label="Organiser" value={dto.organizer} />
            <Meta label="Source" value={dto.source} capitalize />
            <Meta label="Views" value={dto.viewCount.toLocaleString()} />
          </div>

          {dto.link ? (
            <a
              href={dto.link}
              target="_blank"
              rel="noopener noreferrer"
              className="glow-primary mt-8 block rounded-[2px] bg-gradient-to-r from-primary to-primary-2 px-4 py-2.5 text-center text-sm font-semibold text-bg transition-all duration-200 hover:brightness-105"
            >
              Register on {dto.source}
            </a>
          ) : (
            <p className="mt-8 border-y border-line px-4 py-3 text-center text-[13px] text-faint">
              No registration link provided
            </p>
          )}

          <p className="mt-5 text-[12px] leading-relaxed text-faint">
            Verify details with the organiser before travelling or paying.
          </p>
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="mt-28">
          <h2 className="font-serif text-[26px] leading-none tracking-tight text-ink">
            Also worth a look
          </h2>
          <div className="mt-4">
            {similar.map((e, i) => (
              <IndexRow key={e.id} event={e} index={i + 1} />
            ))}
            <div className="border-t border-line" />
          </div>
        </section>
      )}
    </div>
  );
}

function Meta({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.12em] text-faint">{label}</p>
      <p className={`mt-1 text-[14px] text-ink ${capitalize ? "capitalize" : ""}`}>{value}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-4 sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-faint">{label}</dt>
      <dd className="mt-1.5 text-[15px] text-ink">{value}</dd>
    </div>
  );
}
