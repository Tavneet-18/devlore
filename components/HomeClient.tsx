"use client";

import { useState } from "react";
import { LocationBar } from "./LocationBar";
import { EventExplorer } from "./EventExplorer";

export function HomeClient() {
  const [city, setCity] = useState("");

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="aurora-glow-1 left-[15%] top-[-80px]" />
          <div className="aurora-glow-2 right-[5%] top-[120px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pt-16">
          {/* Flash pill */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface/80 px-3 py-1 backdrop-blur">
            <span className="h-2 w-2 animate-ping rounded-full bg-secondary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-tertiary">Bengaluru Hack Season 2025</span>
            <span className="text-xs text-faint">• 28 flagships open</span>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <h1 className="font-bold leading-[1.05] tracking-tight text-white text-[36px] sm:text-[48px] lg:text-[54px]">
                Where India&apos;s sharpest builders{" "}
                <span className="bg-gradient-to-r from-primary via-tertiary to-cyanGlow bg-clip-text text-transparent">
                  ship under the midnight lights.
                </span>
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
                The curated discovery hub for flagship 48-hour sprints, AI hack houses, and venture bounties across Bengaluru, Delhi NCR, Hyderabad, and pan-India.
              </p>

              {/* Metrics */}
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/5 pt-6 sm:grid-cols-4">
                <div>
                  <div className="text-2xl font-bold tracking-tight text-white">₹4.8 Cr+</div>
                  <div className="text-xs text-muted">Total Prize Pools</div>
                </div>
                <div>
                  <div className="text-2xl font-bold tracking-tight text-tertiary">180+</div>
                  <div className="text-xs text-muted">Active Hackathons</div>
                </div>
                <div>
                  <div className="text-2xl font-bold tracking-tight text-accent">42k+</div>
                  <div className="text-xs text-muted">Verified Builders</div>
                </div>
                <div>
                  <div className="text-2xl font-bold tracking-tight text-primary">6 Hubs</div>
                  <div className="text-xs text-muted">Pan-India Cities</div>
                </div>
              </div>

              <div className="mt-8">
                <LocationBar onLocation={setCity} />
              </div>
            </div>

            {/* Spotlight */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-card to-surface p-1 shadow-[0_16px_40px_rgba(124,92,255,0.2)]">
                <div className="rounded-[14px] bg-card p-4">
                  <div className="relative mb-4 h-48 overflow-hidden rounded-xl bg-ink">
                    <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-transparent to-tertiary/20" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded-full border border-white/10 bg-midnight/80 px-3 py-1 text-xs font-semibold text-tertiary backdrop-blur">Featured Flagship</span>
                    </div>
                    <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface/90 px-2.5 py-1 backdrop-blur">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-secondary" />
                      <span className="font-mono text-xs font-bold text-white">3d : 14h : 22m remaining</span>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-white">Bangalore AI Conclave & 48h Sprint</h3>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C5CFF" strokeWidth="2"><path d="M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M12 13a8 8 0 0 0-8 8h16a8 8 0 0 0-8-8Z" /></svg>
                    Indiranagar Hacker House · Bengaluru
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-white/5 bg-ink/60 p-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-faint">Bounty Pool</div>
                      <div className="text-lg font-bold text-white">₹25,00,000</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-faint">Backed By</div>
                      <div className="text-xs font-semibold text-muted">PeakXV & Solana IN</div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-3">
                    <span className="flex-1 rounded-xl bg-gradient-to-r from-primary to-purple-600 py-3 text-center text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_16px_rgba(124,92,255,0.4)]">
                      Register Sprint →
                    </span>
                    <button className="rounded-xl border border-white/10 bg-surface px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white">
                      Teammates
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* City Radar mini */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
          India Tech Hub Radar
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { city: "Bengaluru", live: 54, sub: "Koramangala, HSR", accent: "primary" },
            { city: "Delhi NCR", live: 38, sub: "Cyber Hub, Noida", accent: "cyanGlow" },
            { city: "Hyderabad", live: 29, sub: "Hitec City, T-Hub", accent: "secondary" },
            { city: "Pune", live: 22, sub: "Baner, Hinjawadi", accent: "tertiary" },
            { city: "Mumbai", live: 19, sub: "BKC, Powai", accent: "accent" },
            { city: "Remote", live: 72, sub: "Pan-India Online", accent: "primary" },
          ].map((c) => (
            <div key={c.city} className="rounded-xl border border-white/10 bg-card/60 p-4 backdrop-blur transition hover:border-primary/40">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{c.city}</span>
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-bold text-primary">{c.live} Live</span>
              </div>
              <div className="mt-1 text-xs text-muted">{c.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Explorer */}
      <section className="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6">
        <EventExplorer city={city} />
      </section>
    </>
  );
}
