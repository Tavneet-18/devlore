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
        A spatial index of hackathons, conferences and engineering gatherings
      </p>

      {/* Headline. The dot grid is a print texture, masked so it never
          resolves into a visible pattern.

          The bleed is `-inset-x-6`, not `-inset-x-8`. The container's gutter is
          `px-6`, so 24px of slack exists outside the content box at every
          width — bleeding 24px lands the texture exactly on the viewport edge,
          where a 32px bleed stuck 8px past it and widened the whole document.
          `body` already carries `overflow-x: hidden`, but that value
          propagates to the viewport, and iOS Safari does not honour the
          propagation reliably, so the phantom scroll is removed rather than
          clipped. */}
      <div className="relative mt-8">
        <div
          aria-hidden
          className="dot-grid pointer-events-none absolute -inset-x-6 -inset-y-6 opacity-70 [mask-image:radial-gradient(120%_100%_at_20%_0%,#000,transparent_72%)]"
        />
        <h1 className="relative font-serif text-[clamp(3rem,9vw,5.5rem)] font-normal leading-[0.95] tracking-[-0.02em] text-ink">
          Ahead in
          <br />
          <em>compute</em>
          <span className="text-closing">.</span>
        </h1>
      </div>

      <div className="mt-12 border-t border-line" />

      <EventExplorer city={city} onCity={setCity} now={now} />
    </div>
  );
}
