-- Drop the view counter.
--
-- Why: it could not be made to work honestly. A view is only attributable to a
-- browser that has a `devlore_visitor` cookie, and only the bookmark route
-- handlers set that cookie -- so a reader who never saved anything had no
-- viewer id and was never counted. Measured in production: a plain visit showed
-- 0 views and left no cookie. The figure had therefore been a permanent 0
-- presented as a statistic since the site launched.
--
-- Counting every read would mean putting an identifier on every anonymous
-- visitor, which is a privacy decision rather than a bug fix. The other option
-- was to drop the counter, and a "0 views" badge on an event listing is
-- decoration this site does not need -- particularly one that also acted as a
-- tiebreaker in lib/recommendations.ts, adding noise to which events get
-- suggested.
--
-- This supersedes 20261004000000_view_dedup_unique, which added a unique index
-- so views could be deduplicated per browser. That is retained rather than
-- rewritten because it was applied before this decision was made; dropping the
-- table below removes the index with it.

DROP TABLE IF EXISTS "View";

ALTER TABLE "Event" DROP COLUMN IF EXISTS "viewCount";