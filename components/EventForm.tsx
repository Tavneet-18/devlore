"use client";

import { useState } from "react";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants";

type FormState = {
  title: string;
  description: string;
  date: string;
  eventType: string;
  city: string;
  organizer: string;
  link: string;
  isOnline: boolean;
  beginnerFriendly: boolean;
};

const BLANK: FormState = {
  title: "",
  description: "",
  date: "",
  eventType: "hackathon",
  city: "",
  organizer: "",
  link: "",
  isOnline: false,
  beginnerFriendly: false,
};

export function EventForm() {
  const [form, setForm] = useState<FormState>(BLANK);
  const [enhancing, setEnhancing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiTags, setAiTags] = useState<string[]>([]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function enhance() {
    setEnhancing(true);
    setOutcome(null);
    try {
      const res = await fetch("/api/ai/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, description: form.description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Enhancement failed");
      const e = data.enhancement as {
        summary: string;
        tags: string[];
        isOnline: boolean;
      };
      setAiSummary(e.summary);
      setAiTags(e.tags);
      setOutcome({ ok: true, message: "Draft summary generated. Review it, then submit." });
    } catch (err) {
      setOutcome({ ok: false, message: (err as Error).message });
    } finally {
      setEnhancing(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setOutcome(null);
    try {
      // Read the honeypot straight off the form. It is intentionally absent
      // from FormState so it can never be prefilled or validated client-side.
      const honeypotEl = e.currentTarget.elements.namedItem("website");
      const honeypot =
        honeypotEl instanceof HTMLInputElement ? honeypotEl.value : "";

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, website: honeypot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      setOutcome({ ok: true, message: "Submitted. A moderator will review it before it appears." });
      setForm(BLANK);
      setAiSummary(null);
      setAiTags([]);
    } catch (err) {
      setOutcome({ ok: false, message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {/*
        Honeypot. Hidden from people and from assistive tech, never validated
        client-side, and never rendered back. A bot that fills every field it
        discovers trips this; a real submitter cannot see it, so it stays empty.
        Kept off-screen rather than display:none, because some bots skip
        hidden inputs entirely.
      */}
      <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <Field label="Title" className="sm:col-span-2">
        <input
          required
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="e.g. Autonomous Agent Conclave"
          className={input}
        />
      </Field>

      <Field label="Event type">
        <select
          value={form.eventType}
          onChange={(e) => set("eventType", e.target.value)}
          className={input}
        >
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t} className="bg-surface">
              {EVENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="City" hint="Leave blank if online only">
        <input
          value={form.city}
          onChange={(e) => set("city", e.target.value)}
          placeholder="e.g. Bengaluru"
          className={input}
        />
      </Field>

      <Field label="Starts" className="sm:col-span-2">
        <input
          type="datetime-local"
          required
          value={form.date}
          onChange={(e) => set("date", e.target.value)}
          className={input}
        />
      </Field>

      <Field label="Organiser">
        <input
          required
          value={form.organizer}
          onChange={(e) => set("organizer", e.target.value)}
          placeholder="e.g. TechForge Collective"
          className={input}
        />
      </Field>

      <Field label="Registration link">
        <input
          type="url"
          value={form.link}
          onChange={(e) => set("link", e.target.value)}
          placeholder="https://"
          className={input}
        />
      </Field>

      <Field label="Description" className="sm:col-span-2">
        <textarea
          required
          rows={6}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="What happens, who it is for, and any deadlines."
          className={`${input} resize-y`}
        />
        <span className="mt-1 block text-[12px] text-faint">{form.description.length} / 2000</span>
      </Field>

      <div className="flex flex-wrap gap-6 sm:col-span-2">
        <Check
          label="Online / remote allowed"
          checked={form.isOnline}
          onChange={(v) => set("isOnline", v)}
        />
        <Check
          label="Beginner friendly"
          checked={form.beginnerFriendly}
          onChange={(v) => set("beginnerFriendly", v)}
        />
      </div>

      <div className="border-y border-line py-4 sm:col-span-2">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] text-muted">Generate a draft summary and tags</p>
          <button
            type="button"
            onClick={enhance}
            disabled={enhancing || (!form.title && !form.description)}
            className="tap-target rounded-[2px] border border-line bg-raised/40 px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-line-hi hover:bg-raised disabled:opacity-40"
          >
            {enhancing ? "Generating…" : "Generate"}
          </button>
        </div>
        {aiSummary && (
          <div className="mt-4 space-y-2">
            <p className="font-serif text-[17px] leading-relaxed text-ink">{aiSummary}</p>
            {aiTags.length > 0 && (
              <p className="text-[11px] uppercase tracking-[0.12em] text-faint">
                {aiTags.join(" · ")}
              </p>
            )}
          </div>
        )}
      </div>

      {outcome && (
        <p
          className={`border-y border-line px-1 py-3 text-[14px] sm:col-span-2 ${
            outcome.ok ? "text-positive" : "text-critical"
          }`}
        >
          {outcome.message}
        </p>
      )}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="glow-primary w-full rounded-[2px] bg-gradient-to-r from-primary to-primary-2 px-4 py-3 text-sm font-semibold text-bg transition-all duration-200 hover:brightness-105 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit for review"}
        </button>
        <p className="mt-3 text-center text-[12px] text-faint">
          Submissions are reviewed by a moderator before appearing publicly.
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`tap-target block ${className}`}>
      <span className="mb-2 block text-[11px] uppercase tracking-[0.12em] text-faint">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-faint">{hint}</span>}
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="tap-target flex items-center gap-2 text-[14px] text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-line accent-primary"
      />
      {label}
    </label>
  );
}

/**
 * Shared control styling.
 *
 * Deliberately NOT `tap-target`. The fields are 350x39 — five pixels short of
 * a thumb's 44px — but `input`, `select` and `textarea` are replaced elements
 * and browsers do not generate pseudo-elements on them, so the overlay would
 * never paint and the class would be a silent no-op. The hit area is carried
 * by the `Field` label instead, which wraps the control: a label is a normal
 * element, it renders its own ::after, and tapping anywhere on it focuses the
 * field, so the region it covers is genuinely the target rather than a
 * decorative box over one.
 */
const input =
  "w-full rounded-[2px] border border-line bg-raised/40 px-3 py-2 text-[14px] text-ink placeholder:text-faint transition-colors focus:border-primary focus:outline-none";
