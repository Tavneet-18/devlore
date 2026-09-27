"use client";

import { Marquee } from "@/components/ui/marquee";
import { countdown } from "@/lib/format";
import type { EventDTO } from "@/lib/events";

/**
 * A slow crawl of real closing deadlines.
 *
 * This is the one piece of motion on the site and it is informational rather
 * than decorative: deadlines are the reason the product exists, so they sit
 * directly under the nameplate where they are impossible to miss. Every entry
 * comes from the database — nothing here is invented.
 */
export function DeadlineTicker({ events }: { events: EventDTO[] }) {
  const items = events.slice(0, 6);
  if (items.length === 0) return null;

  return (
    <div className="border-b border-line">
      <div className="ticker-mask overflow-hidden">
        <Marquee pauseOnHover className="[--duration:70s] [--gap:3rem] py-2.5">
          {items.map((event) => (
            <span
              key={event.id}
              className="flex shrink-0 items-center gap-2.5 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.14em]"
            >
              <span className="text-faint">{event.title}</span>
              <span className="text-line-hi" aria-hidden>
                —
              </span>
              <span className="text-closing">Closes in {countdown(event.endDate ?? event.date)}</span>
            </span>
          ))}
        </Marquee>
      </div>
    </div>
  );
}
