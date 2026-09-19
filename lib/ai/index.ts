import type { AIEnhancer, DiscoverySource } from "./types";
import { MockAIEnhancer } from "./mockEnhancer";
import { GroqEnhancer } from "./groqEnhancer";
import { MOCK_SOURCES } from "./mockSources";
import { PLAYWRIGHT_SOURCES } from "./sources/playwrightSources";

/**
 * PLUGGABLE PROVIDER FACTORY
 * ==========================
 *
 * This is the single place to swap mock AI logic for real providers:
 *
 *  1. Implement the `AIEnhancer` interface (see ./types.ts) in a new file,
 *     e.g. `openaiEnhancer.ts`, calling a real LLM API.
 *  2. Return it from `getEnhancer()` below when AI_PROVIDER=openai.
 *  3. Implement live `DiscoverySource` fetchers (Devpost / Unstop /
 *     Meetup / GDG public APIs) and return them from `getDiscoverySources()`
 *     when DISCOVERY_MODE=live.
 *
 * No other code needs to change.
 */

export function getEnhancer(): AIEnhancer {
  const provider = process.env.AI_PROVIDER ?? "mock";
  switch (provider) {
    case "groq":
      return new GroqEnhancer();
    case "openai": {
      throw new Error("AI_PROVIDER=openai is deprecated, use groq. Set AI_PROVIDER=groq and GROQ_API_KEY.");
    }
    case "mock":
    default:
      return new MockAIEnhancer();
  }
}

export function getDiscoverySources(_location: string): DiscoverySource[] | Promise<DiscoverySource[]> {
  void _location;
  const mode = process.env.DISCOVERY_MODE ?? "mock";
  if (mode === "live") {
    return PLAYWRIGHT_SOURCES;
  }
  return MOCK_SOURCES;
}

export function dedupeEvents<T extends { title: string; date?: string; city?: string; source?: string }>(raw: T[]) {
  const seen = new Set<string>();
  const events: T[] = [];
  let deduped = 0;
  for (const e of raw) {
    const key = `${e.title}|${e.date ?? ""}|${(e.city ?? "").toLowerCase().trim()}`;
    if (seen.has(key)) {
      deduped += 1;
      continue;
    }
    seen.add(key);
    events.push(e);
  }
  return { events, deduped };
}