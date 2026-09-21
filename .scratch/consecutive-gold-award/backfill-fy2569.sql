-- =============================================================================
-- Backfill FY2569 awards into "Awards"
-- FY2569 = 1 Oct 2025 – 30 Sep 2026, Asia/Bangkok.
--
-- Years are stored in Common Era (src/schema/fiscal-year.ts):
--   FY2566 = 2023, FY2567 = 2024, FY2568 = 2025, FY2569 = 2026.
--
-- enroll_date is timestamp without time zone, written in UTC (PostgreSQL runs on
-- UTC). Midnight 1 Oct Bangkok = 17:00 on 30 Sep UTC, so the FY2569 window is
-- [2025-09-30 17:00, 2026-09-30 17:00). Same boundary as getFiscalYear(2026).
--
-- Run manually, once, after ALL of the following are true:
--   1. Auditors have finished FY2569 (every Cover finalized) — due 30 Sep 2026.
--   2. The "Awards" table and the "Grades" enum exist, including 'consec-gold'
--      (schema from issues 01 and 02 pushed).
--   3. FY2566–FY2568 gold rows are already inserted (step 0 below). The
--      consec-gold upgrade in step 3 reads FY2566.
--   4. The new API code is NOT yet serving reads. From issue 01 onward every
--      Score Report reads its grade from "Awards"; until this runs, FY2569
--      reports would show grade = null.
--
-- Grading rule = computeGrade in src/service/scoreHelpers.ts (ADR-0014, as
-- corrected by ticket 05). One rule, in code and here. Top-down, first match wins:
--   consec-gold the gold gate, every special == 2 answer = '3', and a gold-tier
--               award in FY2566 (the Cover's fiscal year - 3)
--   gold        every category > 80, total >= 90, every special == 1 answer = '3'
--   silver      every category > 60, total >= 80
--   certificate total >= 60
--   joined      otherwise
-- special == 3 gates no tier. 'n/a' never satisfies a special gate. A Cover with
-- no gating answers is graded on its percentages alone.
--
-- Effect against what the auditors saw (they worked under special > 0): the gate
-- is looser, so a FY2569 grade can only move up (silver -> gold / consec-gold, or
-- gold -> consec-gold). Nothing moves down.
--
-- Percentages reproduce scoreHelpers.ts exactly: float division, then
-- Math.round. 'n/a' is excluded from both numerator and denominator. An empty
-- category scores 0.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Step 0 — FY2566–FY2568 golds (you, by hand). Common Era years. Template:
-- -----------------------------------------------------------------------------
-- INSERT INTO "Awards" (factory_id, fiscal_year, grade, cover_id) VALUES
--   (1024, 2023, 'gold', NULL),   -- FY2566
--   (1187, 2024, 'gold', NULL)    -- FY2567
-- ON CONFLICT (factory_id, fiscal_year) DO NOTHING;
--
-- Only factories that exist: check first with
--   SELECT account_id FROM "Factories" WHERE account_id IN (1024, 1187);


-- -----------------------------------------------------------------------------
-- Step 1 — Three-year check on the history you inserted. Expect 0 rows.
-- A row means one factory won gold twice within three fiscal years, which the
-- existing policy forbids; the enrolment lockout would then misbehave for it.
-- -----------------------------------------------------------------------------
SELECT a.factory_id, a.fiscal_year AS first_gold, b.fiscal_year AS second_gold
FROM "Awards" a
JOIN "Awards" b
  ON b.factory_id = a.factory_id
 AND b.fiscal_year > a.fiscal_year
 AND b.fiscal_year - a.fiscal_year < 3
WHERE a.grade IN ('gold', 'consec-gold')
  AND b.grade IN ('gold', 'consec-gold');


-- -----------------------------------------------------------------------------
-- Step 2 — Duplicate check. Expect 0 rows.
-- A factory with two finished FY2569 Covers would lose one to ON CONFLICT.
-- -----------------------------------------------------------------------------
WITH fy_covers AS (
  SELECT c.id AS cover_id, e.factory_id
  FROM "Covers" c
  JOIN "Enrolls" e ON e.id = c.enroll_id
  JOIN LATERAL (
    SELECT cl.status FROM "CoverLogs" cl
    WHERE cl.cover_id = c.id
    ORDER BY cl.id DESC            -- latest log = greatest serial id (ADR-0010)
    LIMIT 1
  ) latest ON true
  WHERE e.enroll_date >= '2025-09-30 17:00:00'
    AND e.enroll_date <  '2026-09-30 17:00:00'
    AND latest.status = 'finished'
)
SELECT factory_id, array_agg(cover_id) AS cover_ids
FROM fy_covers
GROUP BY factory_id
HAVING count(*) > 1;


-- -----------------------------------------------------------------------------
-- Step 3 — Preview. Read-only. Compare a sample against the live Score Report
-- before inserting.
-- -----------------------------------------------------------------------------
WITH fy_covers AS (
  SELECT c.id AS cover_id, e.factory_id
  FROM "Covers" c
  JOIN "Enrolls" e ON e.id = c.enroll_id
  JOIN LATERAL (
    SELECT cl.status FROM "CoverLogs" cl
    WHERE cl.cover_id = c.id
    ORDER BY cl.id DESC
    LIMIT 1
  ) latest ON true
  WHERE e.enroll_date >= '2025-09-30 17:00:00'
    AND e.enroll_date <  '2026-09-30 17:00:00'
    AND latest.status = 'finished'
),
sums AS (
  SELECT
    fc.cover_id,
    fc.factory_id,
    -- achieved points and scored count, per group ('n/a' excluded)
    sum(a."selectedChoice"::text::int) FILTER (WHERE a."selectedChoice" <> 'n/a')                                  AS t_sum,
    count(*)                          FILTER (WHERE a."selectedChoice" <> 'n/a')                                  AS t_cnt,
    sum(a."selectedChoice"::text::int) FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Collaborate')   AS c_sum,
    count(*)                          FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Collaborate')   AS c_cnt,
    sum(a."selectedChoice"::text::int) FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Disease')       AS d_sum,
    count(*)                          FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Disease')       AS d_cnt,
    sum(a."selectedChoice"::text::int) FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Safety')        AS s_sum,
    count(*)                          FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Safety')        AS s_cnt,
    sum(a."selectedChoice"::text::int) FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Mental')        AS m_sum,
    count(*)                          FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Mental')        AS m_cnt,
    sum(a."selectedChoice"::text::int) FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Outcome')       AS o_sum,
    count(*)                          FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Outcome')       AS o_cnt,
    -- gold gate: every special == 1 answer is '3' ('n/a' fails); no special answers => true
    coalesce(bool_and(a."selectedChoice" = '3') FILTER (WHERE q.special = 1), true)                               AS special1_ok,
    -- extra consec-gold gate: every special == 2 answer is '3' ('n/a' fails). special == 3 gates nothing.
    coalesce(bool_and(a."selectedChoice" = '3') FILTER (WHERE q.special = 2), true)                               AS special2_ok
  FROM fy_covers fc
  LEFT JOIN "Answers"   a ON a.cover_id = fc.cover_id
  LEFT JOIN "Questions" q ON q.id = a.question_id
  GROUP BY fc.cover_id, fc.factory_id
),
pct AS (
  -- Math.round((achieved / (3 * count)) * 100), in IEEE double like JavaScript
  SELECT
    cover_id, factory_id, special1_ok, special2_ok,
    CASE WHEN t_cnt = 0 THEN 0 ELSE floor((t_sum::float8 / (3 * t_cnt)::float8) * 100 + 0.5) END AS total,
    CASE WHEN c_cnt = 0 THEN 0 ELSE floor((c_sum::float8 / (3 * c_cnt)::float8) * 100 + 0.5) END AS collaborate,
    CASE WHEN d_cnt = 0 THEN 0 ELSE floor((d_sum::float8 / (3 * d_cnt)::float8) * 100 + 0.5) END AS disease,
    CASE WHEN s_cnt = 0 THEN 0 ELSE floor((s_sum::float8 / (3 * s_cnt)::float8) * 100 + 0.5) END AS safety,
    CASE WHEN m_cnt = 0 THEN 0 ELSE floor((m_sum::float8 / (3 * m_cnt)::float8) * 100 + 0.5) END AS mental,
    CASE WHEN o_cnt = 0 THEN 0 ELSE floor((o_sum::float8 / (3 * o_cnt)::float8) * 100 + 0.5) END AS outcome
  FROM sums
),
graded AS (
  SELECT
    p.*,
    CASE
      WHEN least(collaborate, disease, safety, mental, outcome) > 80 AND total >= 90 AND special1_ok
        THEN CASE WHEN special2_ok AND EXISTS (
                    SELECT 1 FROM "Awards" aw
                    WHERE aw.factory_id = p.factory_id
                      AND aw.fiscal_year = 2023   -- FY2566
                      AND aw.grade IN ('gold', 'consec-gold'))
                  THEN 'consec-gold' ELSE 'gold' END
      WHEN least(collaborate, disease, safety, mental, outcome) > 60 AND total >= 80 THEN 'silver'
      WHEN total >= 60 THEN 'certificate'
      ELSE 'joined'
    END AS grade
  FROM pct p
)
SELECT factory_id, cover_id, total, collaborate, disease, safety, mental, outcome, special1_ok, special2_ok, grade
FROM graded
ORDER BY factory_id;


-- -----------------------------------------------------------------------------
-- Step 4 — Insert. Same query as step 3, wrapped. Idempotent: re-running
-- inserts nothing new. Check the RETURNING count before COMMIT; ROLLBACK if
-- anything looks wrong.
-- -----------------------------------------------------------------------------
BEGIN;

WITH fy_covers AS (
  SELECT c.id AS cover_id, e.factory_id
  FROM "Covers" c
  JOIN "Enrolls" e ON e.id = c.enroll_id
  JOIN LATERAL (
    SELECT cl.status FROM "CoverLogs" cl
    WHERE cl.cover_id = c.id
    ORDER BY cl.id DESC
    LIMIT 1
  ) latest ON true
  WHERE e.enroll_date >= '2025-09-30 17:00:00'
    AND e.enroll_date <  '2026-09-30 17:00:00'
    AND latest.status = 'finished'
),
sums AS (
  SELECT
    fc.cover_id,
    fc.factory_id,
    sum(a."selectedChoice"::text::int) FILTER (WHERE a."selectedChoice" <> 'n/a')                                  AS t_sum,
    count(*)                          FILTER (WHERE a."selectedChoice" <> 'n/a')                                  AS t_cnt,
    sum(a."selectedChoice"::text::int) FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Collaborate')   AS c_sum,
    count(*)                          FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Collaborate')   AS c_cnt,
    sum(a."selectedChoice"::text::int) FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Disease')       AS d_sum,
    count(*)                          FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Disease')       AS d_cnt,
    sum(a."selectedChoice"::text::int) FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Safety')        AS s_sum,
    count(*)                          FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Safety')        AS s_cnt,
    sum(a."selectedChoice"::text::int) FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Mental')        AS m_sum,
    count(*)                          FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Mental')        AS m_cnt,
    sum(a."selectedChoice"::text::int) FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Outcome')       AS o_sum,
    count(*)                          FILTER (WHERE a."selectedChoice" <> 'n/a' AND q.category = 'Outcome')       AS o_cnt,
    coalesce(bool_and(a."selectedChoice" = '3') FILTER (WHERE q.special = 1), true)                               AS special1_ok,
    coalesce(bool_and(a."selectedChoice" = '3') FILTER (WHERE q.special = 2), true)                               AS special2_ok
  FROM fy_covers fc
  LEFT JOIN "Answers"   a ON a.cover_id = fc.cover_id
  LEFT JOIN "Questions" q ON q.id = a.question_id
  GROUP BY fc.cover_id, fc.factory_id
),
pct AS (
  SELECT
    cover_id, factory_id, special1_ok, special2_ok,
    CASE WHEN t_cnt = 0 THEN 0 ELSE floor((t_sum::float8 / (3 * t_cnt)::float8) * 100 + 0.5) END AS total,
    CASE WHEN c_cnt = 0 THEN 0 ELSE floor((c_sum::float8 / (3 * c_cnt)::float8) * 100 + 0.5) END AS collaborate,
    CASE WHEN d_cnt = 0 THEN 0 ELSE floor((d_sum::float8 / (3 * d_cnt)::float8) * 100 + 0.5) END AS disease,
    CASE WHEN s_cnt = 0 THEN 0 ELSE floor((s_sum::float8 / (3 * s_cnt)::float8) * 100 + 0.5) END AS safety,
    CASE WHEN m_cnt = 0 THEN 0 ELSE floor((m_sum::float8 / (3 * m_cnt)::float8) * 100 + 0.5) END AS mental,
    CASE WHEN o_cnt = 0 THEN 0 ELSE floor((o_sum::float8 / (3 * o_cnt)::float8) * 100 + 0.5) END AS outcome
  FROM sums
),
graded AS (
  SELECT
    p.factory_id,
    p.cover_id,
    CASE
      WHEN least(collaborate, disease, safety, mental, outcome) > 80 AND total >= 90 AND special1_ok
        THEN CASE WHEN special2_ok AND EXISTS (
                    SELECT 1 FROM "Awards" aw
                    WHERE aw.factory_id = p.factory_id
                      AND aw.fiscal_year = 2023   -- FY2566
                      AND aw.grade IN ('gold', 'consec-gold'))
                  THEN 'consec-gold' ELSE 'gold' END
      WHEN least(collaborate, disease, safety, mental, outcome) > 60 AND total >= 80 THEN 'silver'
      WHEN total >= 60 THEN 'certificate'
      ELSE 'joined'
    END AS grade
  FROM pct p
)
INSERT INTO "Awards" (factory_id, fiscal_year, grade, cover_id)
SELECT factory_id, 2026, grade::"Grades", cover_id
FROM graded
ON CONFLICT (factory_id, fiscal_year) DO NOTHING
RETURNING factory_id, grade, cover_id;

-- COMMIT;     -- run after checking the RETURNING rows
-- ROLLBACK;   -- or this, if anything is wrong


-- -----------------------------------------------------------------------------
-- Step 5 — Verify. Both counts must match.
-- -----------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM "Awards" WHERE fiscal_year = 2026) AS fy2569_awards,
  (SELECT count(*)
     FROM "Covers" c
     JOIN "Enrolls" e ON e.id = c.enroll_id
     JOIN LATERAL (
       SELECT cl.status FROM "CoverLogs" cl
       WHERE cl.cover_id = c.id ORDER BY cl.id DESC LIMIT 1
     ) latest ON true
    WHERE e.enroll_date >= '2025-09-30 17:00:00'
      AND e.enroll_date <  '2026-09-30 17:00:00'
      AND latest.status = 'finished') AS fy2569_finished_covers;

SELECT grade, count(*) FROM "Awards" WHERE fiscal_year = 2026 GROUP BY grade ORDER BY grade;


-- -----------------------------------------------------------------------------
-- Step 6 — Late finalizations. Run again after 31 Oct 2026.
-- FY2569 Covers can still be finalized after the release (31-day Factory grace
-- window; ODPC and DOED past-year authority). The new code writes those awards
-- itself, under the NEW gold rule. This lists them so you can review each one.
-- Replace the timestamp with the time you ran step 4.
-- -----------------------------------------------------------------------------
SELECT a.factory_id, a.cover_id, a.grade, a.awarded_at
FROM "Awards" a
WHERE a.fiscal_year = 2026
  AND a.awarded_at > '2026-10-01 00:00:00'   -- <- time of step 4, UTC
ORDER BY a.awarded_at;
