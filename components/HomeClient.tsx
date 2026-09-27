"use client";

import { useState } from "react";
import { EventExplorer } from "./EventExplorer";

/**
 * The front page opener.
 *
 * There is deliberately no masthead here. The nameplate in the root layout is
 * the masthead; repeating it below a sticky bar was what made the site read as
 * a template. What is left is the dispatch line and the headline, which is the
 * single largest piece of type on the site.
 */
export function HomeClient({ now }: { now: string }) {
  const [city, setCity] = useState("");

  return (
    <div className="mx-auto max-w-6xl px-6 sm:px-10">
      <p className="pt-10 text-[11px] uppercase tracking-[0.18em] text-faint">
        A dated index of hackathons, conferences and engineering gatherings
      </p>

      {/* Headline. The dot grid is a print texture, masked so it never
          resolves into a visible pattern. */}
      <div className="relative mt-8">
        <div
          aria-hidden
          className="dot-grid pointer-events-none absolute -inset-x-8 -inset-y-6 opacity-70 [mask-image:radial-gradient(120%_100%_at_20%_0%,#000,transparent_72%)]"
        />
        <h1 className="relative font-serif text-[clamp(3rem,9vw,5.5rem)] font-normal leading-[0.95] tracking-[-0.02em] text-ink">
          This week in
          <br />
          <em>builders</em>
          <span className="text-closing">.</span>
        </h1>
      </div>

      <div className="mt-12 border-t border-line" />

      <EventExplorer city={city} onCity={setCity} now={now} />
    </div>
  );
}
