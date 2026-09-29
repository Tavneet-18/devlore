import { db } from "./db";

/**
 * Runtime schema capability detection.
 *
 * Migrations are applied by hand in the Supabase SQL editor, and the build no
 * longer runs `prisma migrate deploy`. That means code can be deployed ahead
 * of the migration that supports it, and Prisma will then throw on any query
 * that selects a column the database does not have — turning a deploy ordering
 * mistake into a total outage of the events API.
 *
 * So the new columns are never referenced blindly. This probes information_
 * schema once per process and caches the answer, and callers branch on it.
 * Remove a branch, and its migration, once the migration is definitely applied.
 */

export interface SchemaCapabilities {
  /** Event.sourceId and Event.deadlineKind exist. */
  sourceIdentity: boolean;
  /** The IngestRun table exists. */
  ingestRun: boolean;
}

let cached: SchemaCapabilities | null = null;
let inFlight: Promise<SchemaCapabilities> | null = null;

const UNKNOWN: SchemaCapabilities = { sourceIdentity: false, ingestRun: false };

async function probe(): Promise<SchemaCapabilities> {
  try {
    const [cols, tables] = await Promise.all([
      db.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Event'
      `,
      db.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'IngestRun'
      `,
    ]);

    const present = new Set(cols.map((c) => c.column_name));
    return {
      sourceIdentity: present.has("sourceId") && present.has("deadlineKind"),
      ingestRun: tables.length > 0,
    };
  } catch {
    // If the probe itself fails, assume the old schema rather than issuing
    // queries against columns that may not exist.
    return UNKNOWN;
  }
}

/** Cached for the life of the process. Re-probe with `resetSchemaCapabilities`. */
export async function getSchemaCapabilities(): Promise<SchemaCapabilities> {
  if (cached) return cached;
  if (!inFlight) {
    inFlight = probe()
      .then((caps) => {
        cached = caps;
        return caps;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Test hook, and the escape hatch right after applying a migration. */
export function resetSchemaCapabilities() {
  cached = null;
  inFlight = null;
}
