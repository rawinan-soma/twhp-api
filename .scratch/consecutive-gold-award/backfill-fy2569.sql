-- =============================================================================
-- Backfill FY2569 awards into "Awards"
-- FY2569 = 1 Oct 2025 – 30 Sep 2026
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
-- Grading rule = the rule deployed while the auditors worked, i.e. exactly what
-- the Score Report and the finalize email showed:
--   gold        every category > 80, total >= 90, every special > 0 answer = '3'
--   silver      every category > 60, total >= 80
--   certificate total >= 60
--   joined      otherwise
-- plus one upgrade: gold + a gold-tier award in FY2566  =>  consec-gold.
-- (The FY2569 gold gate already requires every special == 2 answer = '3', so
-- the consec-gold special condition is satisfied automatically.)
--
-- Percentages reproduce scoreHelpers.ts exactly: float division, then
-- Math.round. 'n/a' is excluded from both numerator and denominator. An empty
-- category scores 0.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Step 0 — FY2566–FY2568 golds (you, by hand). Template:
-- -----------------------------------------------------------------------------
-- INSERT INTO "Awards" (factory_id, fiscal_year, grade, cover_id) VALUES
--   (1024, 2566, 'gold', NULL),
--   (1187, 2567, 'gold', NULL)
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
  WHERE e.enroll_date >= '2025-10-01 00:00:00'
    AND e.enroll_date <  '2026-10-01 00:00:00'
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
  WHERE e.enroll_date >= '2025-10-01 00:00:00'
    AND e.enroll_date <  '2026-10-01 00:00:00'
    AND latest.status = 'finished'
),
sums AS (
  SELECT
    fc.cover_id,
    fc.factory_id,
    -- achieved points and scored count, per group ('n/a' excluded)
    sum(a.selected_choice::text::int) FILTER (WHERE a.selected_choice <> 'n/a')                                  AS t_sum,
    count(*)                          FILTER (WHERE a.selected_choice <> 'n/a')                                  AS t_cnt,
    sum(a.selected_choice::text::int) FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Collaborate')   AS c_sum,
    count(*)                          FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Collaborate')   AS c_cnt,
    sum(a.selected_choice::text::int) FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Disease')       AS d_sum,
    count(*)                          FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Disease')       AS d_cnt,
    sum(a.selected_choice::text::int) FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Safety')        AS s_sum,
    count(*)                          FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Safety')        AS s_cnt,
    sum(a.selected_choice::text::int) FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Mental')        AS m_sum,
    count(*)                          FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Mental')        AS m_cnt,
    sum(a.selected_choice::text::int) FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Outcome')       AS o_sum,
    count(*)                          FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Outcome')       AS o_cnt,
    -- old gold gate: every special > 0 answer is '3' ('n/a' fails); no special answers => true
    coalesce(bool_and(a.selected_choice = '3') FILTER (WHERE q.special > 0), true)                               AS special_ok
  FROM fy_covers fc
  LEFT JOIN "Answers"   a ON a.cover_id = fc.cover_id
  LEFT JOIN "Questions" q ON q.id = a.question_id
  GROUP BY fc.cover_id, fc.factory_id
),
pct AS (
  -- Math.round((achieved / (3 * count)) * 100), in IEEE double like JavaScript
  SELECT
    cover_id, factory_id, special_ok,
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
      WHEN least(collaborate, disease, safety, mental, outcome) > 80 AND total >= 90 AND special_ok
        THEN CASE WHEN EXISTS (
                    SELECT 1 FROM "Awards" aw
                    WHERE aw.factory_id = p.factory_id
                      AND aw.fiscal_year = 2566
                      AND aw.grade IN ('gold', 'consec-gold'))
                  THEN 'consec-gold' ELSE 'gold' END
      WHEN least(collaborate, disease, safety, mental, outcome) > 60 AND total >= 80 THEN 'silver'
      WHEN total >= 60 THEN 'certificate'
      ELSE 'joined'
    END AS grade
  FROM pct p
)
SELECT factory_id, cover_id, total, collaborate, disease, safety, mental, outcome, special_ok, grade
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
  WHERE e.enroll_date >= '2025-10-01 00:00:00'
    AND e.enroll_date <  '2026-10-01 00:00:00'
    AND latest.status = 'finished'
),
sums AS (
  SELECT
    fc.cover_id,
    fc.factory_id,
    sum(a.selected_choice::text::int) FILTER (WHERE a.selected_choice <> 'n/a')                                  AS t_sum,
    count(*)                          FILTER (WHERE a.selected_choice <> 'n/a')                                  AS t_cnt,
    sum(a.selected_choice::text::int) FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Collaborate')   AS c_sum,
    count(*)                          FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Collaborate')   AS c_cnt,
    sum(a.selected_choice::text::int) FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Disease')       AS d_sum,
    count(*)                          FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Disease')       AS d_cnt,
    sum(a.selected_choice::text::int) FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Safety')        AS s_sum,
    count(*)                          FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Safety')        AS s_cnt,
    sum(a.selected_choice::text::int) FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Mental')        AS m_sum,
    count(*)                          FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Mental')        AS m_cnt,
    sum(a.selected_choice::text::int) FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Outcome')       AS o_sum,
    count(*)                          FILTER (WHERE a.selected_choice <> 'n/a' AND q.category = 'Outcome')       AS o_cnt,
    coalesce(bool_and(a.selected_choice = '3') FILTER (WHERE q.special > 0), true)                               AS special_ok
  FROM fy_covers fc
  LEFT JOIN "Answers"   a ON a.cover_id = fc.cover_id
  LEFT JOIN "Questions" q ON q.id = a.question_id
  GROUP BY fc.cover_id, fc.factory_id
),
pct AS (
  SELECT
    cover_id, factory_id, special_ok,
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
      WHEN least(collaborate, disease, safety, mental, outcome) > 80 AND total >= 90 AND special_ok
        THEN CASE WHEN EXISTS (
                    SELECT 1 FROM "Awards" aw
                    WHERE aw.factory_id = p.factory_id
                      AND aw.fiscal_year = 2566
                      AND aw.grade IN ('gold', 'consec-gold'))
                  THEN 'consec-gold' ELSE 'gold' END
      WHEN least(collaborate, disease, safety, mental, outcome) > 60 AND total >= 80 THEN 'silver'
      WHEN total >= 60 THEN 'certificate'
      ELSE 'joined'
    END AS grade
  FROM pct p
)
INSERT INTO "Awards" (factory_id, fiscal_year, grade, cover_id)
SELECT factory_id, 2569, grade::"Grades", cover_id
FROM graded
ON CONFLICT (factory_id, fiscal_year) DO NOTHING
RETURNING factory_id, grade, cover_id;

-- COMMIT;     -- run after checking the RETURNING rows
-- ROLLBACK;   -- or this, if anything is wrong


-- -----------------------------------------------------------------------------
-- Step 5 — Verify. Both counts must match.
-- -----------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM "Awards" WHERE fiscal_year = 2569) AS fy2569_awards,
  (SELECT count(*)
     FROM "Covers" c
     JOIN "Enrolls" e ON e.id = c.enroll_id
     JOIN LATERAL (
       SELECT cl.status FROM "CoverLogs" cl
       WHERE cl.cover_id = c.id ORDER BY cl.id DESC LIMIT 1
     ) latest ON true
    WHERE e.enroll_date >= '2025-10-01 00:00:00'
      AND e.enroll_date <  '2026-10-01 00:00:00'
      AND latest.status = 'finished') AS fy2569_finished_covers;

SELECT grade, count(*) FROM "Awards" WHERE fiscal_year = 2569 GROUP BY grade ORDER BY grade;
