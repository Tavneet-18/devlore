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
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-[32px] font-bold leading-tight tracking-tight text-ink">Saved events</h1>
        <p className="mt-2 text-[15px] text-muted">
          Bookmarks are stored in this browser only and expire after 30 days.
        </p>
      </header>

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center">
          <p className="text-[14px] text-muted">You have not saved any events yet.</p>
          <Link href="/" className="mt-3 inline-block text-[13px] text-accent-soft hover:underline">
            Browse events
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e, i) => (
            <EventCard key={e.id} event={e} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
