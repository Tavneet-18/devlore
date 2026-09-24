import type { AIEnhancer, DiscoverySource } from "./types";
import { MockAIEnhancer } from "./mockEnhancer";
import { GroqEnhancer } from "./groqEnhancer";
import { MOCK_SOURCES } from "./mockSources";
import { LIVE_SOURCES } from "./sources/liveSources";

/**
 * PLUGGABLE PROVIDER FACTORY
 * ==========================
 *
 * The single switchboard between placeholder data and real integrations.
 * Selected entirely by environment variables, so no code changes are needed
 * to move between providers:
 *
 *   AI_PROVIDER     mock  -> keyword enhancer, free, no network
 *                   groq  -> Groq LLM (OpenAI-compatible), set GROQ_API_KEY
 *
 *   DISCOVERY_MODE  mock  -> bundled placeholder events, no network
 *                   live  -> real public source APIs (see ./sources)
 *
 * To add a provider: implement the interface in ./types.ts, then return it
 * from the matching factory function below.
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

export function getDiscoverySources(_location: string): DiscoverySource[] {
  void _location;
  return (process.env.DISCOVERY_MODE ?? "mock") === "live" ? LIVE_SOURCES : MOCK_SOURCES;
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