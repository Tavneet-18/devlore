-- One view per browser per event.
--
-- Why this exists: the detail page rendered `viewCount` but never recorded a
-- view, so the number shown was always 0 on every event -- a statistic-shaped
-- figure carrying no information. Recording a view per render instead would fix
-- that but make a refresh inflate the count, and the counter is also a
-- tiebreaker in lib/recommendations.ts, so inflation quietly changes which
-- events get suggested.
--
-- Deduplicating on (viewerId, eventId) makes the number mean "distinct
-- browsers that opened this page", which is both defensible and stable under
-- refresh. It also makes the increment atomic: an insert that loses the race is
-- skipped rather than counted, so viewCount cannot drift from the View rows.
--
-- Safe to apply: the table is empty, so there are no existing duplicates to
-- collapse first.

CREATE UNIQUE INDEX IF NOT EXISTS "View_viewerId_eventId_key"
  ON "View" ("viewerId", "eventId");