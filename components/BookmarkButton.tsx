"use client";

import { useState, useTransition } from "react";

type Props = {
  eventId: string;
  initialBookmarked?: boolean;
};

export function BookmarkButton({ eventId, initialBookmarked = false }: Props) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [busy, setIsBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function toggle() {
    if (busy) return;
    setIsBusy(true);
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
      setIsBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? "Remove from saved" : "Save event"}
      title={bookmarked ? "Saved" : "Save"}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur transition ${
        bookmarked
          ? "border-primary/40 bg-primary/20 text-primary shadow-[0_0_12px_rgba(124,92,255,0.3)]"
          : "border-white/10 bg-white/5 text-muted hover:border-primary/30 hover:text-primary hover:bg-white/10"
      } ${busy ? "opacity-50" : ""}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
