-- Manual database initialisation for Supabase Postgres.
--
-- WHY THIS EXISTS
--   prisma/migrations/20260924000000_init_postgres/migration.sql does exactly
--   the same thing and is the preferred path — `prisma migrate deploy` runs it
--   automatically during the Vercel build.
--
--   Use THIS file manually when you cannot run Prisma directly, e.g.:
--     - your network blocks outbound Postgres ports (common on some ISPs)
--     - you want to stand the database up before the first successful deploy
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--
--   It is written with IF NOT EXISTS, so running it twice is harmless.
--   The two ALTER TABLE statements are NOT idempotent — if you re-run after a
--   partial failure and they error with "already exists", that is fine.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Event" (
    "id"                TEXT NOT NULL,
    "title"             TEXT NOT NULL,
    "summary"           TEXT,
    "description"       TEXT,
    "date"              TIMESTAMP(3) NOT NULL,
    "endDate"           TIMESTAMP(3),
    "city"              TEXT,
    "country"           TEXT NOT NULL DEFAULT 'India',
    "isOnline"          BOOLEAN NOT NULL DEFAULT false,
    "eventType"         TEXT NOT NULL,
    "organizer"         TEXT NOT NULL,
    "link"              TEXT,
    "tags"              TEXT NOT NULL DEFAULT '[]',
    "beginnerFriendly"  BOOLEAN NOT NULL DEFAULT false,
    "source"            TEXT NOT NULL DEFAULT 'manual',
    "status"            TEXT NOT NULL DEFAULT 'APPROVED',
    "viewCount"         INTEGER NOT NULL DEFAULT 0,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Ingest / dedupe columns
    "externalId"        TEXT,
    "hash"              TEXT,
    "fetchedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawPayload"        JSONB,
    "expiresAt"         TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Bookmark" (
    "id"        TEXT NOT NULL,
    "eventId"   TEXT NOT NULL,
    "viewerId"  TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "View" (
    "id"        TEXT NOT NULL,
    "eventId"   TEXT NOT NULL,
    "viewerId"  TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "View_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Unique so the daily ingest can upsert on the source event URL.
CREATE UNIQUE INDEX IF NOT EXISTS "Event_externalId_key" ON "Event"("externalId");

CREATE INDEX IF NOT EXISTS "Event_status_idx"   ON "Event"("status");
CREATE INDEX IF NOT EXISTS "Event_eventType_idx" ON "Event"("eventType");
CREATE INDEX IF NOT EXISTS "Event_date_idx"    ON "Event"("date");
CREATE INDEX IF NOT EXISTS "Event_hash_idx"    ON "Event"("hash");
CREATE INDEX IF NOT EXISTS "Event_source_fetchedAt_idx" ON "Event"("source", "fetchedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Bookmark_viewerId_eventId_key" ON "Bookmark"("viewerId", "eventId");
CREATE INDEX IF NOT EXISTS "Bookmark_viewerId_idx" ON "Bookmark"("viewerId");

CREATE INDEX IF NOT EXISTS "View_viewerId_idx" ON "View"("viewerId");
CREATE INDEX IF NOT EXISTS "View_eventId_idx"  ON "View"("eventId");

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "View" ADD CONSTRAINT "View_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
