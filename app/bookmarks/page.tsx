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

  const events = bookmarks
    .filter((b) => b.event)
    .map((b) => toEventDTO(b.event, new Set([b.event.id])));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-8 pt-8">
        <h1 className="text-[34px] font-bold leading-tight tracking-tight text-ink">
          Saved <span className="text-gradient">events</span>
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          Bookmarks are stored in this browser only and expire after 30 days.
        </p>
      </header>

      {events.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line px-6 py-24 text-center">
          <p className="text-sm text-muted">You have not saved any events yet.</p>
          <Link href="/" className="mt-3 inline-block text-[13px] font-semibold text-primary hover:underline">
            Browse events →
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {events.map((e, i) => (
            <EventCard key={e.id} event={e} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
