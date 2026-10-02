import { z } from "zod";
import type { EventDetails } from "./event-facts";

/**
 * Server-only validation boundary for the structured facts.
 *
 * SERVER-ONLY. This module imports zod, which must never ship to the browser:
 * client components reach the shared shape through lib/event-facts.ts (the
 * plain interface) and lib/event-summary.ts (the pure readers) instead. Both
 * export the same names, so server code can keep importing from here while
 * client code imports from there — but nothing under components/ or imported
 * by a "use client" module may import this file.
 */
export const EventDetailsSchema = z.object({
  /**
   * The source's own prose, kept as brief input only.
   *
   * Never rendered verbatim on the page: the brief must be written in our words
   * so a visitor is not served the organiser's marketing copy back at them.
   */
  sourceText: z.string().max(4000).optional(),

  /** Free-text prize description, exactly as published ("₹1,00,000 pool"). */
  prize: z.string().max(300).optional(),

  teamMin: z.number().int().min(1).max(100).optional(),
  teamMax: z.number().int().min(1).max(100).optional(),

  /**
   * Who may enter, as the source states it: "open to all college students",
   * "aged 16-22", "second-year and above".
   */
  eligibility: z.string().max(400).optional(),

  /** Only "free" when the source says so. Absent otherwise. */
  fee: z.literal("free").optional(),
  /** Entry amount, as printed. Kept separate from `fee` so we never imply a
   *  free event from a missing price. */
  feeAmount: z.string().max(60).optional(),

  /** Tracks, themes or problem-statement categories. */
  themes: z.array(z.string().trim().min(1).max(60)).max(20).optional(),

  /** Physical location as published. Distinct from the coarse `city` column. */
  venue: z.string().max(200).optional(),

  /**
   * The organising body, only when the source names it. Previously we stored
   * the platform name here ("Devfolio"), which is the marketplace, not the
   * organiser — a small lie repeated on every card.
   */
  organiser: z.string().max(120).optional(),

  /** Registered participant count, as published. */
  participants: z.number().int().min(0).max(1_000_000).optional(),

  /** When registration opens, when submissions open. */
  regStart: z.string().optional(),
  submissionStart: z.string().optional(),

  /** Set when the source gives no registration deadline at all. */
  noDeadlineReason: z.string().max(200).optional(),
});

// Re-exported so server code has one import site for both the schema and the
// shape. The canonical home of the type is lib/event-facts.ts; this is an
// alias, not a second definition.
export type { EventDetails } from "./event-facts";
export { readTeamSize, teamSizeLabel, feeLabel } from "./event-facts";

/**
 * Read `details` off a row, tolerating the pre-migration case.
 *
 * The column arrives via a manual migration, and code is deployed before it.
 * A missing column or a row written before it must not take down the events
 * API, so this returns null rather than throwing.
 */
export function parseDetails(raw: unknown): EventDetails | null {
  if (raw === null || raw === undefined) return null;
  const result = EventDetailsSchema.safeParse(raw);
  // A malformed document is dropped, not repaired: partial guesses about
  // eligibility or prize money are worse than an absent row.
  return result.success ? (result.data as EventDetails) : null;
}
