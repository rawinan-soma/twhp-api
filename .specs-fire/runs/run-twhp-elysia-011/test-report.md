---
run: run-twhp-elysia-011
work_item: admin-list-email-field
intent: admin-factory-email
generated: 2026-08-26T02:30:00Z
status: passing
---

# Test Report: Add account email to the Admin factory list response

## Summary

| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| New — Story 011 (DB-backed, `factory-pagination.integration`) | 6 | 0 | 0 |
| New — Story 011 (route-schema introspection, no DB) | 3 | 0 | 0 |
| **New total** | **9** | **0** | **0** |
| Full suite (`bun test`) | 392 | 0 | 0 |

The suite was 383 before this work item; the 9 new tests bring it to 392. The DB-backed tests ran
for real against the live `twhp-postgres` container (`Up 42 hours (healthy)`) — confirmed by reading
the JUnit report and finding all six Story 011 cases listed, not skipped. This matters because the
file guards its DB tests behind `describeDb`, which silently degrades to `describe.skip` when no
database is reachable; a green summary alone would not have proved they executed.

## Acceptance Criteria Validation

- ✅ **`getAllFactories` selects `email: accounts.email` beside `username`, without touching `factoryListColumns`** — `src/service/factory.ts:275`. The shared constant is byte-for-byte unchanged (`git diff` shows one changed line in the whole file).
- ✅ **`AdminFactoryListItemSchema` declares `email: t.String()`, non-nullable** — `src/schema/factory.ts:75`. Matches `accounts.email`, which is `text().notNull()` with a unique index.
- ✅ **`GET /admins/factories` returns `email` for every item** — Story 011 AC1 asserts a non-empty string on every returned item; the route-schema test proves the route *declares* it, which is what stops Elysia stripping it.
- ✅ **`adminGuard` still gates the route** — untouched; no guard, middleware, or route wiring was modified.
- ✅ **`FactoryListItemSchema` and `ProvincialFactoryListItemSchema` unchanged; Provincial/Evaluator gain no `email`** — asserted from both ends: at the service layer (AC4, AC5) and at the route-schema layer.
- ✅ **Pagination, ordering, and the `validated` / `enrolled` predicates behave as before** — AC6, plus the 20 pre-existing Story 004 pagination tests still pass unchanged.
- ✅ **OpenAPI document shows the field** — follows from the route's registered 200 response schema, which the introspection test reads directly and confirms contains `email`.

## Tests Written

### DB-backed (`src/service/factory-pagination.integration.test.ts`, Story 011)

- `AC1: every Admin item carries a non-empty email`
- `AC2: the email is the account's own address, not another factory's` — guards against a join that pairs the wrong account
- `AC3: email travels with username — the pair identifies one account`
- `AC4: the Evaluator list does NOT expose email`
- `AC5: the Provincial Officer list does NOT expose email`
- `AC6: adding email did not disturb pagination, ordering, or the validated filter`

### Route-schema introspection (same file, no DB required)

- `the Admin route declares email on its list item, so Elysia will not strip it`
- `the Evaluator route declares neither email nor username`
- `the Provincial Officer route declares neither email nor username`

## Test Commands

```bash
# Full suite
bun test

# This work item's tests
bun test src/service/factory-pagination.integration.test.ts
```

## Verification performed

**Negative controls — both edits proven load-bearing.** A test that passes before the change tests
nothing. Each half was reverted in isolation and the suite re-run:

| Reverted | Result |
|---|---|
| `email: accounts.email` in the service projection | 4 of 6 DB-backed tests fail (`Expected: "test_pagination_99981@test.com" / Received: undefined`) |
| `email: t.String()` in `AdminFactoryListItemSchema` | the Admin route-schema test fails |

Both files were restored and the suite re-run green (29/29 in-file, 392 total).

AC4 and AC5 correctly pass under both reverts — they are negative assertions, and their job is to
fail if `email` ever *appears* on the other two roles, which is the regression this work item most
needs guarded.

**Why explicit property assertions rather than `Value.Check`.** Story 004's AC1–AC3 validate each
response against its `Paginated(...)` schema. TypeBox objects admit additional properties by
default, so those checks pass whether or not `email` is present, and would keep passing if `email`
leaked into the Evaluator or Provincial payloads. They could not have caught either failure mode.

**Type checking**: `bunx tsc --noEmit` reports 18 errors, all pre-existing and all in
`routes/authentication/**` and other test files. Zero in `src/service/factory.ts`,
`src/schema/factory.ts`, or the modified test file. The count is identical before and after.

**Lint**: `bunx biome check --write` applied one formatting fix to the new test code. The 3
remaining warnings are pre-existing `noNonNullAssertion` suggestions in fixture setup, untouched.

## Issues Found

No issues found during testing.

## Ready for Completion

- [x] All tests passing
- [x] Coverage target met — every changed line is exercised, and each is covered by a test proven to fail without it
- [x] All acceptance criteria validated
- [x] No critical issues open

---
*Generated by specs.md - fabriqa.ai FIRE Flow Run run-twhp-elysia-011*
