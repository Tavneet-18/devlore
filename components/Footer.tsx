export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink/60 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm sm:flex-row sm:px-6">
        <p className="flex items-center gap-2 text-muted">
          <span className="h-6 w-6 rounded-lg bg-gradient-to-br from-primary to-cyanGlow flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0B0D17" strokeWidth="2.5">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </span>
          Devlore — Midnight Neon · AI-powered tech discovery
        </p>
        <p className="text-faint">
          Devpost · Unstop · Meetup · GDG <span className="mx-2 text-white/10">|</span> <span className="text-muted">BLR-IND-1 99.98% UP</span>
        </p>
      </div>
    </footer>
  );
}
