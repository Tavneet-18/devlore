-- ---------------------------------------------------------------------------
-- Devlore — migration 004: event details and in-site brief
-- ---------------------------------------------------------------------------
-- Run in the Supabase SQL editor AFTER 001-003.
--
-- Why: the detail page was showing whatever the scrape happened to contain,
-- which for three of the four sources is very little. This stores the
-- structured facts each source actually publishes, plus a generated brief, so
-- a visitor can understand an event without leaving the site to register.
--
-- Design note on honesty: a fact is stored only when the source publishes it.
-- There are no defaults and no placeholders. A NULL column means "this source
-- did not say", and the page omits the row entirely rather than printing an
-- empty field.
--
-- Safe to re-run: every statement is IF NOT EXISTS guarded.
-- ---------------------------------------------------------------------------

-- Structured facts, as one JSON document rather than a column per field.
--
-- The field set is deliberately loose (JSONB, not jsonb with a fixed shape)
-- because the four sources overlap only partially: Hack2Skill publishes team
-- size, age limit and entry fee; Devfolio publishes neither but does publish
-- themes and a participant count; WeMakeDevs publishes a prize string; MLH
-- publishes only a venue. A column per field would be mostly NULL and would
-- need a migration every time a source turns out to publish something new.
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "details" JSONB;

-- When the brief or the who-can-join line was last generated.
--
-- NULL means "never generated", which is distinct from "generated and came out
-- blank", and distinct again from a row written before this migration. The
-- ingest only rewrites these when the content hash moves, so an unchanged event
-- keeps the same words.
--
-- Note on `brief`: measured against all four live adapters, none of them
-- publishes any description prose, so `brief` is NULL for every event today.
-- The column and the generator stay because the guard is cheap and a source
-- that starts publishing a description should light it up without a further
-- migration. `whoCanJoin` is real today and is built from the eligibility,
-- team-size and fee fields the source did publish.
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "brief" TEXT;
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "whoCanJoin" TEXT;
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "briefedAt" TIMESTAMP(3);

-- -----------------------------------------------------------------------
-- Backfill deadlineKind for the manual source, which has no deadline at all.
-- Left NULL deliberately: NULL means "no deadline of any kind" and the page
-- renders no countdown and no calendar button for it. This statement exists
-- only to make that explicit in the record rather than leaving it to
-- inference.
-- -----------------------------------------------------------------------
UPDATE "Event" SET "deadlineKind" = NULL WHERE "source" = 'manual';

-- Support the "last checked" line on the detail page without an extra query
-- per page: fetchedAt is already updated on every run, this just makes it
-- cheap to filter on.
CREATE INDEX IF NOT EXISTS "Event_fetchedAt_idx" ON "Event" ("fetchedAt");
