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

export type DeadlineKind = "registration" | "event-end";

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
   * publishes a real registration deadline; "event-end" when it does not and
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
}

export interface DiscoverySource {
  id: string;
  displayName: string;
  fetch(location: string): Promise<RawEvent[]>;
}

export interface DiscoveryResult {
  provider: string;
  locationsSearched: string[];
  found: number;
  deduped: number;
  events: RawEvent[];
}