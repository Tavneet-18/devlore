import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Devlore — Discover hackathons & tech events near you",
  description:
    "AI-powered discovery of hackathons, GDG meetups, workshops and developer opportunities near your location. Midnight Neon edition.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} dark antialiased`}>
      <body className="min-h-full flex flex-col bg-midnight text-white">
        {/* Aurora orbs - global */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
          <div className="aurora-glow-1 top-[-100px] left-[15%]" />
          <div className="aurora-glow-2 top-[320px] right-[5%]" />
        </div>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
