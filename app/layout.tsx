import type { Metadata } from "next";
import { Newsreader, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Nameplate } from "@/components/Nameplate";
import { Footer } from "@/components/Footer";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import { dateLine } from "@/lib/issue";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/**
 * Display type is a high-contrast serif, functional type is a grotesk.
 *
 * Setting everything in one sans-serif is the single clearest tell of a
 * generated design, so the two roles are split deliberately. Newsreader was
 * drawn for news setting and carries real stroke contrast plus a true italic,
 * which is what lets a single word inside a headline carry emphasis.
 */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

/**
 * The nameplate carries today's date, so the shell has to be rendered per
 * request. Without this the layout is prerendered at build time and the date
 * silently freezes on whatever day the build ran.
 */
export const dynamic = "force-dynamic";

/**
 * Metadata leads with the benefit rather than the arrangement.
 *
 * The old description, "A dated index of hackathons, technical conferences,
 * and engineering gatherings", was an accurate summary of the format and
 * useless as a pitch: it listed three categories the index does not hold —
 * every collected listing is a hackathon or a tech event — and left out the
 * one thing that makes the site worth opening, which is that the ordering is
 * by how soon each registration closes.
 */
export const metadata: Metadata = {
  title: "Devlore — hackathons & tech events",
  description:
    "Find hackathons and tech events on one date axis, ordered by the registration deadline that closes soonest — so nothing worth applying to slips past.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const now = new Date();

  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${newsreader.variable}`} suppressHydrationWarning>
      {/* Theme before paint: the init script adds .light when appropriate, so
          a stored light preference never flashes dark. suppressHydrationWarning
          is required because the class may differ from what SSR emitted. */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <body className="relative min-h-full bg-bg text-ink">
        {/* Skip to content. The nameplate and footer are on every page, so a
            keyboard user opening any route had to Tab through the full nav on
            every navigation to reach the thing they came for. sr-only until
            focused, so it costs a sighted user nothing. */}
        <a
          href="#main"
          className="tap-target sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[2px] focus:border focus:border-line-hi focus:bg-surface focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-ink"
        >
          Skip to content
        </a>

        {/* Ambient atmosphere. Felt, not seen. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div className="absolute -left-[160px] -top-[160px] h-[640px] w-[640px] rounded-full bg-primary opacity-[0.12] blur-[120px]" />
          <div className="absolute -right-[180px] top-[420px] h-[560px] w-[560px] rounded-full bg-primary-2 opacity-[0.10] blur-[130px]" />
        </div>

        <div className="relative z-10 flex min-h-full flex-col">
          <Nameplate dateLine={dateLine(now)} />
          {/* tabIndex -1 so the skip link can move focus here. Without it the
              link scrolls but leaves focus on the link itself, and the next Tab
              carries on from the nav rather than from the content. */}
          <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
