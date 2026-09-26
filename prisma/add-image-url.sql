-- Adds the banner image column used by the event card and detail page.
--
-- Run in the Supabase SQL editor:
--   Dashboard -> project sijanjypvizitdubnczo -> SQL -> New query -> Run
-- It is safe to run more than once.
--
-- There is deliberately no backfill UPDATE here. The thumbnail is captured
-- during ingest (lib/ai/sources/liveSources.ts) and stored in imageUrl, so
-- re-running the ingest is what populates it:
--
--   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
--        https://devlore-kappa.vercel.app/api/cron/ingest

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
