import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parseTags, toEventDTO } from "@/lib/events";
import { similarEvents } from "@/lib/recommendations";
import {
  countdown,
  eventPhase,
  eventTiming,
  formatDateRange,
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

  const similarEventsDTO = similarEvents(event, allApproved, 3).map((e) => toEventDTO(e));
  const dto = toEventDTO(event, new Set(bookmark ? [id] : []));

  // Timing is derived from both ends of the window so a running multi-day
  // event is never described as finished.
  const phase = eventPhase(dto.date, dto.endDate);
  const timing = eventTiming(dto.date, dto.endDate);
  const target = referenceDate(dto.date, dto.endDate);
  const locationLabel = dto.isOnline ? "Online" : (dto.city ?? "Location TBA");
  const typeLabel = EVENT_TYPE_LABELS[dto.eventType] ?? "Event";

  // Short, stable, non-guessable reference derived from the id.
  const ticketRef = dto.id.slice(-6).toUpperCase();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/" className="font-medium text-muted transition hover:text-white">
          Discover
        </Link>
        <span className="text-faint">→</span>
        <span className="truncate text-white">{dto.title}</span>
        <span
          className={`ml-auto hidden items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider sm:flex ${
            phase === "ongoing"
              ? "border-accent/30 bg-accent/10 text-accent"
              : phase === "upcoming"
                ? "border-tertiary/30 bg-tertiary/10 text-tertiary"
                : "border-white/10 bg-white/5 text-faint"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              phase === "ongoing"
                ? "animate-pulse bg-accent"
                : phase === "upcoming"
                  ? "animate-pulse bg-tertiary"
                  : "bg-faint"
            }`}
          />
          {typeLabel} · {dto.isOnline ? "Online" : "In person"} · {timing}
        </span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              {dto.title}
            </h1>
            <BookmarkButton eventId={dto.id} initialBookmarked={!!bookmark} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-primary via-tertiary to-primary p-[2px]">
              <div className="flex h-full w-full items-center justify-center rounded-full bg-card text-xs font-bold text-white">
                {dto.organizer.slice(0, 2).toUpperCase()}
              </div>
            </div>
            <span className="text-sm text-muted">{dto.organizer}</span>
            <span className="text-xs text-faint">
              👁 {dto.viewCount.toLocaleString()} {dto.viewCount === 1 ? "view" : "views"}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
              {typeLabel}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-muted">
              {locationLabel}
            </span>
            {dto.beginnerFriendly && (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                Beginner-friendly
              </span>
            )}
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium capitalize text-muted">
              via {dto.source}
            </span>
          </div>

          {/* Countdown strip, from real data */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-r from-primary/15 via-card to-tertiary/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                {phase === "ongoing"
                  ? "Registration closes in"
                  : phase === "upcoming"
                    ? "Starts in"
                    : "This event has closed"}
              </span>
              <span className="rounded-lg border border-white/10 bg-midnight px-3 py-1 font-mono text-xs font-bold text-white">
                {countdown(target)} remaining
              </span>
            </div>
          </div>

          {/* Official poster, shown at its natural square size */}
          <div className="mt-4 flex justify-center">
            <div className="rounded-2xl border border-white/10 bg-card/60 p-3">
              <EventPoster src={dto.imageUrl} alt={dto.title} size="lg" />
              <p className="mt-2 text-center text-[11px] text-faint">Official event poster</p>
            </div>
          </div>

          {dto.summary && (
            <blockquote className="mt-6 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 to-tertiary/5 px-5 py-4 text-sm leading-relaxed italic text-muted">
              <span className="font-bold not-italic text-primary">✨ DEVLORE AI BRIEF:</span> {dto.summary}
            </blockquote>
          )}

          {dto.description && (
            <p className="mt-6 whitespace-pre-line text-base leading-relaxed text-muted">
              {dto.description}
            </p>
          )}

          {parseTags(event).length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {parseTags(event).map((t: string) => (
                <span
                  key={t}
                  className="rounded-full border border-white/10 bg-ink px-3 py-1 font-mono text-xs text-muted transition hover:border-primary/30 hover:text-white"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        <aside className="lg:col-span-1">
          <div className="sticky top-[76px] overflow-hidden rounded-2xl border border-primary/20 bg-card/80 p-6 shadow-[0_16px_40px_rgba(124,92,255,0.15)] backdrop-blur-xl">
            <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary/15 blur-2xl" />
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-faint">Dev-Pass Ticket</h3>
              <span className="font-mono text-xs text-muted">#{ticketRef}</span>
            </div>
            <div className="mt-3 border-t border-dashed border-white/10" />

            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Dates</dt>
                <dd className="mt-1 font-medium text-white">{formatDateRange(dto.date, dto.endDate)}</dd>
                <dd
                  className={`mt-0.5 text-xs ${
                    phase === "ended" ? "text-faint" : "text-tertiary"
                  }`}
                >
                  {timing}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Location</dt>
                <dd className="mt-1 font-medium text-white">{locationLabel}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Organizer</dt>
                <dd className="mt-1 font-medium text-white">{dto.organizer}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Source</dt>
                <dd className="mt-1 font-medium capitalize text-white">{dto.source}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Views</dt>
                <dd className="mt-1 font-medium text-white">{dto.viewCount.toLocaleString()}</dd>
              </div>
            </dl>

            <a
              href={dto.link ?? "#"}
              target={dto.link ? "_blank" : undefined}
              rel="noreferrer noopener"
              aria-disabled={!dto.link}
              className={`mt-6 block rounded-xl py-3 text-center text-sm font-bold uppercase tracking-wider text-white transition ${
                dto.link
                  ? "bg-gradient-to-r from-primary to-purple-600 shadow-[0_0_16px_rgba(124,92,255,0.4)] hover:opacity-90"
                  : "cursor-not-allowed bg-white/5 text-faint"
              }`}
            >
              Register on {dto.source} →
            </a>
            <Link
              href="/"
              className="mt-3 block rounded-xl border border-white/10 py-2.5 text-center text-sm font-medium text-muted transition hover:bg-white/5 hover:text-white"
            >
              ← Browse more events
            </Link>
          </div>
        </aside>
      </div>

      {similarEventsDTO.length > 0 && (
        <section className="mt-16 border-t border-white/5 pt-10">
          <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-white">
            <span className="h-6 w-1 rounded-full bg-primary" /> Similar sprints you might like
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {similarEventsDTO.map((e, i) => (
              <EventCard key={e.id} event={e} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
