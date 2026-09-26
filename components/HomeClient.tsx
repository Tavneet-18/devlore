"use client";

import { useState } from "react";
import { EventExplorer } from "./EventExplorer";

export function HomeClient() {
  const [city, setCity] = useState("");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-[32px] font-bold leading-tight tracking-tight text-ink">
          Discover events
        </h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">
          A curated archive of hackathons, technical conferences, and engineering gatherings.
        </p>
      </header>

      <EventExplorer city={city} onCity={setCity} />
    </div>
  );
}
