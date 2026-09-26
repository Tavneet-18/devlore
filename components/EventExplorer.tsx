"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventDTO } from "@/lib/events";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants";
import { EventCard } from "./EventCard";
import { SkeletonCard } from "./SkeletonCard";

const TIMEFRAMES = [
  { id: "all", label: "Upcoming" },
  { id: "week", label: "This week" },
  { id: "month", label: "Next 30 days" },
] as const;

const MODES = [
  { id: "all", label: "All" },
  { id: "offline", label: "In person" },
  { id: "online", label: "Online" },
];

const TYPE_OPTIONS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  ...EVENT_TYPES.map((t) => ({ id: t, label: EVENT_TYPE_LABELS[t] ?? t })),
];

const CITIES = ["Bangalore", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"];

export function EventExplorer({ city, onCity }: { city: string; onCity: (c: string) => void }) {
  const [type, setType] = useState("all");
  const [mode, setMode] = useState("all");
  const [timeframe, setTimeframe] = useState<"all" | "week" | "month">("all");
  const [beginner, setBeginner] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [events, setEvents] = useState<EventDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const fetchEvents = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (type !== "all") params.set("type", type);
    if (mode !== "all") params.set("mode", mode);
    if (timeframe !== "all") params.set("timeframe", timeframe);
    if (beginner) params.set("beginner", "true");
    if (debouncedQ) params.set("q", debouncedQ);

    try {
      const res = await fetch(`/api/events?${params.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setEvents(data.events as EventDTO[]);
      setCount(data.count as number);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setEvents(null);
        setError("Could not load events. Please try again.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [city, type, mode, timeframe, beginner, debouncedQ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchEvents();
    return () => abortRef.current?.abort();
  }, [fetchEvents]);

  const reset = () => {
    setType("all");
    setMode("all");
    setTimeframe("all");
    setBeginner(false);
    setQ("");
    onCity("");
  };

  return (
    <section>
      {/* Toolbar */}
      <div className="space-y-3.5 rounded-xl border border-line bg-surface/70 p-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full lg:w-72">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search events, topics, organisers"
              className="w-full rounded-lg border border-line bg-raised/60 py-2 pl-9 pr-3 text-sm text-ink placeholder:text-faint transition-colors focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Segmented options={TYPE_OPTIONS} value={type} onChange={setType} />
            <Segmented options={MODES} value={mode} onChange={setMode} />
            <Segmented
              options={TIMEFRAMES as readonly { id: string; label: string }[]}
              value={timeframe}
              onChange={setTimeframe as (v: string) => void}
            />
          </div>
        </div>

        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pt-1 text-xs whitespace-nowrap">
          <button
            onClick={() => onCity("")}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              !city
                ? "border-primary/30 bg-primary/15 text-white"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            All cities
          </button>
          {CITIES.map((c) => (
            <button
              key={c}
              onClick={() => onCity(c)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                city === c
                  ? "border-primary/30 bg-primary/15 text-white"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {c}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={beginner}
              onChange={(e) => setBeginner(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line accent-primary"
            />
            Beginner friendly
          </label>
        </div>
      </div>

      {/* Results */}
      <div className="mt-5 flex items-center justify-between text-[13px]">
        <span className="text-faint">
          {count} {count === 1 ? "event" : "events"}
          {loading ? "…" : ""}
        </span>
      </div>

      <div className="mt-5">
        {error && <p className="text-sm text-critical">{error}</p>}

        {events === null && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {events !== null && events.length === 0 && (
          <div className="rounded-xl border border-dashed border-line px-6 py-20 text-center">
            <p className="text-sm text-muted">No events match these filters.</p>
            <button onClick={reset} className="mt-3 text-[13px] text-primary hover:underline">
              Clear filters
            </button>
          </div>
        )}

        {events !== null && events.length > 0 && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event, i) => (
              <EventCard key={event.id} event={event} index={i} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: readonly { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-raised/80 p-1 text-xs font-medium">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`rounded px-2.5 py-1 transition-all ${
            value === opt.id
              ? "border border-primary/40 bg-primary/20 text-white"
              : "border border-transparent text-muted hover:text-white"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
