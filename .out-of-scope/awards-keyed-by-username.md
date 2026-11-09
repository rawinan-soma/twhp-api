# Awards keyed by username

`Awards` stays keyed by `factory_id` (integer FK to `Factories.account_id`). It is not re-keyed to a
plain `username` column.

## Why this is out of scope

Re-keying would drop the FK, so the database stops checking that an awarded factory exists, and a
mistyped username silently loses a factory's history (no lockout, no `consec-gold`). It also touches
the one reader (`src/service/awardHistory.ts`), the enrolment lockout, the finalize writer, about 67
test references, the backfill SQL, and ADR-0014, and needs a hand-run production schema change
because production never runs `db:push`.

The only gain was recording FY2566–68 gold winners who have no account yet. That is covered by
backfilling existing factories by account id and inserting each remaining winner's rows by account id
when they register, before they enrol or are finalized. Keep a list of the unmatched winners
(username, years) so nobody is missed.

## Prior requests

- `.scratch/consecutive-gold-award/issues/06-awards-keyed-by-username.md`: "Change factory id from
  account id to username" (2026-11-04)
