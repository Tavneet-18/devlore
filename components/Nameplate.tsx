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
 * page. The nameplate absorbs both roles: wordmark, date, issue number and
 * navigation on a single line.
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

export function Nameplate({ dateLine, issue }: { dateLine: string; issue: number }) {
  const pathname = usePathname();

  function onDiscover(e: React.MouseEvent) {
    if (pathname !== "/") return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent(DISCOVER_RESET_EVENT));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <Link
          href="/"
          className="shrink-0 font-serif text-[23px] leading-none tracking-tight text-ink transition-colors duration-200 hover:text-primary"
        >
          Devlore
        </Link>

        <div className="hidden shrink-0 flex-col items-center gap-1 md:flex">
          <span className="text-[10px] uppercase tracking-[0.18em] text-faint">{dateLine}</span>
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-faint">
            <span className="h-1 w-1 rounded-full bg-cyan" aria-hidden />
            Issue {issue}
          </span>
        </div>

        <nav className="flex shrink-0 items-center gap-4 sm:gap-6">
          {NAV.map((item) =>
            item.href === "/" ? (
              <Link
                key={item.href}
                href={item.href}
                onClick={onDiscover}
                className="border-b border-transparent pb-0.5 text-[11px] uppercase tracking-[0.12em] text-faint transition-colors duration-200 hover:border-primary hover:text-ink"
              >
                {item.label}
              </Link>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="border-b border-transparent pb-0.5 text-[11px] uppercase tracking-[0.12em] text-faint transition-colors duration-200 hover:border-primary hover:text-ink"
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