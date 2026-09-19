"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventDTO } from "@/lib/events";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants";
import { EventCard } from "./EventCard";
import { SkeletonCard } from "./SkeletonCard";

export const TIMEFRAMES = [
  { id: "all", label: "Anytime" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
] as const;

const TYPE_OPTIONS: { id: string; label: string }[] = [
  { id: "all", label: "All types" },
  ...EVENT_TYPES.map((t) => ({ id: t, label: EVENT_TYPE_LABELS[t] ?? t })),
];

const MODES = [
  { id: "all", label: "All events" },
  { id: "online", label: "Online" },
  { id: "offline", label: "Offline" },
];

const QUICK_CITIES = ["Bangalore", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"];

export function EventExplorer({ city }: { city: string }) {
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
    if (type !== "all") params.set("type", type);
    if (mode !== "all") params.set("mode", mode);
    if (timeframe !== "all") params.set("timeframe", timeframe);
    if (beginner) params.set("beginner", "true");
    if (debouncedQ) params.set("q", debouncedQ);
    try {
      const res = await fetch(`/api/events?${params.toString()}`, { signal: controller.signal, cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setEvents(data.events as EventDTO[]);
      setCount(data.count as number);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setEvents(null);
        setError("We couldn't load events. Please try again.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [type, mode, timeframe, beginner, debouncedQ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchEvents();
    return () => abortRef.current?.abort();
  }, [fetchEvents]);

  return (
    <section>
      {/* Filters - glass */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-surface/80 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                type === t.id
                  ? "bg-gradient-to-r from-primary to-purple-600 text-white shadow-[0_0_12px_rgba(124,92,255,0.4)]"
                  : "bg-white/5 text-muted hover:bg-white/10 hover:text-white border border-white/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/5 pt-3">
          <PillGroup label="Format" options={MODES} value={mode} onChange={setMode} />
          <PillGroup label="When" options={TIMEFRAMES as readonly { id: string; label: string }[]} value={timeframe} onChange={setTimeframe as (v: string) => void} />
          <label className="inline-flex items-center gap-2 text-sm font-medium text-muted">
            <input type="checkbox" checked={beginner} onChange={(e) => setBeginner(e.target.checked)} className="h-4 w-4 rounded accent-primary bg-ink border-white/10" />
            Beginner-friendly
          </label>
          <div className="ml-auto w-full max-w-xs">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search sprints, bounties..."
              className="w-full rounded-xl border border-white/10 bg-ink/70 px-3.5 py-2 text-sm text-white placeholder:text-muted outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Quick cities */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-faint">Near:</span>
        {QUICK_CITIES.map((c) => (
          <a
            key={c}
            href={`/?city=${encodeURIComponent(c)}`}
            className={`rounded-full px-3 py-1 text-sm font-medium transition border ${
              city === c ? "bg-primary text-white border-primary shadow-[0_0_10px_rgba(124,92,255,0.3)]" : "border-white/10 bg-white/5 text-muted hover:bg-white/10 hover:text-white"
            }`}
          >
            {c}
          </a>
        ))}
      </div>

      {/* Pulse ticker */}
      <div className="mb-6 flex items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-ink/60 px-4 py-2.5 backdrop-blur">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
          <span className="h-2 w-2 animate-pulse rounded-full bg-secondary" /> Pulse
        </span>
        <span className="h-4 w-px bg-white/10" />
        <span className="truncate text-xs text-muted">Team SolanaSurge seeking Rust dev in Bengaluru • ₹5L bounty added to GenAI Pune • Live now</span>
      </div>

      {/* Results */}
      {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-8 text-center text-sm font-medium text-red-300">{error}</div>}

      {!error && loading && events === null && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {!error && events !== null && events.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/15 bg-card/40 p-12 text-center backdrop-blur">
          <p className="text-3xl">🔍</p>
          <p className="mt-3 text-sm font-medium text-white">No events match those filters yet.</p>
          <p className="mt-1 text-sm text-muted">Try clearing a filter or checking back soon.</p>
        </div>
      )}

      {!error && events !== null && events.length > 0 && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-muted">
              <span className="text-white">{count}</span> event{count === 1 ? "" : "s"} found
            </p>
            <span className="text-xs text-faint">India Tech Hub Radar • Midnight Neon</span>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event, i) => (
              <EventCard key={event.id} event={event} index={i} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function PillGroup({ label, options, value, onChange }: { label: string; options: readonly { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-faint">{label}</span>
      <div className="flex rounded-lg bg-ink p-0.5 border border-white/5">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition ${value === opt.id ? "bg-white text-midnight shadow-sm" : "text-muted hover:text-white"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
