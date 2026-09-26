import { HomeClient } from "@/components/HomeClient";

/**
 * The front page is a dated issue, so the date and issue number are resolved
 * here on the server rather than read during client render.
 */
export const dynamic = "force-dynamic";

function issueNumber(date: Date): number {
  // ISO 8601 week number.
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

export default function Home() {
  const now = new Date();
  return (
    <HomeClient
      now={now.toISOString()}
      issue={issueNumber(now)}
      dateLine={now
        .toLocaleDateString("en-GB", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
        .toUpperCase()}
    />
  );
}
