import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Devlore — Hackathons & tech events",
  description:
    "A curated archive of hackathons, technical conferences, and engineering gatherings.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body className="relative min-h-full bg-bg text-ink">
        {/* Ambient atmosphere. Felt, not seen. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div className="absolute -left-[160px] -top-[160px] h-[640px] w-[640px] rounded-full bg-primary opacity-[0.12] blur-[120px]" />
          <div className="absolute -right-[180px] top-[420px] h-[560px] w-[560px] rounded-full bg-primary-2 opacity-[0.10] blur-[130px]" />
        </div>

        <div className="relative z-10 flex min-h-full flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
