"use client";

import { useState } from "react";
import { IndexRow } from "./EventCard";
import { EventQuickLook } from "./EventQuickLook";
import type { EventDTO } from "@/lib/events";

/**
 * The saved-events list, plus its quick-look.
 *
 * This exists only to own the dialog state. /bookmarks is a server component
 * that fetches and shapes its rows, and a <dialog> has to be opened and closed
 * from the client, so the rows are handed down intact rather than refetched or
 * re-derived here. The alternative — making the whole page a client component —
 * would move data fetching behind the bundle for no gain.
 *
 * The dialog is rendered once, after the rows rather than inside them, so it
 * survives a re-render of the list and never has to be re-created mid-open.
 */
export function SavedEventList({ events }: { events: EventDTO[] }) {
  const [quickLook, setQuickLook] = useState<EventDTO | null>(null);

  return (
    <>
      {events.map((e, i) => (
        <IndexRow key={e.id} event={e} index={i + 1} onQuickLook={setQuickLook} />
      ))}
      <div className="border-t border-line" />
      <EventQuickLook event={quickLook} onClose={() => setQuickLook(null)} />
    </>
  );
}