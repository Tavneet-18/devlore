"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventDTO } from "@/lib/events";
import { DISCOVER_RESET_EVENT, EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants";
import { IndexRow } from "./IndexRow";
import { EventQuickLook } from "./EventQuickLook";
import { TimeAxis } from "./TimeAxis";
import { TimeAxisMobile } from "./TimeAxisMobile";
import { SkeletonCard } from "./SkeletonCard";
import { isActionable } from "@/lib/event-dates";

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
  /** The event whose quick-look is open, or null. */
  const [quickLook, setQuickLook] = useState<EventDTO | null>(null);
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
   * Unknown deadlines stay off the closing axis; known registration and
   * submission deadlines use their own labels.
   */
  const { index, closing, happening } = useMemo(() => {
    if (!events || events.length === 0) {
      return { index: [] as EventDTO[], closing: [] as EventDTO[], happening: [] as EventDTO[] };
    }
    const deadlineOf = (e: EventDTO) =>
      e.endDate ? new Date(e.endDate).getTime() : new Date(e.date).getTime();
    const isEndDated = (e: EventDTO) => e.deadlineKind !== "registration" && e.deadlineKind !== "submission";
    const bySoonest = (a: EventDTO, b: EventDTO) => deadlineOf(a) - deadlineOf(b);

    const active = events.filter((e) => isActionable(e, now));
    const closable = active.filter((e) => !isEndDated(e)).sort(bySoonest);
    const endDated = active.filter(isEndDated).sort(bySoonest);

    return {
      closing: closable,
      happening: endDated,
      // Full roster, including events highlighted on the axis.
      index: [...closable, ...endDated].sort(bySoonest),
    };
  }, [events, now]);

  // Only genuine closings. An event that merely ends soon is not closing.
  const closingSoon = useMemo(
    () =>
      closing.filter((e) => {
        const d = e.endDate ? new Date(e.endDate).getTime() : new Date(e.date).getTime();
        return d > now && d - now < 7 * 86400000;
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
          {/* Both axes render server-side and only CSS decides which one shows,
              so there is no hydration mismatch and the desktop layout is never
              reflowed to accommodate the phone one. `display: none` also keeps
              the hidden one out of the accessibility tree, so a screen reader
              is not offered the same events twice. */}
          <div className="hidden md:block">
            <TimeAxis events={closing} now={nowIso} />
          </div>
          <div className="md:hidden">
            <TimeAxisMobile events={closing} now={nowIso} />
          </div>
        </div>
      )}

      {/* Filters — quiet index-style controls.
          `coarse:gap-8` widens the gap between the filter row and the city
          row on touch. Their 44px hit areas were overlapping by 7px: centres
          37.5px apart cannot hold two 44px boxes side by side. */}
      <div className="mt-10 flex flex-col gap-4 border-b border-line pb-5 coarse:gap-8">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 coarse:gap-y-6">
          <div className="relative tap-target">
            <svg
              aria-hidden
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
            {/* aria-label, not a <label>. A placeholder is not an accessible
                name: it disappears on first keystroke and is skipped by some
                screen readers entirely, which left this input announced only as
                "edit text". Visually hidden, so nothing about the layout or the
                design changes. */}
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              aria-label="Search events by title, city or tag"
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

          <label className="tap-target flex items-center gap-2 text-[13px] text-muted">
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
            type="button"
            onClick={() => onCity("")}
            aria-pressed={!city}
            className={`tap-target rounded px-2 py-0.5 transition-colors ${
              !city ? "text-ink" : "text-faint hover:text-muted"
            }`}
          >
            All cities
          </button>
          {CITIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onCity(c)}
              // Same reason as the type/mode chips: the active city was
              // distinguishable only by the shade of its text.
              aria-pressed={city === c}
              className={`tap-target rounded px-2 py-0.5 transition-colors ${
                city === c ? "text-ink" : "text-faint hover:text-muted"
              }`}
            >
              {c}
            </button>
          ))}
          {/* The result count and the load/error state are announced, because a
              reader who filters by voice or keyboard gets no other signal that
              anything happened. `polite` rather than `assertive`: this updates on
              every keystroke of the search box and interrupting each time would
              make the field unusable. */}
          <span className="ml-auto text-[13px] text-faint" role="status" aria-live="polite">
            {loading && events === null
              ? stalled
                ? "timed out"
                : "loading"
              : `${count} ${count === 1 ? "event" : "events"}`}
            {closingSoon > 0 ? ` · ${closingSoon} closing soon` : ""}
          </span>
        </div>
      </div>

      {/* role="alert" so a failed load is announced rather than appearing silently.
          A reader who cannot see the red text has no other way of knowing the
          page is not showing events. */}
      {error && (
        <p className="mt-10 text-sm text-critical" role="alert">
          {error}
        </p>
      )}

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
              <IndexRow key={event.id} event={event} index={i + 1} onQuickLook={setQuickLook} />
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
              <IndexRow key={event.id} event={event} index={i + 1} onQuickLook={setQuickLook} />
            ))}
            <div className="border-t border-line" />
          </div>
        </section>
      )}

      {/* Rendered once, outside the list, and driven by which event is set. One
          <dialog> holding one event means opening a second quick-look never has
          to re-create the element or move focus between two of them. */}
      <EventQuickLook event={quickLook} onClose={() => setQuickLook(null)} />
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
  //
  // `coarse:gap-y-6` matters: the 44px hit areas on these 23px-tall buttons
  // would otherwise overlap between wrapped rows, and the lower half of a tap
  // meant for one chip would land on the row above. A 24px row gap puts the
  // pitch at 47px, clear of the 44px target.
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 coarse:gap-y-6">
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            // The selected filter was previously distinguishable only by colour
            // — text-ink against text-faint. Colour alone is not an accessible
            // state, so this was invisible to anyone who cannot separate those
            // two greys. aria-pressed is what carries it now; the styling is
            // unchanged so the design reads exactly as before for everyone.
            aria-pressed={selected}
            className={`tap-target border-b pb-0.5 text-[13px] transition-colors ${
              selected ? "border-primary text-ink" : "border-transparent text-faint hover:text-muted"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
