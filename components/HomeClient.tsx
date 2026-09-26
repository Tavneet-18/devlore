"use client";

import { useState } from "react";
import { EventExplorer } from "./EventExplorer";

export function HomeClient({
  now,
  issue,
  dateLine,
}: {
  now: string;
  issue: number;
  dateLine: string;
}) {
  const [city, setCity] = useState("");

  return (
    <div className="mx-auto max-w-6xl px-6 sm:px-10">
      {/* Dispatch line */}
      <p className="pt-8 text-[11px] text-faint">
        Tracking hackathons, conferences and engineering gatherings. Updated daily.
      </p>

      {/* Masthead */}
      <div className="mt-4 flex items-center justify-between gap-4 border-y border-line py-4">
        <span className="text-gradient-soft text-[20px] font-semibold tracking-tight">
          Devlore
        </span>
        <span className="text-[12px] uppercase tracking-[0.22em] text-faint">{dateLine}</span>
        <span className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-faint">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
          Issue {issue}
        </span>
      </div>

      {/* Front page title */}
      <h1 className="mt-14 max-w-3xl text-[52px] font-bold leading-[1.0] tracking-tight text-ink sm:text-[64px]">
        This week in
        <br />
        <span className="text-gradient">builders</span>.
      </h1>

      <EventExplorer city={city} onCity={setCity} now={now} />
    </div>
  );
}
