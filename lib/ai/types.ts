import type { EventDetails } from "../event-details";

export interface AIEnhancement {
  summary: string;
  tags: string[];
  beginnerFriendly: boolean;
  domain: string;
  isOnline: boolean;
}

export interface AIEnhancer {
  enhance(title: string, description: string, link?: string): Promise<AIEnhancement>;
}

export type DeadlineKind = "registration" | "submission" | "event-end";

/** Re-exported so adapters can import the details shape from one place. */
export type { EventDetails } from "../event-details";

export interface RawEvent {
  source: string;
  /**
   * Platform-stable id — a slug or uuid the source itself publishes.
   * This, not the URL, is what we upsert on: several platforms rewrite their
   * listing URLs, so keying on the link created duplicates on every rename.
   */
  sourceId?: string;
  title: string;
  description: string;
  date: string;
  endDate?: string;
  /**
   * Which date the countdown is measuring. "registration" when the platform
   * publishes a real registration deadline; "submission" for a submission
   * deadline; "event-end" when it does not and
   * we fall back to the event's end date. Surfaced in the UI so a finish date
   * is never labelled as a closing date.
   */
  deadlineKind?: DeadlineKind;
  venue?: string;
  city?: string;
  isOnline?: boolean;
  organizer: string;
  link?: string;
  imageUrl?: string;
  eventType?: string;
  /**
   * Structured facts the source actually publishes, for the detail page.
   *
   * Every field is optional and none is defaulted: a source that does not
   * publish a prize leaves `prize` undefined, and the page omits the row. See
   * lib/event-details.ts.
   */
  details?: EventDetails;
}

export interface DiscoveryOptions {
  /**
   * Source ids this adapter has already produced for us.
   *
   * Passed by the ingest layer from rows it already holds, so an adapter with a
   * per-run request budget can spend that budget on things it has never seen
   * rather than re-reading the same top-N every day. Adapters that have no cap
   * ignore it.
   */
  excludeSourceIds?: readonly string[];
}

export interface DiscoverySource {
  id: string;
  displayName: string;
  fetch(location: string, opts?: DiscoveryOptions): Promise<RawEvent[]>;
}

export interface DiscoveryResult {
  provider: string;
  locationsSearched: string[];
  found: number;
  deduped: number;
  events: RawEvent[];
}