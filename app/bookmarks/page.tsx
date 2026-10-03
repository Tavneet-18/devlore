import Link from "next/link";
import { db } from "@/lib/db";
import { toEventDTO } from "@/lib/events";
import { getViewerId } from "@/lib/session";
import { SavedEventList } from "@/components/SavedEventList";

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
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
      <header className="mb-10 border-b border-line pb-8 pt-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-faint">Your selections</p>
        <h1 className="mt-4 font-serif text-[clamp(2.4rem,6vw,3.6rem)] font-normal leading-[0.98] tracking-[-0.02em] text-ink">
          Saved <em>events</em>
        </h1>
        <p className="mt-4 max-w-md text-[14px] leading-relaxed text-muted">
          Bookmarks are stored against this browser only and expire after 30 days.
        </p>
      </header>

      {events.length === 0 ? (
        <div className="mt-10 border-y border-line py-24 text-center">
          <p className="text-sm text-muted">You have not saved any events yet.</p>
          <Link
            href="/"
            className="tap-target mt-3 inline-block text-[13px] font-semibold text-primary hover:underline"
          >
            Browse events →
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          <SavedEventList events={events} />
        </div>
      )}
    </div>
  );
}
