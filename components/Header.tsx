import Link from "next/link";

const NAV = [
  { href: "/", label: "Discover" },
  { href: "/bookmarks", label: "Saved" },
  { href: "/list", label: "Submit" },
  { href: "/admin", label: "Admin" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 h-[60px] w-full border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-3">
          <span className="flex h-[30px] w-[30px] shrink-0 select-none items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-2 text-base font-bold text-bg">
            D
          </span>
          <span className="text-gradient-soft select-none text-base font-bold tracking-tight">
            Devlore
          </span>
        </Link>

        <nav className="hidden h-full items-center gap-7 text-[14px] font-medium md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex h-full items-center text-muted transition-colors duration-200 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="/list"
            className="glow-primary inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-primary to-primary-2 px-4 py-2 text-sm font-semibold text-bg transition-all duration-200 hover:brightness-105 active:scale-[0.98]"
          >
            Post Event
          </Link>
        </div>
      </div>
    </header>
  );
}
