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

export interface RawEvent {
  source: string;
  title: string;
  description: string;
  date: string;
  endDate?: string;
  venue?: string;
  city?: string;
  isOnline?: boolean;
  organizer: string;
  link?: string;
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