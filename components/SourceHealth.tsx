"use client";

import { useEffect, useState } from "react";

type Run = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  errorSample: string | null;
};

type Source = { source: string; status: "ok" | "failing" | "empty"; latest: Run; runs: Run[] };

const STATUS_STYLE: Record<string, string> = {
  ok: "text-positive",
  failing: "text-critical",
  empty: "text-caution",
};

function when(iso: string): string {
  // Rendered in IST to match the rest of the admin surface.
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SourceHealth() {
  const [data, setData] = useState<{ available: boolean; message?: string; sources: Source[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/admin/ingest-runs", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData({ available: false, message: "Could not reach the server.", sources: [] }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="py-16 text-center text-[13px] text-faint">Loading source health…</p>;

  if (!data?.available) {
    return (
      <div className="mt-10 border-y border-line py-16 text-center">
        <p className="text-[15px] text-ink">Run history is not available yet.</p>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
          {data?.message ?? "Unknown error."}
        </p>
      </div>
    );
  }

  if (data.sources.length === 0) {
    return (
      <div className="mt-10 border-y border-line py-16 text-center">
        <p className="text-[15px] text-ink">No runs recorded yet.</p>
        <p className="mt-2 text-[13px] text-muted">
          Trigger the ingest once and this page will fill in.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <div className="border-b border-line pb-3 text-[11px] uppercase tracking-[0.12em] text-faint">
        <span className="inline-block w-32">Source</span>
        <span className="inline-block w-28">Status</span>
        <span className="inline-block w-40">Last run (IST)</span>
        <span className="inline-block w-20 text-right">Fetched</span>
        <span className="inline-block w-20 text-right">New</span>
        <span className="inline-block w-20 text-right">Updated</span>
        <span className="inline-block w-20 text-right">Skipped</span>
        <span className="inline-block w-16 text-right">Errors</span>
      </div>

      {data.sources.map((s) => (
        <div key={s.source}>
          <div className="border-b border-line py-4 text-[14px]">
            <span className="inline-block w-32 font-medium text-ink">{s.source}</span>
            <span className={`inline-block w-28 text-[13px] ${STATUS_STYLE[s.status]}`}>{s.status}</span>
            <span className="inline-block w-40 text-[13px] text-faint">{when(s.latest.startedAt)}</span>
            <span className="inline-block w-20 text-right text-[13px] text-ink">{s.latest.fetched}</span>
            <span className="inline-block w-20 text-right text-[13px] text-positive">{s.latest.created}</span>
            <span className="inline-block w-20 text-right text-[13px] text-ink">{s.latest.updated}</span>
            <span className="inline-block w-20 text-right text-[13px] text-faint">{s.latest.skipped}</span>
            <span className={`inline-block w-16 text-right text-[13px] ${s.latest.errors ? "text-critical" : "text-faint"}`}>
              {s.latest.errors}
            </span>
          </div>

          {s.latest.errorSample && (
            <p className="border-b border-line py-2 pl-32 text-[12px] text-critical">
              {s.latest.errorSample}
            </p>
          )}

          {/* Last 10 runs, most recent first. */}
          <details className="border-b border-line">
            <summary className="cursor-pointer py-2 pl-32 text-[12px] text-faint hover:text-muted">
              {s.runs.length} recent runs
            </summary>
            <div className="pb-3 pl-32">
              {s.runs.map((r) => (
                <p key={r.id} className="text-[12px] text-faint">
                  {when(r.startedAt)} — fetched {r.fetched}, new {r.created}, updated{" "}
                  {r.updated}, skipped {r.skipped}
                  {r.errors > 0 ? (
                    <span className="text-critical"> — {r.errors} errors</span>
                  ) : null}
                </p>
              ))}
            </div>
          </details>
        </div>
      ))}

      <p className="mt-5 text-[12px] text-faint">
        Times shown in Asia/Kolkata (IST). A source marked <span className="text-caution">empty</span>{" "}
        returned nothing but did not error; <span className="text-critical">failing</span> means it
        errored and fetched nothing.
      </p>
    </div>
  );
}
