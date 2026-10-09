"use client";

import { useEffect } from "react";
import { sendUsage } from "@/lib/usage-client";

/** Only explicitly marked official-source links, never generic external links. */
export function UsageObserver() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.type === "auxclick" && event.button !== 1) return;
      const anchor = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a[data-devlore-outbound]") : null;
      const eventId = anchor?.dataset.devloreOutbound;
      if (eventId && anchor && /^https?:$/.test(new URL(anchor.href).protocol)) {
        sendUsage({ kind: "outbound_click", eventId });
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("auxclick", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("auxclick", onClick);
    };
  }, []);
  return null;
}
