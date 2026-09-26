"use client";

import { useState } from "react";
import { EventExplorer } from "./EventExplorer";

export function HomeClient() {
  const [city, setCity] = useState("");

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      <header className="pt-16 sm:pt-20">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Devlore
        </p>
        <h1 className="mt-4 max-w-4xl text-[44px] font-bold leading-[1.05] tracking-tight text-ink sm:text-[58px]">
          Find the next thing
          <br />
          you want to <span className="text-gradient">build</span>.
        </h1>
        <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-muted">
          A curated archive of hackathons, technical conferences, and engineering gatherings —
          pulled daily from the platforms that list them.
        </p>
      </header>

      <div className="mt-14">
        <EventExplorer city={city} onCity={setCity} />
      </div>
    </div>
  );
}
