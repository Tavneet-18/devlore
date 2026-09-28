"use client";

import { useEffect, useState } from "react";

/**
 * A ticking clock for client components that show live countdowns.
 *
 * The initial value is supplied by the server, so the first client render
 * matches the server-rendered markup and hydration stays clean. Only after
 * mount does the interval take over and the clock start moving. Without the
 * server-supplied seed the first paint would differ between server and client
 * and React would warn about a mismatch.
 */
export function useNow(serverNow: number, intervalMs = 1000): number {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
