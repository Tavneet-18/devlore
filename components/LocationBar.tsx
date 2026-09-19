"use client";

import { useState } from "react";

type Props = {
  onLocation: (city: string) => void;
  initialCity?: string;
};

export function LocationBar({ onLocation, initialCity = "" }: Props) {
  const [value, setValue] = useState(initialCity);
  const [detecting, setDetecting] = useState(false);
  const [detectNote, setDetectNote] = useState<string | null>(null);

  function submit(city: string) {
    onLocation(city.trim());
  }

  async function detect() {
    setDetecting(true);
    setDetectNote(null);
    try {
      const position = await getPosition();
      const city = await reverseGeocode(position.coords.latitude, position.coords.longitude);
      if (city) {
        setValue(city);
        onLocation(city);
        setDetectNote(`Location detected: ${city}`);
      } else {
        onLocation("");
        setDetectNote("Detected outside demo dataset — showing all events.");
      }
    } catch {
      onLocation("");
      setDetectNote("Couldn't detect location — showing all events.");
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div className="w-full max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className="flex items-center gap-2 rounded-2xl border border-white/10 bg-card/80 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl"
      >
        <svg className="ml-2 shrink-0 text-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter your city — e.g. Bangalore"
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[15px] text-white outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-gradient-to-r from-primary to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(124,92,255,0.3)] transition hover:opacity-90"
        >
          Discover
        </button>
      </form>

      <button
        type="button"
        onClick={detect}
        disabled={detecting}
        className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-tertiary transition hover:text-white disabled:opacity-50"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tertiary opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-tertiary" />
        </span>
        {detecting ? "Detecting your location…" : "Use my location (auto-detect)"}
      </button>

      {detectNote && <p className="mt-2 text-xs text-muted">{detectNote}</p>}
    </div>
  );
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
  });
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const city = data.city ?? data.locality ?? data.principalSubdivision;
    return typeof city === "string" && city.trim() ? city.trim() : null;
  } catch {
    return null;
  }
}
