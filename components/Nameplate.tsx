"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { DISCOVER_RESET_EVENT } from "@/lib/constants";

/**
 * The nameplate is the only branded bar on the site.
 *
 * It replaced a conventional sticky navbar that sat directly above a
 * newspaper-style masthead. Two branded bars is the clearest possible
 * "SaaS template" signal, and it was fighting the editorial concept on every
 * page. The nameplate absorbs both roles: wordmark, date and navigation on a
 * single line.
 *
 * Note there is no logo tile and no filled call-to-action. The word is the
 * mark, and a publication does not put a marketing button in its masthead.
 *
 * Admin is deliberately absent here and lives in the footer instead: four nav
 * items plus the wordmark overflow a 375px viewport, and an unauthenticated
 * admin panel has no business being advertised in a masthead.
 *
 * Discover is a client-side intercept only when already on the front page.
 * Next does not remount the route on a same-URL navigation, so without this
 * the button visibly does nothing: no scroll, no filter reset. From anywhere
 * else it is a plain link home.
 */
const NAV = [
  { href: "/", label: "Discover" },
  { href: "/bookmarks", label: "Saved" },
  { href: "/list", label: "Submit" },
];

/**
 * Nav labels are 12px, not 11px.
 *
 * `globals.css` raises 9px and 10px to 11px on phones, because at 294 occurrences
 * of small type, sub-11px is unreadable at arm's length. 11px itself was never
 * covered — and these are the only 11px *interactive* text on the site, so they
 * were the worst case the floor missed. Adding 11px to the global floor would
 * have reached event rows and the time axis, which belong to the other branch,
 * so the fix is local to the element that has the problem.
 *
 * One pixel of type height changes nothing about the layout: the bar is
 * `min-h-16` and the links have 44px tap overlays, so 360px and above are
 * unaffected and 320px still wraps exactly where it did.
 */
export function Nameplate({ dateLine }: { dateLine: string }) {
  const pathname = usePathname();

  function onDiscover(e: React.MouseEvent) {
    if (pathname !== "/") return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent(DISCOVER_RESET_EVENT));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-xl">
      {/* min-h, not h. At 320px the wordmark (109px) plus three links and a
            toggle (229px) cannot share a 280px content box, so the nav wraps
            and the header has to be allowed to grow into a second line. Where
            everything does fit, min-h-16 renders exactly the 64px that h-16
            did. */}
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <Link
          href="/"
          className="tap-target shrink-0 font-serif text-[23px] leading-none tracking-tight text-ink transition-colors duration-200 hover:text-primary"
        >
          Devlore
        </Link>

        {/* Date only. The "Issue N" marker and its dot that used to sit here
            were decoration: a numbered edition implies an archive of earlier
            issues, which this site does not have, and it read as a badge
            crowding the wordmark. */}
        <div className="hidden shrink-0 md:block">
          <span className="text-[10px] uppercase tracking-[0.18em] text-faint">{dateLine}</span>
        </div>

        {/* Wraps rather than shrinking. `shrink-0` here is what pushed the page 24px
            sideways at 320px; letting the nav wrap only engages below ~340px,
            so the single-line header is unchanged at every width above that.
            `coarse:gap-y-6` is what keeps the wrapped rows from colliding —
            two lines of 44px tap overlays 8px apart would overlap, and the
            lower one would steal taps meant for the upper. */}
        <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 coarse:gap-y-6 sm:gap-x-6">
          {NAV.map((item) =>
            item.href === "/" ? (
              <Link
                key={item.href}
                href={item.href}
                onClick={onDiscover}
                className="tap-target border-b border-transparent pb-0.5 text-[12px] uppercase tracking-[0.12em] text-faint transition-colors duration-200 hover:border-primary hover:text-ink"
              >
                {item.label}
              </Link>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="tap-target border-b border-transparent pb-0.5 text-[12px] uppercase tracking-[0.12em] text-faint transition-colors duration-200 hover:border-primary hover:text-ink"
              >
                {item.label}
              </Link>
            )
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}