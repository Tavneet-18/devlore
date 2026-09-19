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
      if (!res.ok) throw new Error(data.error);
      const e = data.enhancement as { summary: string; tags: string[]; isOnline: boolean; beginnerFriendly: boolean };
      setAiSummary(e.summary);
      setAiTags(e.tags);
      set("isOnline", e.isOnline);
      set("beginnerFriendly", e.beginnerFriendly);
      setOutcome({ ok: true, message: "AI preview generated — click Submit below to publish." });
    } catch (err) {
      setOutcome({ ok: false, message: (err as Error).message });
    } finally {
      setEnhancing(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setOutcome(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      setOutcome({ ok: true, message: "Your event was submitted and is awaiting moderation." });
      setForm({ ...BLANK, isOnline: false, beginnerFriendly: false });
      setAiSummary(null);
      setAiTags([]);
    } catch (err) {
      setOutcome({ ok: false, message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-tertiary backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-tertiary animate-pulse" /> Moderated Discovery Pipeline
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Broadcast your next <span className="bg-gradient-to-r from-primary via-tertiary to-cyanGlow bg-clip-text text-transparent">sprint to 42,000+ builders</span>
        </h1>
        <p className="mt-2 text-sm text-muted">Events appear publicly after moderator approves them within 2 hours.</p>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 gap-6 sm:grid-cols-2 rounded-2xl border border-white/10 bg-card/70 p-6 sm:p-8 backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.4)] relative overflow-hidden">
        <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/10 blur-[80px]" />
        <Field label="Event Title" hint="Primary identifier" className="sm:col-span-2">
          <input required value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Autonomous Agent Conclave & 48h Sprint" className={inputCls} />
        </Field>

        <Field label="Event type" hint="Category">
          <select value={form.eventType} onChange={(e) => set("eventType", e.target.value)} className={inputCls}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t} className="bg-ink">
                {EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="City" hint="Leave blank if online">
          <input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Bengaluru, Indiranagar" className={inputCls} />
        </Field>

        <Field label="Date & Time" hint="When does it start?" className="sm:col-span-2">
          <input type="datetime-local" required value={form.date} onChange={(e) => set("date", new Date(e.target.value).toISOString())} className={inputCls} />
        </Field>

        <Field label="Organizer" hint="Your name / org">
          <input required value={form.organizer} onChange={(e) => set("organizer", e.target.value)} placeholder="e.g. LangChain India × PeakXV" className={inputCls} />
        </Field>

        <Field label="Registration link" hint="Where to register" className="sm:col-span-2">
          <input type="url" value={form.link} onChange={(e) => set("link", e.target.value)} placeholder="https://lu.ma/..." className={inputCls} />
        </Field>

        <Field label="Description" hint="Tracks, prize pool, perks, timeline" className="sm:col-span-2">
          <textarea required rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="A high-stakes 48h sprint in Indiranagar, Bengaluru bringing together top AI researchers..." className={`${inputCls} resize-none`} />
          <span className="mt-1 text-xs text-faint">{form.description.length} / 2000</span>
        </Field>

        <div className="flex flex-wrap gap-6 sm:col-span-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-muted">
            <input type="checkbox" checked={form.isOnline} onChange={(e) => set("isOnline", e.target.checked)} className="h-4 w-4 accent-primary" />
            Online / Remote allowed
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-muted">
            <input type="checkbox" checked={form.beginnerFriendly} onChange={(e) => set("beginnerFriendly", e.target.checked)} className="h-4 w-4 accent-primary" />
            Beginner-friendly
          </label>
        </div>

        <div className="sm:col-span-2 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-transparent to-tertiary/10 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
              <SparkIcon /> Devlore AI Copilot
            </span>
            <button
              type="button"
              onClick={enhance}
              disabled={enhancing || (!form.title && !form.description)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-tertiary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_16px_rgba(124,92,255,0.3)] disabled:opacity-40"
            >
              {enhancing ? "Enhancing…" : "Enhance with AI"}
            </button>
          </div>
          {aiSummary && (
            <div className="mt-3 space-y-2">
              <p className="rounded-lg border border-white/5 bg-ink/60 p-3 text-sm italic leading-relaxed text-muted">✨ {aiSummary}</p>
              <div className="flex flex-wrap gap-1.5">
                {aiTags.map((t) => (
                  <span key={t} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-muted border border-white/5">
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {outcome && (
          <p className={`sm:col-span-2 rounded-xl px-4 py-3 text-sm font-medium border ${outcome.ok ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-red-500/10 text-red-300 border-red-500/20"}`}>
            {outcome.message}
          </p>
        )}

        <div className="sm:col-span-2">
          <button type="submit" disabled={submitting} className="w-full rounded-xl bg-gradient-to-r from-primary to-purple-600 py-3.5 text-sm font-bold uppercase tracking-wider text-white shadow-[0_0_24px_rgba(124,92,255,0.4)] transition hover:opacity-90 disabled:opacity-50">
            {submitting ? "Submitting…" : "Submit Your Event →"}
          </button>
          <p className="mt-3 text-center text-xs text-faint">By submitting, you pledge adherence to Devlore Hacker Ethics.</p>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, className = "", children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-semibold text-white">{label}</span>
      {hint && <span className="mb-2 block text-xs text-faint">{hint}</span>}
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-white/10 bg-ink/70 px-4 py-2.5 text-sm text-white placeholder:text-muted outline-none transition focus:border-primary focus:ring-1 focus:ring-primary";

function SparkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" strokeLinejoin="round" />
    </svg>
  );
}
