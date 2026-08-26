---
run: run-twhp-elysia-011
work_item: admin-list-email-field
intent: admin-factory-email
generated: 2026-08-26T02:40:00Z
mode: autopilot
---

# Implementation Walkthrough: Add account email to the Admin factory list response

## Summary

`GET /twhp/api/admins/factories` now returns each factory's registered login email
(`accounts.email`) alongside the `username` it already returned. The Provincial Officer and
Evaluator factory lists are unchanged and deliberately do not expose it.

The production change is two lines. Nearly all of the work in this run went into proving the second
half of the requirement — that the field lands on exactly one of the three endpoints and stays there.

## Structure Overview

The three factory-list endpoints share one Drizzle projection and one TypeBox item schema, with the
Admin variant composing extra fields on top of both:

```text
              factoryListColumns  (service/factory.ts:18)   ← 15 shared columns
                       │
      ┌────────────────┼────────────────┐
      │                │                │
  getAllFactories   ByRegion      ByProvinceId
  + username        (bare)         (bare)
  + email  ◄── NEW
      │                │                │
  Admin route      Evaluator       Provincial
  AdminFactory     FactoryList     ProvincialFactory
  ListItemSchema   ItemSchema      ListItemSchema
  + username       (bare)          (non-null names)
  + email  ◄── NEW
```

The change is made at the two points where the Admin variant already diverges. Nothing shared moved.

## Architecture

### Pattern Used

Existing layered pattern, unchanged: Drizzle projection in the service → TypeBox DTO in
`src/schema/` → route declares it as its response schema. Both layers had to change, for a reason
worth stating plainly: **Elysia strips response properties the declared schema does not name.** The
service edit alone would have produced a value that never reached the client; the schema edit alone
would have declared a field the query never produced. Neither half is optional, and the tests check
each independently.

### Why the field is not on the shared projection

`getAllFactoriesByProvinceId` and `getAllFactoriesByRegion` do not join `accounts`. Adding
`accounts.email` to `factoryListColumns` would raise in Drizzle for those two queries — and if it
somehow did not, it would silently hand factory login emails to two roles the intent excludes.
The Admin query is the only one that already joins `accounts` (it does so for `username`), so the
new column rides a join that was already paid for: no extra query, no change to `countFactories`,
no change to the `enrollExists` predicate.

## Files Changed

### Created

| File | Purpose |
|------|---------|
| (none) | |

### Modified

| File | Changes |
|------|---------|
| `src/service/factory.ts` | `getAllFactories` — added `email: accounts.email` to the Admin-only select literal (1 line). |
| `src/schema/factory.ts` | `AdminFactoryListItemSchema` — added `email: t.String()`, plus a comment recording why it is Admin-only. |
| `src/service/factory-pagination.integration.test.ts` | Added Story 011: 6 DB-backed tests and 3 route-schema introspection tests. |

## The change

```ts
// src/service/factory.ts — getAllFactories
.select({ username: accounts.username, email: accounts.email, ...factoryListColumns })

// src/schema/factory.ts
export const AdminFactoryListItemSchema = t.Composite([
  t.Object({ username: t.String(), email: t.String() }),
  FactoryListItemSchema,
]);
```

`email` is `t.String()` and not `t.Nullable(t.String())` because `accounts.email` is
`text().notNull()` with a unique index (`src/drizzle/schema.ts:240`) — the same reasoning that makes
`username` non-nullable on this composite.

## How it was verified

**Nine new tests, in two groups.**

Six run against the live database and check the service output: every Admin item carries a non-empty
email; the value is the item's *own* account address (`test_pagination_{id}@test.com`), not a
neighbour's, which is what would break if the join ever paired the wrong row; and the Evaluator and
Provincial lists carry neither `email` nor `username`.

Three need no database and read the routes' *registered* response schemas directly — the layer that
decides whether Elysia strips the field. This mirrors the introspection approach already used in
`pagination-routes.test.ts`, and for the same reason given there: an HTTP request would be answered
by the guard before the response schema was ever consulted.

**Each edit was proven load-bearing.** Reverting the service line fails 4 of the 6 DB-backed tests
(`Received: undefined`); reverting the schema line fails the Admin route-schema test. Both were
restored and the suite re-run green. Without this step the tests would be assertions that something
already true is true.

**A vacuous-pass hole was found and closed in review.** The route-schema helper originally ended in
`?? {}`. Two of its three tests assert *absence*, and an empty object satisfies absence for the wrong
reason — so a future change to `Paginated`'s nesting would have turned the two most important guards
(email must not leak to the other roles) into tests of nothing, while only the Admin test failed.
The helper now throws if it cannot read the item properties.

**Suite**: 392 pass, 0 fail (383 before this run). `tsc --noEmit` reports the same 18 pre-existing
errors as before, none in any file this run touched. Biome applied one formatting fix.

## Notes for the reviewer

- The `docs/requirements-traceability.xlsx` modification in `git status` predates this run and was
  not made here.
- The FIRE scripts need the `yaml` npm package, which this project does not depend on. It was
  installed into the session scratchpad and reached via `NODE_PATH` rather than being added to
  `package.json` — the project's dependencies and lockfile are untouched. Anyone re-running these
  scripts will need to do the same, or add `yaml` as a devDependency.
- Not done, by explicit decision: `factories.safetyOfficerEmail` remains unexposed, and the
  single-factory detail endpoint was not changed.

---
*Generated by specs.md - fabriqa.ai FIRE Flow Run run-twhp-elysia-011*
