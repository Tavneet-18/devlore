-- ---------------------------------------------------------------------------
-- Devlore — migration 001: stable source identity
-- ---------------------------------------------------------------------------
-- Run this in the Supabase SQL editor BEFORE deploying code that reads or
-- writes `sourceId` / `deadlineKind`.
--
-- Why:
--   1. Events were previously identified by `externalId` alone, which was set
--      to the listing URL for scraped rows. Devpost and Unstop both rewrite
--      their URLs, so a changed slug silently created a duplicate row instead
--      of updating the existing one.
--   2. A platform-stable id (Devpost slug, Devfolio uuid, Hack2Skill slug,
--      MLH uuid, WeMakeDevs uuid) is what actually identifies a listing.
--   3. `deadlineKind` records WHICH date we are counting down to. Devfolio and
--      Hack2Skill publish a real registration deadline; WeMakeDevs and MLH do
--      not, and for those we count down to the event's end date instead.
--      Without this column the UI would claim "Registration closes" for a
--      date that is actually when the hackathon finishes.
--
-- Safe to re-run: every statement is IF NOT EXISTS / OR REPLACE guarded.
-- Does not drop or rename anything, so the currently deployed code keeps
-- working while you roll the new one out.
-- ---------------------------------------------------------------------------

-- 1. Platform-stable identifier (slug or uuid from the source platform).
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "sourceId" TEXT;

-- 2. Which kind of date `endDate` is acting as for this row.
--    'registration' -> a real registration deadline from the platform
--    'event-end'    -> no deadline published; we use the event's end date
-- NULL on existing rows means "unknown", which the UI renders as neutral text.
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "deadlineKind" TEXT;

-- 3. Composite identity. NOT partial: Postgres treats NULLs as distinct in a
--    unique index, so the many manual submissions with a NULL sourceId will
--    not collide with each other or with scraped rows. A partial index here
--    would also drift from the Prisma schema's @@unique([source, sourceId]),
--    which is what `prisma generate` will emit.
CREATE UNIQUE INDEX IF NOT EXISTS "Event_source_sourceId_key"
  ON "Event" ("source", "sourceId");

-- 4. Backfill sourceId from the existing externalId for already-scraped rows.
--    externalId holds the listing URL, so the host+path is the closest stable
--    thing we have today. This is a one-time best-effort so the new unique
--    index has something to work with; a later ingest will replace these with
--    true platform ids on the rows it touches.
UPDATE "Event"
SET "sourceId" = "externalId"
WHERE "sourceId" IS NULL
  AND "externalId" IS NOT NULL
  AND "source" <> 'manual';

-- 5. Existing rows predate this column, so we do not know what their endDate
--    represents. Leave it NULL rather than asserting a value.
--
--    An earlier draft of this migration set every existing row to
--    'event-end'. That was wrong, and wrong in the exact way this column
--    exists to prevent: Devpost's endDate is the end of the SUBMISSION
--    WINDOW, so labelling it 'event-end' would tell a reader "this hackathon
--    finishes on the 23rd" when the truth is "submissions close on the 23rd",
--    and it would drop the row off the closing-deadline axis entirely. Only
--    two sources genuinely lack a registration deadline (WeMakeDevs and MLH),
--    and they are the two adapters that set 'event-end' themselves.
--
--    NULL means "not established". The UI treats it as a closing date, which is
--    how these rows have always been presented, so nothing changes visually
--    until a source states otherwise. The devpost adapter now declares
--    'registration' explicitly, and deadlineKind is part of the content hash,
--    so that correction lands on the next run instead of being frozen in.
--
--    (Unstop and GDG are deliberately also left NULL: unstop's endDate is
--    `event.endDate ?? registration.endDate`, which is genuinely ambiguous
--    row by row, and asserting either kind would be a guess.)

-- 6. Manual submissions are organiser-supplied with a start date only; there is
--    no deadline of any kind, so they stay NULL and the UI shows no countdown.
--
-- 7. Index for the dedupe pass, which scans by normalised title.
CREATE INDEX IF NOT EXISTS "Event_title_idx" ON "Event" ("title");
