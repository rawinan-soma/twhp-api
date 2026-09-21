SET session_replication_role = replica;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT column_name FROM information_schema.columns WHERE table_name='Enrolls' AND is_nullable='NO' AND column_default IS NULL LOOP
    EXECUTE format('ALTER TABLE "Enrolls" ALTER COLUMN %I DROP NOT NULL', r.column_name);
  END LOOP; END $$;
-- Questions: 9 ordinary per category, plus special 1 (Collaborate), 2 (Outcome), 3 (Disease)
INSERT INTO "Questions" (id, category, question_text, standard, choice_1, choice_2, choice_3, special)
SELECT ord*100+n, cat::"QuestionCategories", 'q', '{}', 'a','b','c', 0
FROM (VALUES ('Collaborate',1),('Disease',2),('Safety',3),('Mental',4),('Outcome',5)) c(cat,ord), generate_series(1,9) n;
INSERT INTO "Questions" (id, category, question_text, standard, choice_1, choice_2, choice_3, special) VALUES
 (9001,'Collaborate','s1','{}','a','b','c',1),
 (9002,'Outcome','s2','{}','a','b','c',2),
 (9003,'Disease','s3','{}','a','b','c',3);
-- scenarios: factory, s1, s2, s3, ordinary choice, fy2566 gold?
CREATE TEMP TABLE scen(f int, s1 text, s2 text, s3 text, ord text, hist bool);
INSERT INTO scen VALUES
 (1,'3','3','3','3',false),   -- gold
 (2,'3','3','3','3',true),    -- consec-gold
 (3,'3','3','0','3',false),   -- special3 below 3, no history      -> gold
 (4,'3','3','n/a','3',true),  -- special3 n/a, history             -> consec-gold
 (5,'3','2','3','3',true),    -- special2 below 3, history         -> gold
 (6,'3','n/a','3','3',true),  -- special2 n/a, history             -> gold
 (7,'2','3','3','3',true),    -- special1 at 2                     -> silver
 (8,'n/a','3','3','3',true),  -- special1 n/a                      -> silver
 (9,'0','3','3','3',false),   -- special1 at 0                     -> silver
 (10,'1','3','3','3',true),   -- special1 at 1                     -> silver
 (11,'0','0','0','0',false),  -- everything 0                      -> joined
 (12,'3','3','3','2',false);  -- 67% overall: certificate? (see result)
INSERT INTO "Enrolls" (id, enroll_date, factory_id) SELECT f, '2026-01-15', f FROM scen;
INSERT INTO "Covers" (id, enroll_id) SELECT f, f FROM scen;
INSERT INTO "CoverLogs" (cover_id, status) SELECT f, 'in_progress' FROM scen;
INSERT INTO "CoverLogs" (cover_id, status) SELECT f, 'in_review' FROM scen;
INSERT INTO "CoverLogs" (cover_id, status) SELECT f, 'finished' FROM scen;
INSERT INTO "Answers" (question_id, cover_id, "selectedChoice")
SELECT q.id, s.f, s.ord::"Choices" FROM scen s, "Questions" q WHERE q.special = 0;
INSERT INTO "Answers" (question_id, cover_id, "selectedChoice") SELECT 9001, f, s1::"Choices" FROM scen;
INSERT INTO "Answers" (question_id, cover_id, "selectedChoice") SELECT 9002, f, s2::"Choices" FROM scen;
INSERT INTO "Answers" (question_id, cover_id, "selectedChoice") SELECT 9003, f, s3::"Choices" FROM scen;
INSERT INTO "Awards" (factory_id, fiscal_year, grade, cover_id) SELECT f, 2023, 'gold', NULL FROM scen WHERE hist;
