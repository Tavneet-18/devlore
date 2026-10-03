"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventDTO } from "@/lib/events";
import { DISCOVER_RESET_EVENT, EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants";
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
  /** Set once a request has been in flight long enough to be worth flagging. */
  const [slow, setSlow] = useState(false);
  /** Set when a request has taken so long that waiting further is pointless. */
  const [stalled, setStalled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  /**
   * A slow request is indistinguishable from a broken one if the only feedback
   * is a skeleton. Observed in the wild: /api/events took 36s on a network
   * where the same endpoint answered in 1.6s elsewhere. So the wait escalates
   * — first an acknowledgement that it is slow, then an honest dead end with
   * a way out, rather than an indefinite shimmer.
   */
  useEffect(() => {
    if (!loading) return;
    const a = setTimeout(() => setSlow(true), 5000);
    const b = setTimeout(() => setStalled(true), 18000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [loading]);

  const fetchEvents = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setSlow(false);
    setStalled(false);

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
   * `closing` and `happening` are separated by deadlineKind, not by date.
   * WeMakeDevs and MLH publish no registration deadline, so the only date they
   * give is when the event finishes. Putting those on a closing-deadline axis
   * would claim a finish date is a deadline and would inflate "closing soon"
   * with events that are not closing, so they get their own section below.
   *
   * A null deadlineKind is legacy content from before the column existed
   * (Devpost, Unstop, GDG) whose endDate has always been treated as the
   * closing date. It stays on the axis, so this change is purely additive.
   */
  const { index, closing, happening } = useMemo(() => {
    if (!events || events.length === 0) {
      return { index: [] as EventDTO[], closing: [] as EventDTO[], happening: [] as EventDTO[] };
    }
    const deadlineOf = (e: EventDTO) =>
      e.endDate ? new Date(e.endDate).getTime() : new Date(e.date).getTime();
    const isEndDated = (e: EventDTO) => e.deadlineKind === "event-end";
    const bySoonest = (a: EventDTO, b: EventDTO) => deadlineOf(a) - deadlineOf(b);

    const closable = events.filter((e) => !isEndDated(e)).sort(bySoonest);
    const endDated = events.filter(isEndDated).sort(bySoonest);

    return {
      closing: closable,
      happening: endDated,
      // Full roster minus what the axis already shows.
      index: [...closable.slice(1), ...endDated].sort(bySoonest),
    };
  }, [events]);

  // Only genuine closings. An event that merely ends soon is not closing.
  const closingSoon = useMemo(
    () =>
      closing.filter((e) => {
        const d = e.endDate ? new Date(e.endDate).getTime() : new Date(e.date).getTime();
        return d - now < 7 * 86400000;
      }).length,
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

  // The nameplate's Discover link fires this when already on the front page.
  // A same-URL navigation remounts nothing, so without this the button would
  // visibly do nothing; instead it clears every filter and refetches.
  useEffect(() => {
    const onReset = () => reset();
    window.addEventListener(DISCOVER_RESET_EVENT, onReset);
    return () => window.removeEventListener(DISCOVER_RESET_EVENT, onReset);
    // reset is stable-by-construction (setState calls only), and onCity comes
    // from HomeClient's useState — re-subscribing on either is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCity]);

  return (
    <section className="pb-24">
      {/* The spatial time axis — the organising structure of the page. */}
      {closing.length > 0 && (
        <div className="mt-12">
          <TimeAxis events={closing} now={nowIso} />
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
              ? stalled
                ? "timed out"
                : "loading"
              : `${count} ${count === 1 ? "event" : "events"}`}
            {closingSoon > 0 ? ` · ${closingSoon} closing soon` : ""}
          </span>
        </div>
      </div>

      {error && <p className="mt-10 text-sm text-critical">{error}</p>}

      {/* A stalled request gets a dead end and a way out, not a longer shimmer. */}
      {stalled && events === null && (
        <div className="mt-12 border-y border-line py-20 text-center">
          <p className="text-[15px] text-ink">This is taking too long.</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
            The event index did not respond. It may be a slow connection on your side rather
            than a fault here.
          </p>
          <button
            onClick={() => void fetchEvents()}
            className="mt-5 rounded-[2px] bg-gradient-to-r from-primary to-primary-2 px-4 py-2 text-[13px] font-semibold text-bg transition-all duration-200 hover:brightness-105"
          >
            Try again
          </button>
        </div>
      )}

      {events === null && !stalled && (
        <div className="mt-12 space-y-4">
          {slow && (
            <p className="text-[13px] text-faint">Still loading — this is slower than usual.</p>
          )}
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

      {/* Happening soon.
          Events whose platform publishes no registration deadline. The only
          date available is the event's end date, so they are kept off the
          closing axis entirely and labelled for what they actually are rather
          than being shown as a deadline they do not have. */}
      {happening.length > 0 && (
        <section className="mt-24">
          <h2 className="font-serif text-[26px] leading-none tracking-tight text-ink">
            Happening soon
          </h2>
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-muted">
            These platforms do not publish a registration deadline, so the date shown is
            when the event <em className="not-italic text-ink">ends</em> — not when it
            closes. They are deliberately kept off the axis above.
          </p>
          <div className="mt-4">
            {happening.map((event, i) => (
              <IndexRow key={event.id} event={event} index={i + 1} />
            ))}
            <div className="border-t border-line" />
          </div>
        </section>
      )}

      {/* The index - the detail view for readers who want the full roster. */}
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
  // Wraps rather than forcing one 498px line, which was the other half of the
  // page's sideways scroll on a phone. Above 640px the row has room, so
  // wrapping never engages on desktop.
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
