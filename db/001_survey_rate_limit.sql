-- Rate-limit counter for the public survey endpoint (netlify/functions/save-survey.js).
-- Fixed 1-hour window, 5 submissions per IP. One row per IP; the row is reused
-- and reset in place, so the table stays roughly as large as your distinct-IP count.
--
-- Applied to the Neon database on 2026-07-25. Safe to re-run.

CREATE TABLE IF NOT EXISTS survey_rate_limit (
  ip           TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count        INTEGER     NOT NULL DEFAULT 0
);

-- Lets the cleanup below use an index instead of a seq scan once the table grows.
CREATE INDEX IF NOT EXISTS survey_rate_limit_window_start_idx
  ON survey_rate_limit (window_start);

-- Optional housekeeping — stale rows serve no purpose once their window has passed.
-- Run occasionally, or wire into a scheduled function:
--   DELETE FROM survey_rate_limit WHERE window_start < now() - interval '1 day';
