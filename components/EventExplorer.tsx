"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventDTO } from "@/lib/events";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants";
import { IndexRow } from "./EventCard";
import { TimeAxis } from "./TimeAxis";
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
   *
   * The axis and the index are disjoint by construction. They previously
   * overlapped, which put the lead story inside the closing-soon strip as
   * well — the same event rendered twice on one page.
   */
  const { index, upcoming } = useMemo(() => {
    if (!events || events.length === 0) {
      return { index: [] as EventDTO[], upcoming: [] as EventDTO[] };
    }
    const deadlineOf = (e: EventDTO) =>
      e.endDate ? new Date(e.endDate).getTime() : new Date(e.date).getTime();

    const live = events.filter((e) => deadlineOf(e) >= now).sort((a, b) => deadlineOf(a) - deadlineOf(b));
    const rest = events.filter((e) => deadlineOf(e) < now).sort((a, b) => deadlineOf(a) - deadlineOf(b));

    return {
      upcoming: live,
      // The index is the detail view: everything not already on the axis,
      // nearest deadline first.
      index: [...live, ...rest].slice(1),
    };
  }, [events, now]);

  // Actually closing within a week. This used to be the length of the whole
  // upcoming list, so the number was right but the label was not: it counted
  // every open event, including ones closing in three months.
  const closingSoon = useMemo(
    () =>
      upcoming.filter((e) => {
        const d = e.endDate ? new Date(e.endDate).getTime() : new Date(e.date).getTime();
        return d - now < 7 * 86400000;
      }).length,
    [upcoming, now]
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
    <section className="pb-24">
      {/* The spatial time axis — the organising structure of the page. */}
      {upcoming.length > 0 && (
        <div className="mt-12">
          <TimeAxis events={upcoming} now={nowIso} />
        </div>
      )}

      {/* Filters — quiet index-style controls */}
      <div className="mt-10 flex flex-col gap-4 border-b border-line pb-5">
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
          <div className="skeleton h-[360px] rounded-[2px]" />
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

      {/* The index — the detail view for readers who want the full roster. */}
      {index.length > 0 && (
        <section className="mt-24">
          <h2 className="font-serif text-[26px] leading-none tracking-tight text-ink">
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
