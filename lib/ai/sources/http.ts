/**
 * Polite HTTP for source adapters.
 *
 * Three obligations every adapter shares, so they live here rather than being
 * re-implemented (and forgotten) seven times:
 *
 *   1. Identify ourselves. A descriptive User-Agent with a contact URL, as the
 *      major platforms ask, so an operator can reach a human rather than
 *      guess whether a crawler is abuse.
 *   2. Stay under one request per second per host. In-process only — it
 *      prevents bursts within a run, which is the actual failure mode, but it
 *      is not a cross-instance limit.
 *   3. Bound the damage. Every call has a timeout and a small retry with
 *      exponential backoff, and a failing source returns [] rather than
 *      throwing, so one dead platform cannot take down a whole ingest run.
 */

export const USER_AGENT =
  "DevloreBot/1.0 (+https://devlore-kappa.vercel.app; aggregates public hackathon listings)";

const MIN_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 12_000;

const lastRequestAt = new Map<string, number>();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function respectHostRateLimit(url: string) {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return; // Let fetch itself produce the error.
  }

  const last = lastRequestAt.get(host);
  if (last !== undefined) {
    const wait = MIN_INTERVAL_MS - (Date.now() - last);
    if (wait > 0) await sleep(wait);
  }
  lastRequestAt.set(host, Date.now());
}

export interface PoliteFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Extra attempts after the first. Default 1. */
  retries?: number;
  accept?: string;
}

/**
 * Fetch with rate limiting, timeout and backoff.
 * Returns the Response on success, or null when every attempt failed.
 */
export async function politeFetch(
  url: string,
  opts: PoliteFetchOptions = {}
): Promise<Response | null> {
  const { headers, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1, accept } = opts;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    await respectHostRateLimit(url);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          ...(accept ? { Accept: accept } : {}),
          ...headers,
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });

      // 4xx other than 429 will not improve on retry, so stop early.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return res;

      if (res.ok) return res;

      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
    }

    if (attempt < retries) {
      // 400ms, 1200ms — short enough not to stall a run, long enough not to
      // hammer a struggling host.
      await sleep(400 * (attempt + 1) * 3);
    }
  }

  if (lastError) {
    console.warn(`[source] ${url} failed:`, lastError instanceof Error ? lastError.message : lastError);
  }
  return null;
}

/** politeFetch + text/json, returning null on any failure. */
export async function fetchText(url: string, opts?: PoliteFetchOptions): Promise<string | null> {
  const res = await politeFetch(url, { accept: "text/html,application/xhtml+xml", ...opts });
  if (!res || !res.ok) return null;
  try {
    return await res.text();
  } catch {
    return null;
  }
}

export async function fetchJson<T = unknown>(url: string, opts?: PoliteFetchOptions): Promise<T | null> {
  const res = await politeFetch(url, { accept: "application/json", ...opts });
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Extract a JSON island from an HTML document.
 * Devfolio ships __NEXT_DATA__; WeMakeDevs and friends ship RSC flight chunks.
 * Returns the decoded text of whatever island is found, or null.
 */
export function extractNextData(html: string): unknown | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** Decode a Next.js App Router RSC flight payload into flat text. */
export function decodeFlightPayload(html: string): string {
  return (
    [...html.matchAll(/self\.__next_f\.push\(\[1,([\s\S]*?)\]\)<\/script>/g)]
      .map((m) => m[1])
      .join("")
      // Each chunk is the body of a JSON string literal.
      .replace(/\\"/g, '"')
      .replace(/\\n/g, " ")
      .replace(/\\t/g, " ")
      .replace(/\\\\/g, "\\")
  );
}
