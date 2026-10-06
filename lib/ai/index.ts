import type { AIEnhancer, DiscoveryOptions, DiscoverySource } from "./types";
import { MockAIEnhancer } from "./mockEnhancer";
import { GroqEnhancer } from "./groqEnhancer";
import { MOCK_SOURCES } from "./mockSources";
import { LIVE_SOURCES } from "./sources/liveSources";
import { CITY_AGNOSTIC_SOURCES } from "./sources/indiaSources";

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

/**
 * Sources with no location dimension.
 *
 * These platforms publish a single global listing and expose no city filter,
 * so they are fetched once per run rather than once per city. They take an empty
 * location for the same reason.
 *
 * The wrapper exists to adapt their fetch signature to the shared
 * DiscoverySource one, and it has to forward BOTH arguments. It used to be
 * `fetch: () => s.fetch()`, which silently discarded everything — so
 * DiscoveryOptions could never reach an adapter, and the Hack2Skill request
 * budget went on re-reading slugs already held. A wrapper that drops arguments
 * is worse than no wrapper, because the interface still looks satisfied.
 */
export function getCityAgnosticSources(): DiscoverySource[] {
  if ((process.env.DISCOVERY_MODE ?? "mock") !== "live") return [];
  return CITY_AGNOSTIC_SOURCES.map((s) => ({
    ...s,
    fetch: (_location: string, opts?: DiscoveryOptions) => s.fetch("", opts),
  }));
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