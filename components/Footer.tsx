import Link from "next/link";
import { TRUSTED_SOURCES, sourceLabel } from "@/lib/constants";

/**
 * Sources are named explicitly. A directory that aggregates other people's
 * listings should say where they come from and tell readers to verify.
 *
 * Derived from TRUSTED_SOURCES rather than written out by hand: the hardcoded
 * list still named four platforms after four more were added, so the page
 * under-reported where half its events came from.
 */
const SOURCES = `${TRUSTED_SOURCES.map(sourceLabel).join(" · ")} · Submitted directly`;

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <p className="font-serif text-[19px] leading-none text-ink">Devlore</p>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              Hackathons and tech events on one date axis, ordered by how soon each registration
              closes — so the deadlines worth acting on are the ones in front of you.
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-x-7 gap-y-2 text-[11px] uppercase tracking-[0.12em] text-faint coarse:gap-y-6">
            <Link href="/" className="tap-target transition-colors duration-200 hover:text-ink">
              Discover
            </Link>
            <Link href="/bookmarks" className="tap-target transition-colors duration-200 hover:text-ink">
              Saved
            </Link>
            <Link href="/list" className="tap-target transition-colors duration-200 hover:text-ink">
              Submit
            </Link>
            <Link href="/admin" className="tap-target transition-colors duration-200 hover:text-ink">
              Admin
            </Link>
          </nav>
        </div>

        {/* Sources and the verification caveat.

            The size used to be inherited from the wrapper — `text-[11px]`,
            the smallest on the page — by both lines, including the paragraph
            that carries the only warning on the site: that deadlines are
            republished and should be confirmed with the organiser. The warning
            is the least skimmable text here and was set in the least legible
            size. The label has since moved to 12px too, so the label and the
            sentence it introduces are no longer set two pixels apart, and the
            sentence gets 13px above sm and a measure capped at `2xl` rather
            than running across 1152px of page width.

            Only the LABEL is uppercase, not the list. Every platform name sits
            in the same line — Devpost, Unstop, Google Developer Groups,
            Hack2Skill and the rest, plus "Submitted directly" — which is four
            wrapped lines at 375px. Four lines of 12px uppercase at 0.12em
            tracking is the least readable text on the page, and uppercase earns
            its keep on a two-word label, not on a list of proper nouns. So
            "Sources:" keeps the small-caps treatment and the names drop to
            sentence case, which is what the design already did for the caveat
            below it. */}
        <div className="mt-10 border-t border-line pt-6 text-faint">
          <p className="text-[12px] uppercase tracking-[0.12em]">
            Sources:{" "}
            <span className="normal-case tracking-normal">{SOURCES}</span>
          </p>
          <p className="mt-3 max-w-2xl text-[12px] leading-relaxed sm:text-[13px]">
            Listings should always be verified directly with the organiser before travel or
            payment. Deadlines are republished from each source and may change without notice.
          </p>
        </div>
      </div>
    </footer>
  );
}
