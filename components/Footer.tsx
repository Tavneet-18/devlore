import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-line bg-bg">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-10 text-[13px] sm:px-6 md:flex-row">
        <div className="flex flex-wrap items-center gap-6">
          <span className="text-base font-bold text-ink">Devlore</span>
          <span className="text-muted">The technical gatherings directory for engineers.</span>
        </div>
        <nav className="flex flex-wrap items-center gap-6 text-muted">
          <Link href="/" className="transition-colors duration-200 hover:text-ink">
            Browse all
          </Link>
          <Link href="/list" className="transition-colors duration-200 hover:text-ink">
            Submit an event
          </Link>
          <Link href="/bookmarks" className="transition-colors duration-200 hover:text-ink">
            Saved
          </Link>
        </nav>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-8 text-[12px] text-faint sm:px-6">
        Listings are provided by their respective sources. Verify details with the organiser
        before travelling or paying.
      </div>
    </footer>
  );
}
