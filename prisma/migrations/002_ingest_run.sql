-- ---------------------------------------------------------------------------
-- Devlore — migration 002: ingest run log
-- ---------------------------------------------------------------------------
-- Run this in the Supabase SQL editor AFTER 001 and before deploying the
-- source-health admin page.
--
-- Why: a silent ingest is indistinguishable from a working one. When a source
-- starts returning nothing — platform changed its markup, endpoint moved,
-- robots.txt changed — there is currently no signal at all. The daily cron
-- reports only what it wrote, never what it failed to fetch.
--
-- One row per source per run, so the admin page can show which source is
-- healthy and which has gone quiet.
--
-- Safe to re-run: every statement is IF NOT EXISTS guarded.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "IngestRun" (
  "id"          TEXT        NOT NULL,
  "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"  TIMESTAMP(3),

  "source"      TEXT        NOT NULL,
  "fetched"     INTEGER     NOT NULL DEFAULT 0,
  "created"     INTEGER     NOT NULL DEFAULT 0,
  "updated"     INTEGER     NOT NULL DEFAULT 0,
  "skipped"     INTEGER     NOT NULL DEFAULT 0,
  "errors"      INTEGER     NOT NULL DEFAULT 0,
  "errorSample" TEXT,

  CONSTRAINT "IngestRun_pkey" PRIMARY KEY ("id")
);

-- The admin page reads the most recent run per source, newest first.
CREATE INDEX IF NOT EXISTS "IngestRun_startedAt_idx" ON "IngestRun" ("startedAt");

-- Grouping by source for the health view.
CREATE INDEX IF NOT EXISTS "IngestRun_source_startedAt_idx"
  ON "IngestRun" ("source", "startedAt");

-- Keeps the table from growing without bound: the admin page only ever shows
-- the last 10 runs per source, so older rows are dead weight. This trims to
-- roughly 400 rows per source.
DELETE FROM "IngestRun"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id",
           ROW_NUMBER() OVER (PARTITION BY "source" ORDER BY "startedAt" DESC) AS rn
    FROM "IngestRun"
  ) ranked
  WHERE ranked.rn > 400
);
