/**
 * The front page is a dated issue, so the date and issue number are part of
 * the identity rather than incidental chrome. Both are derived from a single
 * `Date` passed in by a server component, never read during client render.
 */

/** ISO 8601 week number, used as the issue marker. */
export function issueNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

/** "SATURDAY 26 SEPTEMBER 2026" — set in the nameplate with wide tracking. */
export function dateLine(date: Date): string {
  return date
    .toLocaleDateString("en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
    .toUpperCase();
}
