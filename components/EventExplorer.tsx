"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventDTO } from "@/lib/events";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants";
import { countdown } from "@/lib/format";
import { IndexRow, LeadStory, Poster, accentFor, accentTextFor } from "./EventCard";
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

export function EventExplorer({
  city,
  onCity,
  now: nowIso,
}: {
  city: string;
  onCity: (c: string) => void;
  now: string;
}) {
  const now = useMemo(() => new Date(nowIso).getTime(), [nowIso]);

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
   * Ordering is the editorial point of the page: the nearest deadlines come
   * first, so the reader meets the most time-sensitive thing immediately.
   */
  const { closing, lead, index } = useMemo(() => {
    if (!events || events.length === 0) {
      return { closing: [] as EventDTO[], lead: null as EventDTO | null, index: [] as EventDTO[] };
    }
    const deadlineOf = (e: EventDTO) =>
      e.endDate ? new Date(e.endDate).getTime() : new Date(e.date).getTime();

    const live = events.filter((e) => deadlineOf(e) >= now).sort((a, b) => deadlineOf(a) - deadlineOf(b));
    const rest = events.filter((e) => deadlineOf(e) < now).sort((a, b) => deadlineOf(a) - deadlineOf(b));

    const ordered = [...live, ...rest];
    return {
      closing: ordered.slice(0, 4),
      lead: ordered[0] ?? null,
      index: ordered.slice(1),
    };
  }, [events, now]);

  const closingSoon = useMemo(
    () => closing.filter((e) => e.endDate && new Date(e.endDate).getTime() >= now).length,
    [closing, now]
  );

  const reset = () => {
    setType("all");
    setMode("all");
    setTimeframe("all");
    setBeginner(false);
    setQ("");
    onCity("");
  };

  return (
    <section className="mt-16 pb-24">
      {/* Filters — quiet index-style controls */}
      <div className="flex flex-col gap-4 border-y border-line py-5">
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
              placeholder="Search"
              className="w-[200px] border-b border-line bg-transparent py-1.5 pl-6 pr-2 text-sm text-ink placeholder:text-faint transition-colors focus:border-primary focus:outline-none"
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
            className={`rounded px-2 py-0.5 transition-colors ${
              !city ? "text-ink" : "text-faint hover:text-muted"
            }`}
          >
            All cities
          </button>
          {CITIES.map((c) => (
            <button
              key={c}
              onClick={() => onCity(c)}
              className={`rounded px-2 py-0.5 transition-colors ${
                city === c ? "text-ink" : "text-faint hover:text-muted"
              }`}
            >
              {c}
            </button>
          ))}
          <span className="ml-auto text-[13px] text-faint">
            {loading && events === null
              ? "loading"
              : `${count} ${count === 1 ? "event" : "events"}`}
            {closingSoon > 0 ? ` · ${closingSoon} closing soon` : ""}
          </span>
        </div>
      </div>

      {error && <p className="mt-10 text-sm text-critical">{error}</p>}

      {events === null && (
        <div className="mt-12 space-y-4">
          <div className="skeleton h-[360px] rounded-lg" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      )}

      {events !== null && events.length === 0 && (
        <div className="mt-12 border-y border-line py-24 text-center">
          <p className="text-sm text-muted">No events match these filters.</p>
          <button onClick={reset} className="mt-3 text-[13px] font-semibold text-primary hover:underline">
            Clear filters
          </button>
        </div>
      )}

      {/* Closing soon */}
      {closing.length > 0 && (
        <section className="mt-16">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-closing">
            Closing soon
          </h2>
          <div className="mt-5 grid grid-cols-2 divide-x divide-line border-y border-line md:grid-cols-4">
            {closing.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="group flex flex-col gap-3 px-5 py-5 first:pl-0 transition-opacity hover:opacity-80"
              >
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accentFor(event.eventType)}`} aria-hidden />
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${accentTextFor(event.eventType)}`}
                  >
                    {EVENT_TYPE_LABELS[event.eventType] ?? "Event"}
                  </span>
                </div>
                <Poster event={event} radius="rounded-md" className="h-14 w-14" />
                <p className="line-clamp-2 text-[14px] leading-snug text-ink transition-colors group-hover:text-white">
                  {event.title}
                </p>
                <p className="mt-auto font-mono text-[12px] text-closing">
                  {countdown(event.endDate ?? event.date)} left
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Lead story */}
      {lead && (
        <section className="mt-20">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            Lead story
          </h2>
          <div className="mt-6">
            <LeadStory event={lead} />
          </div>
        </section>
      )}

      {/* The index */}
      {index.length > 0 && (
        <section className="mt-24">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            The index
          </h2>
          <div className="mt-4">
            {index.map((event, i) => (
              <IndexRow key={event.id} event={event} index={i + 1} />
            ))}
            <div className="border-t border-line" />
          </div>
        </section>
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
              : "border-transparent text-faint hover:text-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
