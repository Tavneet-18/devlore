import { HomeClient } from "@/components/HomeClient";

/**
 * The front page is a dated issue, so the reference time is resolved here on
 * the server rather than read during client render. The nameplate's own date
 * and issue number live in the root layout.
 */
export const dynamic = "force-dynamic";

export default function Home() {
  return <HomeClient now={new Date().toISOString()} />;
}
