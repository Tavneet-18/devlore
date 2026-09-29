-- ---------------------------------------------------------------------------
-- Devlore — migration 003: cross-source event identity
-- ---------------------------------------------------------------------------
-- Run in the Supabase SQL editor AFTER 001 and 002, before deploying the
-- dedupe pass.
--
-- Why: the same hackathon is routinely listed on more than one platform. With
-- ~100 events across four sources, overlap is guaranteed, and duplicate rows
-- for one real event are exactly what this site's design principles forbid —
-- they split the count, double the deadline urgency, and waste Groq calls on
-- summarising the same listing twice.
--
-- An Event now has MANY source references. The first sighting stays on the
-- Event row itself (source/sourceId) and every additional sighting becomes a
-- row here, so no platform's link is lost.
--
-- Safe to re-run: every statement is IF NOT EXISTS guarded.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "EventSourceRef" (
  "id"         TEXT        NOT NULL,
  "eventId"    TEXT        NOT NULL,
  "source"     TEXT        NOT NULL,
  "sourceId"   TEXT        NOT NULL,
  "link"       TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventSourceRef_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventSourceRef_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE
);

-- One row per (source, sourceId) across the whole table: this is the guard
-- that stops a third sighting of the same listing creating a second ref.
CREATE UNIQUE INDEX IF NOT EXISTS "EventSourceRef_source_sourceId_key"
  ON "EventSourceRef" ("source", "sourceId");

CREATE INDEX IF NOT EXISTS "EventSourceRef_eventId_idx" ON "EventSourceRef" ("eventId");

-- ---------------------------------------------------------------------------
-- Seed from data already in Event, so existing rows gain their own ref. Without
-- this the first post-deploy run would treat every existing event as un-seen
-- and could merge it with itself.
-- ---------------------------------------------------------------------------
INSERT INTO "EventSourceRef" ("id", "eventId", "source", "sourceId", "link")
SELECT
  md5(random()::text || clock_timestamp()::text)::text,
  e."id",
  e."source",
  e."sourceId",
  e."link"
FROM "Event" e
WHERE e."sourceId" IS NOT NULL
ON CONFLICT ("source", "sourceId") DO NOTHING;
