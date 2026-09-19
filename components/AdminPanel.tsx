"use client";

import { useCallback, useEffect, useState } from "react";
import type { EventDTO } from "@/lib/events";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants";
import { formatDay } from "@/lib/format";

const TABS = [
  { id: "all", label: "All" },
  { id: "PENDING", label: "Pending" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
] as const;

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  APPROVED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  REJECTED: "bg-red-500/15 text-red-300 border-red-500/20",
};

export function AdminPanel() {
  const [tab, setTab] = useState<string>("all");
  const [events, setEvents] = useState<EventDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);

  const fetchEvents = useCallback(async (status: string) => {
    setLoading(true);
    setEvents(null);
    try {
      const res = await fetch(
        `/api/admin/events${status !== "all" ? `?status=${status}` : ""}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      setEvents(data.events);
    } catch {
      setEvents([]);
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
    fetchEvents(tab);
  }

  async function remove(id: string) {
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (editing === id) setEditing(null);
    fetchEvents(tab);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-secondary animate-pulse" />
        <span className="text-xs font-bold uppercase tracking-widest text-secondary">Moderation Queue</span>
      </div>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Event Moderation Hub</h1>
      <p className="mt-2 text-sm text-muted">Approve, reject or edit organizer-submitted events before they go live. Escrow-verified.</p>

      <div className="mt-6 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition border ${
              tab === t.id ? "bg-primary text-white border-primary shadow-[0_0_12px_rgba(124,92,255,0.3)]" : "bg-card text-muted border-white/10 hover:bg-white/5 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {loading && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
        {!loading && events?.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/15 bg-card/40 p-10 text-center text-sm text-muted backdrop-blur">Nothing here.</p>
        )}
        {!loading &&
          events?.map((event) =>
            editing === event.id ? (
              <EditRow
                key={event.id}
                event={event}
                onDone={(changed) => {
                  setEditing(null);
                  if (changed) fetchEvents(tab);
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
    <li className="list-none rounded-2xl border border-white/10 bg-card/70 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-white">{event.title}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[event.status] ?? STATUS_STYLE.PENDING}`}>
              {event.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {EVENT_TYPE_LABELS[event.eventType as keyof typeof EVENT_TYPE_LABELS] ?? event.eventType} · {formatDay(event.date)} ·{" "}
            {event.isOnline ? "Online" : event.city ?? "TBA"} · by {event.organizer} · via {event.source}
          </p>
          {event.summary && <p className="mt-2 line-clamp-2 text-sm italic text-muted">✨ {event.summary}</p>}
          {event.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {event.tags.map((t) => (
                <span key={t} className="rounded bg-white/5 border border-white/5 px-1.5 py-0.5 text-[11px] text-muted">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button onClick={onApprove} className="rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700">
            Approve
          </button>
          <button onClick={onReject} className="rounded-full bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700">
            Reject
          </button>
          <button onClick={onEdit} className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
            Edit
          </button>
          <button
            onClick={onDelete}
            className="rounded-full border border-red-200 px-3.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

function EditRow({
  event,
  onDone,
}: {
  event: EventDTO;
  onDone: (changed: boolean) => void;
}) {
  const [form, setForm] = useState({
    title: event.title,
    summary: event.summary ?? "",
    description: event.description ?? "",
    city: event.city ?? "",
    organizer: event.organizer,
    link: event.link ?? "",
    eventType: event.eventType,
    date: isoLocal(event.date),
    isOnline: event.isOnline,
    beginnerFriendly: event.beginnerFriendly,
    status: event.status,
  });
  const [saving, setSaving] = useState(false);

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
    <li className="list-none rounded-2xl border border-brand-200 bg-brand-50/30 p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Labeled label="Title">
          <input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Labeled>
        <Labeled label="Organizer">
          <input className={input} value={form.organizer} onChange={(e) => setForm({ ...form, organizer: e.target.value })} />
        </Labeled>
        <Labeled label="City" className="sm:col-span-2">
          <input className={input} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </Labeled>
        <Labeled label="Date">
          <input
            type="datetime-local"
            className={input}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </Labeled>
        <Labeled label="Type">
          <select className={input} value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Link" className="sm:col-span-2">
          <input className={input} value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
        </Labeled>
        <Labeled label="Summary" className="sm:col-span-2">
          <textarea rows={2} className={input} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </Labeled>
        <Labeled label="Description" className="sm:col-span-2">
          <textarea rows={3} className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Labeled>
        <Labeled label="Status">
          <select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </Labeled>
        <div className="flex items-end gap-4 pb-1">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.isOnline} onChange={(e) => setForm({ ...form, isOnline: e.target.checked })} />
            Online
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.beginnerFriendly} onChange={(e) => setForm({ ...form, beginnerFriendly: e.target.checked })} />
            Beginner-friendly
          </label>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={save} disabled={saving} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button onClick={() => onDone(false)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white">
          Cancel
        </button>
      </div>
    </li>
  );
}

function Labeled({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-300";

function isoLocal(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}