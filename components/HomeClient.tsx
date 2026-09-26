"use client";

import { useState } from "react";
import { EventExplorer } from "./EventExplorer";

export function HomeClient() {
  const [city, setCity] = useState("");

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      <header className="mb-8 pt-[72px]">
        <h1 className="text-[34px] font-bold leading-tight tracking-tight text-ink">
          Discover <span className="text-gradient">events</span>
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
          A curated archive of hackathons, technical conferences, and engineering gatherings.
        </p>
      </header>

      <EventExplorer city={city} onCity={setCity} />
    </div>
  );
}
