import Link from "next/link";
import { db } from "@/lib/db";
import { toEventDTO } from "@/lib/events";
import { getViewerId } from "@/lib/session";
import { EventCard } from "@/components/EventCard";

export const dynamic = "force-dynamic";

export default async function BookmarksPage() {
  const viewerId = await getViewerId();
  const bookmarks = viewerId
    ? await db.bookmark.findMany({
        where: { viewerId },
        include: { event: true },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const events = bookmarks.filter((b) => b.event).map((b) => toEventDTO(b.event, new Set([b.event.id])));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <nav className="mb-6 text-sm text-muted">
        <Link href="/" className="hover:text-white">
          Discover
        </Link>{" "}
        <span className="text-faint">→</span> <span className="text-white">Saved Events</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Saved Sprints <span className="ml-2 rounded-full bg-primary/20 px-3 py-1 text-sm font-bold text-primary">{events.length}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">Bookmarks synced via <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white">devlore_visitor</code> cookie · 30 days on this device.</p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-xl border border-white/10 bg-card/60 px-4 py-2 text-xs font-semibold text-muted">Total Pool: ₹84.5L</span>
          <span className="rounded-xl border border-white/10 bg-card/60 px-4 py-2 text-xs font-semibold text-muted">Next: 2d 14h</span>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-card/40 p-12 text-center backdrop-blur">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
          </div>
          <h3 className="mt-4 text-lg font-bold text-white">No saved events yet</h3>
          <p className="mt-1 text-sm text-muted">Explore City Radar or set Discord alerts to find niche bounties.</p>
          <Link href="/" className="mt-6 inline-flex rounded-xl bg-gradient-to-r from-primary to-purple-600 px-6 py-3 text-sm font-bold text-white shadow-[0_0_16px_rgba(124,92,255,0.3)]">
            + Browse Hackathons
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e, i) => (
            <EventCard key={e.id} event={e} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
