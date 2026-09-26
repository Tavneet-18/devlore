"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventDTO } from "@/lib/events";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants";
import { EventCard } from "./EventCard";
import { SkeletonCard } from "./SkeletonCard";

const TIMEFRAMES = [
  { id: "all", label: "Any time" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
] as const;

const MODES = [
  { id: "all", label: "Any format" },
  { id: "online", label: "Online" },
  { id: "offline", label: "In person" },
];

const TYPE_OPTIONS: { id: string; label: string }[] = [
  { id: "all", label: "All types" },
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

  return (
    <section>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-y border-line py-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search events"
            className="min-w-[200px] flex-1 rounded-md border border-line bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={beginner}
              onChange={(e) => setBeginner(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line accent-accent"
            />
            Beginner friendly
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Segmented label="Type" options={TYPE_OPTIONS} value={type} onChange={setType} />
          <Segmented label="Format" options={MODES} value={mode} onChange={setMode} />
          <Segmented
            label="When"
            options={TIMEFRAMES as readonly { id: string; label: string }[]}
            value={timeframe}
            onChange={setTimeframe as (v: string) => void}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-faint">City</span>
          <button
            onClick={() => onCity("")}
            className={`rounded-md px-2 py-1 text-[13px] transition-colors ${
              !city ? "bg-raised text-ink" : "text-muted hover:text-ink"
            }`}
          >
            All
          </button>
          {CITIES.map((c) => (
            <button
              key={c}
              onClick={() => onCity(c)}
              className={`rounded-md px-2 py-1 text-[13px] transition-colors ${
                city === c ? "bg-raised text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="py-4">
        {error && <p className="text-[14px] text-critical">{error}</p>}

        {!error && !loading && events !== null && (
          <p className="mb-4 text-[13px] text-faint">
            {count} {count === 1 ? "event" : "events"}
            {loading ? "…" : ""}
          </p>
        )}

        {!error && events === null && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {!error && events !== null && events.length === 0 && (
          <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center">
            <p className="text-[14px] text-muted">No events match these filters.</p>
            <button
              onClick={() => {
                setType("all");
                setMode("all");
                setTimeframe("all");
                setBeginner(false);
                setQ("");
                onCity("");
              }}
              className="mt-3 text-[13px] text-accent-soft hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {!error && events !== null && events.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-faint">{label}</span>
      <div className="flex items-center gap-0.5 rounded-md border border-line p-0.5">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`rounded px-2.5 py-1 text-[13px] transition-colors duration-150 ${
              value === opt.id ? "bg-raised text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
