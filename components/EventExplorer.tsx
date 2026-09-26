"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventDTO } from "@/lib/events";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants";
import { EventCard, FeaturedCard } from "./EventCard";
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
  { id: "all", label: "Everything" },
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

  /**
   * The lead story is whichever event is closest to closing, since that is
   * the one worth acting on. Everything else keeps the API's ordering.
   */
  const { lead, rest } = useMemo(() => {
    if (!events || events.length === 0) {
      return { lead: null as EventDTO | null, rest: [] as EventDTO[] };
    }
    // Derived purely from `events` — reading the clock during render would
    // make this impure, so only endDate is used to rank the lead.
    const closing = events
      .filter((e) => e.endDate != null)
      .sort(
        (a, b) =>
          new Date(a.endDate as string).getTime() - new Date(b.endDate as string).getTime()
      );
    if (closing.length === 0) return { lead: events[0], rest: events.slice(1) };
    const first = closing[0];
    return { lead: first, rest: events.filter((e) => e.id !== first.id) };
  }, [events]);

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
      {/* Filters — quiet, underline tabs read as editorial index lines */}
      <div className="flex flex-col gap-4 border-b border-line pb-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-faint"
              width="15"
              height="15"
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
              className="w-[260px] border-b border-line bg-transparent py-1.5 pl-6 pr-2 text-sm text-ink placeholder:text-faint transition-colors focus:border-primary focus:outline-none"
            />
          </div>

          <Tabs options={TYPE_OPTIONS} value={type} onChange={setType} />
          <Tabs options={MODES} value={mode} onChange={setMode} />
          <Tabs
            options={TIMEFRAMES as readonly { id: string; label: string }[]}
            value={timeframe}
            onChange={setTimeframe as (v: string) => void}
          />

          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={beginner}
              onChange={(e) => setBeginner(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line accent-primary"
            />
            Beginner friendly
          </label>
        </div>

        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto text-[13px] whitespace-nowrap">
          <button
            onClick={() => onCity("")}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              !city ? "bg-primary/15 text-ink" : "text-faint hover:text-ink"
            }`}
          >
            All cities
          </button>
          {CITIES.map((c) => (
            <button
              key={c}
              onClick={() => onCity(c)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                city === c ? "bg-primary/15 text-ink" : "text-faint hover:text-ink"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-8 text-sm text-critical">{error}</p>}

      {events === null && (
        <div className="mt-8 space-y-4">
          <div className="skeleton h-[380px] rounded-2xl" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      )}

      {events !== null && events.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-line px-6 py-24 text-center">
          <p className="text-sm text-muted">No events match these filters.</p>
          <button onClick={reset} className="mt-3 text-[13px] font-semibold text-primary hover:underline">
            Clear filters
          </button>
        </div>
      )}

      {lead && (
        <>
          <div className="mt-8 flex items-baseline justify-between gap-4">
            <h2 className="text-[20px] font-semibold tracking-tight text-ink">Closest to deadline</h2>
            <span className="text-[13px] text-faint">
              {loading && events === null ? "loading" : `${count} ${count === 1 ? "event" : "events"}`}
            </span>
          </div>

          <div className="mt-4">
            <FeaturedCard event={lead} />
          </div>
        </>
      )}

      {rest.length > 0 && (
        <>
          <div className="mt-12 flex items-baseline justify-between gap-4">
            <h2 className="text-[20px] font-semibold tracking-tight text-ink">More to explore</h2>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {rest.map((event, i) => (
              <EventCard key={event.id} event={event} index={i} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Tabs({
  options,
  value,
  onChange,
}: {
  options: readonly { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`border-b pb-0.5 text-[13px] transition-colors ${
            value === opt.id
              ? "border-primary text-ink"
              : "border-transparent text-faint hover:text-ink"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
