# Verifying backfill-fy2569.sql against computeGrade (ticket 05)

Disposable database only — never a real one.

```bash
docker run -d --rm --name bf-pg -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=bf -p 55432:5432 postgres:17-alpine
export DATABASE_URL=postgres://postgres:pw@localhost:55432/bf PGPASSWORD=pw
bun ./node_modules/.bin/drizzle-kit push --force
psql -h localhost -p 55432 -U postgres bf -v ON_ERROR_STOP=1 -q -f .scratch/consecutive-gold-award/verify/fixture.sql
# Step 3 (preview) of backfill-fy2569.sql -> "factory,grade" per Cover, then compare with computeGrade:
psql -h localhost -p 55432 -U postgres bf -At -F, -c "select 'A', a.cover_id, a.\"selectedChoice\"::text, q.category::text, q.special from \"Answers\" a join \"Questions\" q on q.id=a.question_id union all select 'H', factory_id, '', '', 0 from \"Awards\" where fiscal_year=2023 and grade in ('gold','consec-gold')" | bun .scratch/consecutive-gold-award/verify/expected.ts | sort -n
docker rm -f bf-pg
```

`fixture.sql` seeds 12 finished FY2569 Covers (factory id = cover id). Expected grades:
1 gold · 2 consec-gold · 3 gold (special 3 = 0) · 4 consec-gold (special 3 = n/a) ·
5 gold (special 2 = 2) · 6 gold (special 2 = n/a) · 7–10 silver (special 1 = 2, n/a, 0, 1) ·
11 joined · 12 certificate. Run steps 3 and 4 of the SQL and diff both against the harness output.
