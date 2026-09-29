"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function AdminLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const next = params.get("next");
        // Only same-origin paths, so ?next= cannot be used as an open redirect.
        router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin");
        router.refresh();
        return;
      }

      if (res.status === 429) {
        setError("Too many attempts. Wait a few minutes and try again.");
      } else if (res.status === 503) {
        setError("Admin access is not configured on this deployment.");
      } else {
        setError("Incorrect password.");
      }
      setPassword("");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16 sm:px-10">
      <p className="text-[11px] uppercase tracking-[0.18em] text-faint">Restricted</p>
      <h1 className="mt-4 font-serif text-[clamp(2.2rem,6vw,3rem)] font-normal leading-[0.98] tracking-[-0.02em] text-ink">
        Moderation <em>access</em>
      </h1>
      <p className="mt-4 text-[14px] leading-relaxed text-muted">
        This area is limited to reviewers. Enter the admin password to continue.
      </p>

      <form onSubmit={submit} className="mt-10">
        <label className="block">
          <span className="mb-2 block text-[11px] uppercase tracking-[0.12em] text-faint">
            Password
          </span>
          <input
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-[2px] border border-line bg-raised/40 px-3 py-2.5 text-[14px] text-ink transition-colors focus:border-primary focus:outline-none"
          />
        </label>

        {error && (
          <p className="mt-4 border-y border-line py-3 text-[13px] text-critical">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="glow-primary mt-6 w-full rounded-[2px] bg-gradient-to-r from-primary to-primary-2 px-4 py-2.5 text-sm font-semibold text-bg transition-all duration-200 hover:brightness-105 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-[12px] leading-relaxed text-faint">
        Sessions last 8 hours. Repeated failures lock this address for 15 minutes.
      </p>
    </div>
  );
}
