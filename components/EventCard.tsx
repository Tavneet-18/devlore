import Link from "next/link";
import { eventPhase, eventTiming, formatDateRange } from "@/lib/format";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { BookmarkButton } from "./BookmarkButton";
import type { EventDTO } from "@/lib/events";

export function EventCard({ event, index = 0 }: { event: EventDTO; index?: number }) {
  const accent = (() => {
    switch (event.eventType) {
      case "hackathon": return "primary";
      case "meetup": return "tertiary";
      case "workshop": return "accent";
      case "webinar": return "secondary";
      case "conference": return "primary";
      default: return "muted";
    }
  })();

  const typeCls: Record<string, string> = {
    primary: "bg-primary/15 text-primary border-primary/30",
    tertiary: "bg-tertiary/15 text-tertiary border-tertiary/30",
    accent: "bg-accent/15 text-accent border-accent/30",
    secondary: "bg-secondary/15 text-secondary border-secondary/30",
    muted: "bg-white/5 text-muted border-white/10",
  };

  const phase = eventPhase(event.date, event.endDate);
  const timing = eventTiming(event.date, event.endDate);
  const location = event.isOnline ? "Online" : (event.city ?? "TBA");

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-card backdrop-blur-xl transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_8px_32px_rgba(124,92,255,0.2)]"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <span className="ticket-notch-top hidden sm:block" />
      <span className="ticket-notch-bottom hidden sm:block" />

      {/* Banner */}
      <div className="relative h-44 w-full overflow-hidden bg-ink">
        {event.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.imageUrl}
            alt={event.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 via-transparent to-tertiary/15 text-xs text-faint">
            No banner
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur ${typeCls[accent]}`}
          >
            {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
          </span>
          {event.beginnerFriendly && (
            <span className="rounded-full border border-accent/30 bg-accent/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent backdrop-blur">
              Beginner
            </span>
          )}
        </div>

        <div className="absolute right-3 top-3">
          <BookmarkButton eventId={event.id} initialBookmarked={event.bookmarked ?? false} />
        </div>

        <div
          className={`absolute bottom-2.5 right-3 rounded-lg border px-2 py-1 text-[11px] font-medium backdrop-blur ${
            phase === "ended"
              ? "border-white/10 bg-midnight/80 text-faint"
              : "border-tertiary/30 bg-midnight/80 text-tertiary"
          }`}
        >
          {timing}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5">
            <span className={`h-1.5 w-1.5 rounded-full ${event.isOnline ? "bg-cyanGlow" : "bg-tertiary"}`} />
            {location}
          </span>
        </div>

        <Link href={`/events/${event.id}`} className="group/title mt-3 block">
          <h3 className="line-clamp-2 text-[16px] font-bold leading-snug text-white transition-colors group-hover/title:text-primary">
            {event.title}
          </h3>
        </Link>

        {event.summary && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{event.summary}</p>
        )}

        <div className="mt-2 text-xs text-faint">by {event.organizer}</div>

        {event.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {event.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-white/5 bg-ink px-2 py-0.5 font-mono text-[10px] text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center gap-2 border-t border-white/5 pt-4">
          <span className="flex items-center gap-1 text-xs text-muted">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="17" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
            </svg>
            {formatDateRange(event.date, event.endDate)}
          </span>
          <Link
            href={`/events/${event.id}`}
            className="ml-auto rounded-full bg-gradient-to-r from-primary to-purple-600 px-4 py-2 text-xs font-bold text-white shadow-[0_0_12px_rgba(124,92,255,0.3)] transition hover:opacity-90"
          >
            View
          </Link>
        </div>
      </div>
    </article>
  );
}
