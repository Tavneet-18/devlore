import Link from "next/link";

/**
 * Sources are named explicitly. A directory that aggregates other people's
 * listings should say where they come from and tell readers to verify.
 */
const SOURCES = "Devpost · Unstop · Google Developer Groups · Direct organiser dispatches";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <p className="font-serif text-[19px] leading-none text-ink">Devlore</p>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              A dated index of the technical gatherings worth your time, ordered by how soon
              they close.
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-x-7 gap-y-2 text-[11px] uppercase tracking-[0.12em] text-faint">
            <Link href="/" className="transition-colors duration-200 hover:text-ink">
              Discover
            </Link>
            <Link href="/bookmarks" className="transition-colors duration-200 hover:text-ink">
              Saved
            </Link>
            <Link href="/list" className="transition-colors duration-200 hover:text-ink">
              Submit
            </Link>
            <Link href="/admin" className="transition-colors duration-200 hover:text-ink">
              Admin
            </Link>
          </nav>
        </div>

        <div className="mt-10 border-t border-line pt-6 text-[11px] uppercase tracking-[0.12em] text-faint">
          <p>Sources: {SOURCES}</p>
          <p className="mt-2 normal-case tracking-normal text-faint">
            Listings should always be verified directly with the organiser before travel or
            payment. Deadlines are republished from each source and may change without notice.
          </p>
        </div>
      </div>
    </footer>
  );
}
