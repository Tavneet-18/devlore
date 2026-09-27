/**
 * The front page is a dated issue, so the date and issue number are part of
 * the identity rather than incidental chrome. Both are derived from a single
 * `Date` passed in by a server component, never read during client render.
 */

/**
 * The date of the first published issue.
 *
 * This exists because the obvious implementation — the ISO week number — was
 * quietly dishonest. It reported "Issue 39" on a site with no archive, which
 * implies thirty-eight earlier editions that were never published. The number
 * counts real weeks since the first issue instead, so it starts at 1 and only
 * advances when an edition genuinely has.
 */
const FIRST_ISSUE = Date.UTC(2026, 8, 26); // 26 September 2026

export function issueNumber(date: Date): number {
  const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const weeks = Math.floor((current - FIRST_ISSUE) / (7 * 86400000));
  // Never report a non-positive issue, even if the clock moves backwards.
  return Math.max(1, weeks + 1);
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
