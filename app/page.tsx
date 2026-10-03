import { HomeClient } from "@/components/HomeClient";

/**
 * The reference time for the axis and the countdowns is resolved here on the
 * server rather than read during client render, so the server-rendered markup
 * and the first client render agree. The nameplate's date lives in the root
 * layout.
 */
export const dynamic = "force-dynamic";

export default function Home() {
  return <HomeClient now={new Date().toISOString()} />;
}
