"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventDTO } from "@/lib/events";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants";
import { formatDateRange } from "@/lib/format";

const TABS = [
  { id: "all", label: "All" },
  { id: "PENDING", label: "Pending" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
] as const;

const STATUS_TEXT: Record<string, string> = {
  PENDING: "text-caution",
  APPROVED: "text-positive",
  REJECTED: "text-critical",
};

export function AdminPanel() {
  const [tab, setTab] = useState<string>("all");
  const [events, setEvents] = useState<EventDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const bypassed = true; // Auth is fully removed — always true

  const fetchEvents = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/events${status !== "all" ? `?status=${status}` : ""}`,
        { cache: "no-store" }
      );
      // A failed moderation fetch must not look like an empty queue. Setting []
      // on error meant a 500 rendered as "Nothing here." — on the one screen
      // whose entire purpose is deciding what to review, "I could not reach the
      // list" and "there is nothing to review" are opposites, and only one of
      // them is safe to act on.
      if (!res.ok) {
        setError(`Could not load the queue (HTTP ${res.status}). Nothing has been reviewed.`);
        setEvents(null);
        return;
      }
      const data = await res.json();
      setError(null);
      setEvents(data.events ?? []);
    } catch (err) {
      setError(
        `Could not reach the moderation API: ${err instanceof Error ? err.message : "network error"}`
      );
      setEvents(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchEvents(tab);
  }, [tab, fetchEvents]);

  async function moderate(id: string, status: string) {
    await fetch(`/api/events/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    void fetchEvents(tab);
  }

  async function remove(id: string) {
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (editing === id) setEditing(null);
    void fetchEvents(tab);
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:px-10">
      <header className="mb-8 border-b border-line pb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-faint">Staff</p>
        <h1 className="mt-4 font-serif text-[clamp(2rem,5vw,2.8rem)] font-normal leading-[0.98] tracking-[-0.02em] text-ink">
          <em>Moderation</em>
        </h1>
        <p className="mt-4 text-[14px] text-muted">
          Review submissions before they appear in the index.
        </p>
      </header>

      {bypassed && (
        <p className="mb-8 border-y border-closing/40 py-3 text-[13px] text-closing">
          <strong>No authentication.</strong> Anyone with this URL can moderate, edit
          and delete events. Before launching publicly, re-add the session gate in
          <code className="text-ink"> middleware.ts</code>.
        </p>
      )}

      <div className="mb-2 flex flex-wrap gap-5 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 pb-3 text-[11px] uppercase tracking-[0.12em] transition-colors ${
              tab === t.id
                ? "border-primary text-ink"
                : "border-transparent text-faint hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="py-16 text-center text-[13px] text-faint">Loading…</p>}

      {error && (
        <div className="border-y border-critical/40 py-6">
          <p className="text-[14px] text-critical">{error}</p>
          <button
            type="button"
            onClick={() => void fetchEvents(tab)}
            className="mt-4 text-[13px] font-semibold text-primary transition-colors hover:text-[#9b8fff]"
          >
            Try again →
          </button>
        </div>
      )}

      {!loading && !error && events?.length === 0 && (
        <p className="border-b border-line py-20 text-center text-[14px] text-muted">
          Nothing here.
        </p>
      )}

      <div>
        {events?.map((event) =>
          editing === event.id ? (
            <EditRow
              key={event.id}
              event={event}
              onDone={(changed) => {
                setEditing(null);
                if (changed) void fetchEvents(tab);
              }}
            />
          ) : (
            <Row
              key={event.id}
              event={event}
              onApprove={() => moderate(event.id, "APPROVED")}
              onReject={() => moderate(event.id, "REJECTED")}
              onEdit={() => setEditing(event.id)}
              onDelete={() => remove(event.id)}
            />
          )
        )}
      </div>
    </div>
  );
}

function Row({
  event,
  onApprove,
  onReject,
  onEdit,
  onDelete,
}: {
  event: EventDTO;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="border-b border-line py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-serif text-[20px] font-normal leading-snug text-ink">
              {event.title}
            </h3>
            <span
              className={`text-[11px] uppercase tracking-[0.12em] ${
                STATUS_TEXT[event.status] ?? "text-faint"
              }`}
            >
              {event.status}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-faint">
            {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType} ·{" "}
            {formatDateRange(event.date, event.endDate)} ·{" "}
            {event.isOnline ? "Online" : event.city ?? "TBA"} · {event.organizer}
          </p>
          {event.summary && (
            <p className="mt-2 line-clamp-2 text-[13px] text-muted">{event.summary}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <Action onClick={onApprove}>Approve</Action>
          <Action onClick={onReject}>Reject</Action>
          <Action onClick={onEdit}>Edit</Action>
          <Action onClick={onDelete} danger>
            Delete
          </Action>
        </div>
      </div>
    </div>
  );
}

function Action({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[2px] border border-line bg-raised/40 px-2.5 py-1 text-[13px] transition-colors hover:border-line-hi ${
        danger ? "text-critical" : "text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function EditRow({ event, onDone }: { event: EventDTO; onDone: (changed: boolean) => void }) {
  const [form, setForm] = useState({
    title: event.title,
    summary: event.summary ?? "",
    description: event.description ?? "",
    city: event.city ?? "",
    organizer: event.organizer,
    link: event.link ?? "",
    eventType: event.eventType,
    date: toLocalInput(event.date),
    isOnline: event.isOnline,
    beginnerFriendly: event.beginnerFriendly,
    status: event.status,
  });
  const [saving, setSaving] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  // Opening this form unmounts the button that opened it, so focus fell to
  // <body> and a keyboard user had to Tab the length of the queue to find the
  // form they had just opened. Moving focus into the first field is the
  // difference between the form being usable and unusable without a mouse.
  useEffect(() => {
    first.current?.focus();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          date: form.date ? new Date(form.date).toISOString() : undefined,
        }),
      });
      onDone(res.ok);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-b border-line py-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Labeled label="Title" wide>
          <input
            ref={first}
            className={input}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Labeled>
        <Labeled label="Organiser">
          <input
            className={input}
            value={form.organizer}
            onChange={(e) => setForm({ ...form, organizer: e.target.value })}
          />
        </Labeled>
        <Labeled label="City">
          <input
            className={input}
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </Labeled>
        <Labeled label="Starts">
          <input
            type="datetime-local"
            className={input}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </Labeled>
        <Labeled label="Type">
          <select
            className={input}
            value={form.eventType}
            onChange={(e) => setForm({ ...form, eventType: e.target.value })}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t} className="bg-surface">
                {EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Status">
          <select
            className={input}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option value="PENDING" className="bg-surface">
              Pending
            </option>
            <option value="APPROVED" className="bg-surface">
              Approved
            </option>
            <option value="REJECTED" className="bg-surface">
              Rejected
            </option>
          </select>
        </Labeled>
        <Labeled label="Link" wide>
          <input
            className={input}
            value={form.link}
            onChange={(e) => setForm({ ...form, link: e.target.value })}
          />
        </Labeled>
        <Labeled label="Summary" wide>
          <textarea
            rows={2}
            className={input}
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </Labeled>
        <Labeled label="Description" wide>
          <textarea
            rows={3}
            className={input}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Labeled>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={form.isOnline}
            onChange={(e) => setForm({ ...form, isOnline: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-line accent-primary"
          />
          Online
        </label>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={form.beginnerFriendly}
            onChange={(e) => setForm({ ...form, beginnerFriendly: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-line accent-primary"
          />
          Beginner friendly
        </label>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="glow-primary rounded-[2px] bg-gradient-to-r from-primary to-primary-2 px-3.5 py-1.5 text-[13px] font-semibold text-bg transition-all duration-200 hover:brightness-105 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          onClick={() => onDone(false)}
          className="rounded-[2px] border border-line bg-raised/40 px-3.5 py-1.5 text-[13px] text-muted transition-colors hover:border-line-hi"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Labeled({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-2 block text-[11px] uppercase tracking-[0.12em] text-faint">{label}</span>
      {children}
    </label>
  );
}

const input =
  "w-full rounded-[2px] border border-line bg-raised/40 px-3 py-2 text-[14px] text-ink transition-colors focus:border-primary focus:outline-none";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
