import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full bg-surface/80 backdrop-blur-xl border-b border-white/10 shadow-[0_8px_32px_rgba(124,92,255,0.15)]">
      <div className="mx-auto flex h-[64px] max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo + Search */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-cyanGlow shadow-[0_0_16px_rgba(124,92,255,0.5)] group-hover:scale-105 transition-transform">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B0D17" strokeWidth="2.2" strokeLinecap="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </span>
            <span className="text-[20px] font-bold tracking-tight text-white">Devlore</span>
          </Link>

          {/* Search - hidden on mobile */}
          <div className="relative hidden lg:flex items-center">
            <svg className="pointer-events-none absolute left-3 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
            <input
              placeholder="Search sprints, bounties..."
              className="w-64 xl:w-72 rounded-full border border-white/10 bg-ink/70 py-[7px] pl-9 pr-14 text-sm text-white placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="pointer-events-none absolute right-2.5 flex items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-faint">
              ⌘K
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link href="/" className="flex items-center gap-1.5 border-b-2 border-primary pb-1 text-sm font-semibold tracking-wide text-white">
            Hackathons
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tertiary" />
          </Link>
          <Link href="/list" className="text-sm text-muted transition hover:text-white">
            City Radar
          </Link>
          <Link href="/bookmarks" className="text-sm text-muted transition hover:text-white">
            Saved
          </Link>
          <Link href="/admin" className="text-sm text-muted transition hover:text-white">
            Admin
          </Link>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2.5">
          <Link
            href="/list"
            className="hidden items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-purple-600 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white shadow-[0_0_16px_rgba(124,92,255,0.3)] transition hover:scale-[0.98] sm:inline-flex"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Host Hackathon
          </Link>

          {/* Avatar halo */}
          <div className="relative ml-1 h-9 w-9 rounded-full bg-gradient-to-tr from-primary via-tertiary to-primary p-[2px] shadow-[0_0_12px_rgba(124,92,255,0.4)]">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-ink text-sm font-bold text-white">D</div>
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface bg-tertiary" />
          </div>
        </div>
      </div>
    </header>
  );
}
