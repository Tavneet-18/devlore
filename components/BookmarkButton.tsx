"use client";

import { useState, useTransition } from "react";

type Props = {
  eventId: string;
  initialBookmarked?: boolean;
};

export function BookmarkButton({ eventId, initialBookmarked = false }: Props) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !bookmarked;
    try {
      const res = await fetch(next ? "/api/bookmarks" : `/api/bookmarks/${eventId}`, {
        method: next ? "POST" : "DELETE",
        headers: next ? { "Content-Type": "application/json" } : undefined,
        body: next ? JSON.stringify({ eventId }) : undefined,
      });
      if (!res.ok) return;
      startTransition(() => setBookmarked(next));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? "Remove from saved" : "Save event"}
      title={bookmarked ? "Saved" : "Save"}
      className={`-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-faint transition-colors duration-150 hover:bg-raised hover:text-ink disabled:opacity-50 ${
        bookmarked ? "text-accent-soft" : ""
      }`}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill={bookmarked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
