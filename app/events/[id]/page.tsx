import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parseTags, toEventDTO } from "@/lib/events";
import { similarEvents } from "@/lib/recommendations";
import { formatDay, relativeFromNow } from "@/lib/format";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { BookmarkButton } from "@/components/BookmarkButton";
import { EventCard } from "@/components/EventCard";
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

  const similar = similarEvents(event, allApproved, 3);
  const similarEventsDTO = similar.map((e) => toEventDTO(e));
  const dto = toEventDTO(event, new Set(bookmark ? [id] : []));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav className="mb-6 flex items-center gap-2 text-sm">
        <Link href="/" className="font-medium text-muted hover:text-white">
          Discover
        </Link>
        <span className="text-faint">→</span>
        <span className="truncate text-white">{event.title}</span>
        <span className="ml-auto hidden items-center gap-2 rounded-full border border-tertiary/20 bg-tertiary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-tertiary sm:flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tertiary" /> In-Person Hackathon · Starts in 3 days
        </span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              {event.title}
            </h1>
            <BookmarkButton eventId={event.id} initialBookmarked={!!bookmark} />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-primary via-tertiary to-primary p-[2px]">
              <div className="flex h-full w-full items-center justify-center rounded-full bg-card text-xs font-bold text-white">
                {event.organizer.slice(0, 2).toUpperCase()}
              </div>
            </div>
            <span className="text-sm text-muted">{event.organizer}</span>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">Verified</span>
            <span className="text-xs text-faint">👁 {event.viewCount.toLocaleString()} views</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
              {EVENT_TYPE_LABELS[event.eventType as keyof typeof EVENT_TYPE_LABELS] ?? event.eventType}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-muted">
              {event.isOnline ? "Online" : event.city ?? "TBA"}
            </span>
            {event.beginnerFriendly && (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">Beginner-friendly</span>
            )}
            <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">₹ Escrow Locked</span>
          </div>

          {/* Hero banner placeholder with countdown */}
          <div className="relative mt-6 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-primary/20 via-card to-tertiary/10 p-1">
            <div className="rounded-xl bg-card p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">Live Countdown</span>
                <span className="rounded-lg border border-white/10 bg-midnight px-3 py-1 font-mono text-xs font-bold text-white">3d : 14h : 22m remaining</span>
              </div>
              <div className="mt-4 h-32 rounded-xl bg-gradient-to-r from-primary/10 to-tertiary/10 border border-dashed border-white/10 flex items-center justify-center">
                <span className="text-sm text-muted">Hackathon Banner · Indiranagar Hacker House</span>
              </div>
            </div>
          </div>

          {event.summary && (
            <blockquote className="mt-6 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 to-tertiary/5 px-5 py-4 text-sm leading-relaxed italic text-muted">
              <span className="font-bold text-primary">✨ DEVLORE AI BRIEF:</span> {event.summary}
            </blockquote>
          )}

          {event.description && <p className="mt-6 whitespace-pre-line text-base leading-relaxed text-muted">{event.description}</p>}

          {parseTags(event).length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {parseTags(event).map((t: string) => (
                <span key={t} className="rounded-full border border-white/10 bg-ink px-3 py-1 font-mono text-xs text-muted hover:border-primary/30 hover:text-white transition">
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Timeline */}
          <div className="mt-8 rounded-xl border border-white/10 bg-card/60 p-5 backdrop-blur">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Milestones</h3>
            <div className="mt-4 grid gap-3 text-sm text-muted">
              <div className="flex gap-3"><span className="text-primary">●</span> Day 1 — Kickoff & Team Formation</div>
              <div className="flex gap-3"><span className="text-tertiary">●</span> Day 2 — Midnight Mentor Sessions</div>
              <div className="flex gap-3"><span className="text-accent">●</span> Day 3 — Demos & Prize Allocation</div>
            </div>
          </div>
        </div>

        <aside className="lg:col-span-1">
          <div className="sticky top-[76px] rounded-2xl border border-primary/20 bg-card/80 p-6 backdrop-blur-xl shadow-[0_16px_40px_rgba(124,92,255,0.15)] relative overflow-hidden">
            <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary/15 blur-2xl" />
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-faint">Dev-Pass Ticket</h3>
              <span className="font-mono text-xs text-muted">#BLR-8921</span>
            </div>
            <div className="mt-1 h-px border-t border-dashed border-white/10" />
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Date</dt>
                <dd className="mt-1 font-medium text-white">
                  {formatDay(dto.date)} <span className="ml-2 text-xs text-tertiary">{relativeFromNow(dto.date)}</span>
                </dd>
              </div>
              {event.endDate && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-faint">End date</dt>
                  <dd className="mt-1 font-medium text-white">{formatDay(dto.endDate!)}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Location</dt>
                <dd className="mt-1 font-medium text-white">{event.isOnline ? "Online" : event.city ?? "TBA"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Organizer</dt>
                <dd className="mt-1 font-medium text-white">{event.organizer}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Source</dt>
                <dd className="mt-1 font-medium capitalize text-white">{event.source}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Views</dt>
                <dd className="mt-1 font-medium text-white">{event.viewCount.toLocaleString()}</dd>
              </div>
            </dl>

            <Link
              href={event.link ?? "#"}
              target={event.link ? "_blank" : undefined}
              rel="noreferrer"
              className="mt-6 block rounded-xl bg-gradient-to-r from-primary to-purple-600 py-3 text-center text-sm font-bold uppercase tracking-wider text-white shadow-[0_0_16px_rgba(124,92,255,0.4)] transition hover:opacity-90"
            >
              Register Sprint Team →
            </Link>
            <Link href="/" className="mt-3 block rounded-xl border border-white/10 py-2.5 text-center text-sm font-medium text-muted transition hover:bg-white/5 hover:text-white">
              ← Browse more events
            </Link>
            <p className="mt-3 text-center text-xs text-faint">🛡 Escrow Protected · Bounties locked</p>
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
