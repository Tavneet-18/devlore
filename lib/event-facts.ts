/**
 * The structured facts a source actually publishes about an event, and the
 * pure helpers that read them.
 *
 * This module has NO imports, deliberately. It is imported by client
 * components (via lib/event-summary.ts), and anything it pulled in would ship
 * to every visitor's browser. The zod schema lives in lib/event-details.ts,
 * which is server-only; importing that here once dragged the entire zod
 * library into the client bundle, where its module initialisation threw and
 * took down the whole front page behind the error boundary.
 *
 * Rule: nothing in this file may import a runtime dependency. Types only.
 */

/**
 * Deliberately partial. The four sources overlap only partially: Hack2Skill
 * publishes team size, age limit and entry fee; Devfolio publishes themes and
 * a participant count but no description, prize or fee; WeMakeDevs publishes
 * a prize string; MLH publishes only a venue.
 *
 * Every field is optional and there are no defaults. A missing field means the
 * source did not publish it, and the detail page omits the row rather than
 * printing a blank or a guess. This is the difference between "free" and
 * "unknown", and the type cannot express the first when the source said the
 * second.
 *
 * This mirrors EventDetailsSchema in lib/event-details.ts field for field.
 * The schema is the validation boundary; this is the shape both sides agree
 * on. If you add a field, add it in both places.
 */
export interface EventDetails {
  /** The source's own prose. Brief input only, never rendered verbatim. */
  sourceText?: string;
  /** Free-text prize description, exactly as published. */
  prize?: string;
  teamMin?: number;
  teamMax?: number;
  /** Who may enter, as the source states it. */
  eligibility?: string;
  /** Only "free" when the source says so. Absent otherwise. */
  fee?: "free";
  /** Entry amount, as printed. Separate from `fee` so a missing price never
   *  implies a free event. */
  feeAmount?: string;
  /** Tracks, themes or problem-statement categories. */
  themes?: string[];
  /** Physical location as published. Distinct from the coarse `city` column. */
  venue?: string;
  /** The organising body, only when the source names it. */
  organiser?: string;
  /** Registered participant count, as published. */
  participants?: number;
  /** When registration opens, when submissions open. */
  regStart?: string;
  submissionStart?: string;
  /** Set when the source gives no registration deadline at all. */
  noDeadlineReason?: string;
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
export function teamSizeLabel(d: EventDetails | null | undefined): string | null {
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
export function feeLabel(d: EventDetails | null | undefined): string | null {
  if (!d) return null;
  if (d.feeAmount) return d.fee === "free" ? `Free (${d.feeAmount})` : d.feeAmount;
  if (d.fee === "free") return "Free to enter";
  return null;
}
