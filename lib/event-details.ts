import { z } from "zod";

/**
 * The structured facts a source actually publishes about an event.
 *
 * This is deliberately partial. The four sources overlap only partially:
 * Hack2Skill publishes team size, age limit and entry fee; Devfolio publishes
 * themes and a participant count but no description, prize or fee; WeMakeDevs
 * publishes a prize string and a venue; MLH publishes only dates, mode, venue
 * and links.
 *
 * Every field is optional and there are no defaults. A missing field means the
 * source did not publish it, and the detail page omits the row rather than
 * printing a blank or a guess. This is the difference between "free" and
 * "unknown", and the type cannot express the first when the source said the
 * second.
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

export type EventDetails = z.infer<typeof EventDetailsSchema>;

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
  return result.success ? result.data : null;
}

/** Coerce a platform's team-size object, which uses varying key names. */
export function readTeamSize(
  min: unknown,
  max: unknown
): { teamMin?: number; teamMax?: number } {
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
    return Number.isFinite(n) ? n : undefined;
  };
  const lo = num(min);
  const hi = num(max);
  // Inverted pairs occur in the wild; order them rather than discard.
  if (lo !== undefined && hi !== undefined && lo > hi) return { teamMin: hi, teamMax: lo };
  return { ...(lo !== undefined ? { teamMin: lo } : {}), ...(hi !== undefined ? { teamMax: hi } : {}) };
}

/** "1-4 members", "Solo or teams of 4", or null when neither bound is known. */
export function teamSizeLabel(d: EventDetails | null): string | null {
  if (!d) return null;
  const { teamMin, teamMax } = d;
  if (teamMin === undefined && teamMax === undefined) return null;
  if (teamMin !== undefined && teamMax !== undefined) {
    if (teamMin === 1 && teamMax === 1) return "Solo entry";
    if (teamMin === teamMax) return `Teams of ${teamMin}`;
    if (teamMin === 1) return `Solo, or teams up to ${teamMax}`;
    return `Teams of ${teamMin}-${teamMax}`;
  }
  if (teamMax !== undefined) return `Up to ${teamMax} members`;
  return `From ${teamMin} members`;
}

/** The fee, as a phrase. Returns null when the source never mentioned price. */
export function feeLabel(d: EventDetails | null): string | null {
  if (!d) return null;
  if (d.feeAmount) return d.fee === "free" ? `Free (${d.feeAmount})` : d.feeAmount;
  if (d.fee === "free") return "Free to enter";
  return null;
}
