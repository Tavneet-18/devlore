"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "devlore-theme";

/**
 * Pre-paint script, inlined in the root layout. React hydrates after first
 * paint, so without this the page would always flash dark before a stored
 * light preference applied. Reads localStorage, falls back to the OS
 * preference, and defaults to dark — the theme the site was designed in.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("${STORAGE_KEY}");var l=s==="light"||(!s&&window.matchMedia("(prefers-color-scheme: light)").matches);if(l)document.documentElement.classList.add("light")}catch(e){}})();`;

function currentIsLight(): boolean {
  return (
    typeof document !== "undefined" && document.documentElement.classList.contains("light")
  );
}

/**
 * Sun/moon toggle for the nameplate. Persists to localStorage so the choice
 * survives navigation; the init script above picks it up before first paint.
 */
export function ThemeToggle() {
  const [light, setLight] = useState(false);

  // The init script ran before paint, so sync state with what it decided —
  // otherwise the icon shows the wrong mode on first load.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLight(currentIsLight());
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "light" : "dark");
    } catch {
      // Private mode: the toggle still works for this visit.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      title={light ? "Switch to dark mode" : "Switch to light mode"}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-faint transition-colors duration-200 hover:border-line-hi hover:text-ink"
    >
      {light ? (
        // Moon — shown in light mode, offers dark.
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      ) : (
        // Sun — shown in dark mode, offers light.
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      )}
    </button>
  );
}