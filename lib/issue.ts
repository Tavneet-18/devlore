/**
 * The date line in the nameplate.
 *
 * Just the date. This module used to also derive an "Issue N" number and the
 * nameplate rendered it beside the date with a cyan dot, which was removed on
 * request: it reads as a small badge competing with the wordmark, and a
 * publication with no issue archive has no business numbering its issues. The
 * number was also pure decoration — nothing on the site links to, stores or
 * otherwise uses it.
 *
 * Kept as a module because the date must be resolved on the server: reading it
 * during client render would freeze the shell on whatever day it hydrated.
 */

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
