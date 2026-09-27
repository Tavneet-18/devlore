import Link from "next/link";

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
 */
const NAV = [
  { href: "/", label: "Discover" },
  { href: "/bookmarks", label: "Saved" },
  { href: "/list", label: "Submit" },
  { href: "/admin", label: "Admin" },
];

export function Nameplate({ dateLine, issue }: { dateLine: string; issue: number }) {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6 sm:px-10">
        <Link
          href="/"
          className="shrink-0 font-serif text-[23px] leading-none tracking-tight text-ink transition-colors duration-200 hover:text-white"
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

        <nav className="flex shrink-0 items-center gap-5 sm:gap-7">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="border-b border-transparent pb-0.5 text-[11px] uppercase tracking-[0.12em] text-faint transition-colors duration-200 hover:border-primary hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
