-- Adds the banner image column used by the event card and detail page.
-- Safe to run more than once.

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- Backfill any rows already ingested before this column existed, using the
-- thumbnail Devpost returns in the stored raw payload.
UPDATE "Event"
SET "imageUrl" = 'https:' || ("rawPayload" ->> 'thumbnailUrl')
WHERE "imageUrl" IS NULL
  AND "rawPayload" IS NOT NULL
  AND ("rawPayload" ->> 'thumbnailUrl') LIKE '//%';
