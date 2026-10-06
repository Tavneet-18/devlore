"use client";

import Link from "next/link";

/**
 * The route-level error boundary.
 *
 * This did not exist either, and its absence was the most serious gap on the
 * page. The codebase is explicitly written to survive a deploy that lands before
 * its migration — lib/schema-capabilities.ts caches what exists, lib/events.ts
 * degrades a missing column to a subset rather than throwing — and
 * app/api/health/route.ts exists to report exactly that condition. But when the
 * failure it was designed for did happen, there was no recovery UI: a Prisma
 * throw rendered Next's full-screen production error overlay, in the wrong
 * colours, with no way back into the site.
 *
 * "use client" because this is the one boundary that is itself an error page,
 * and a server component cannot render when the server component tree has
 * already failed.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24 sm:px-10 sm:py-32">
      <p className="text-[11px] uppercase tracking-[0.18em] text-faint">Something broke</p>
      <h1 className="mt-4 font-serif text-[clamp(2.2rem,6vw,3.2rem)] font-normal leading-[0.98] tracking-[-0.02em] text-ink">
        This page failed to load.
      </h1>
      <p className="mt-5 max-w-md text-[14px] leading-relaxed text-muted">
        The listings are still there — this is one page, not the site. Retrying
        usually works; if it does not, the index is unaffected.
      </p>
      {error.digest && (
        <p className="mt-4 text-[12px] text-faint">
          Reference <code className="text-ink">{error.digest}</code>
        </p>
      )}
      <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
        <button
          type="button"
          onClick={reset}
          className="tap-target text-[13px] font-semibold text-primary transition-colors hover:text-[#9b8fff]"
        >
          Try again &rarr;
        </button>
        <Link
          href="/"
          className="tap-target text-[13px] font-semibold text-primary transition-colors hover:text-[#9b8fff]"
        >
          Go to the index
        </Link>
      </div>
    </div>
  );
}