import Link from "next/link";

export const metadata = { title: "Not found — Devlore" };

/**
 * The 404 the whole site uses.
 *
 * This file did not exist, which meant every dead event link rendered Next's
 * built-in error page: no nameplate, no theme, no navigation, and in dark mode
 * a white-on-white flash before the browser's own styling. On a site whose
 * content is links to other sites, stale links are the normal case rather than
 * the exception, so this is a page a reader will actually land on.
 *
 * Built from the same parts as everything else — hairline border, no box, no
 * shadow — so it reads as part of the site rather than as a failure.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24 sm:px-10 sm:py-32">
      <p className="text-[11px] uppercase tracking-[0.18em] text-faint">Not found</p>
      <h1 className="mt-4 font-serif text-[clamp(2.2rem,6vw,3.2rem)] font-normal leading-[0.98] tracking-[-0.02em] text-ink">
        This page has <em>moved</em> or never existed.
      </h1>
      <p className="mt-5 max-w-md text-[14px] leading-relaxed text-muted">
        Event listings are refreshed daily, and a listing that has ended is taken
        down. The index below is the full set of what is on now.
      </p>
      <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
        <Link
          href="/"
          className="tap-target text-[13px] font-semibold text-primary transition-colors hover:text-[#9b8fff]"
        >
          Browse events &rarr;
        </Link>
        <Link
          href="/list"
          className="tap-target text-[13px] font-semibold text-primary transition-colors hover:text-[#9b8fff]"
        >
          Submit an event
        </Link>
      </div>
    </div>
  );
}