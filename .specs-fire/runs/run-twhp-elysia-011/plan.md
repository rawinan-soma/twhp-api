---
run: run-twhp-elysia-011
work_item: admin-list-email-field
intent: admin-factory-email
mode: autopilot
checkpoint: none
approved_at: n/a (autopilot — 0 checkpoints)
---

# Implementation Plan: Add account email to the Admin factory list response

## Approach

Two edits, mirroring exactly how `username` is already carried on the Admin variant.

The Admin list query is the only one of the three that `innerJoin`s `accounts` — it does so to
select `username`. `accounts.email` therefore rides along on a join that is already paid for: no
new join, no change to `countFactories`, no change to the `enrollExists` predicate, and no extra
round trip.

The field is added to the **Admin-only** projection literal at the `getAllFactories` call site, and
to `AdminFactoryListItemSchema`. The shared `factoryListColumns` constant and the shared
`FactoryListItemSchema` are deliberately left alone — they feed the Provincial Officer and
Evaluator variants, neither of which joins `accounts`. Widening the shared projection would raise a
Drizzle error on those two queries *and* hand account emails to two roles that were not meant to
have them.

Both edits are required. Elysia strips response properties that the declared schema does not name,
so the service change alone would return nothing visible to the client, and the schema change alone
would declare a field the query never produces.

## Files to Create

| File | Purpose |
|------|---------|
| (none) | |

## Files to Modify

| File | Changes |
|------|---------|
| `src/service/factory.ts` | In `getAllFactories`, add `email: accounts.email` to the Admin-only select literal, beside the existing `username: accounts.username`. `factoryListColumns` untouched. |
| `src/schema/factory.ts` | `AdminFactoryListItemSchema` — add `email: t.String()` to the composed Admin-only object. `FactoryListItemSchema` and `ProvincialFactoryListItemSchema` untouched. |
| `src/service/factory-pagination.integration.test.ts` | Add a "Story 011" describe block asserting the field is present on Admin items and absent from the Evaluator and Provincial items. |

## Tests

| Test File | Coverage |
|-----------|----------|
| `src/service/factory-pagination.integration.test.ts` | Admin items expose `email`; the value equals the seeded `accounts.email`; the Evaluator and Provincial items do **not** carry `email`. |

## Technical Details

**Why explicit assertions rather than relying on `Value.Check`.** The existing AC1–AC3 checks
validate each response against its `Paginated(...)` schema. TypeBox `t.Object` permits additional
properties by default, so those checks would pass whether or not `email` is present, and would keep
passing if `email` leaked into the Provincial or Evaluator payloads. They cannot prove either half
of this work item. The new tests assert the property directly in both directions.

**Nullability.** `accounts.email` is declared `text().notNull()` in `src/drizzle/schema.ts:240`
(and carries a unique index, `Accounts_email_key`). The schema field is therefore `t.String()`, not
`t.Nullable(t.String())` — matching how `username` is declared on the same composite.

**Field ordering.** `email` is placed immediately after `username` in both the projection and the
schema, keeping the two account-derived fields adjacent and preserving the existing convention that
the Admin composite prepends its extra fields before spreading the shared list columns.

**Fixture.** `seedFactory` in the integration test already inserts a deterministic address —
`test_pagination_{accountId}@test.com` — so the value assertion needs no new fixture data.

**Authorization.** The endpoint is already behind `adminGuard`. Login email is account-identifying
data, and confining it to this one route is the entire reason the shared projection is left alone.

## Based on Design Doc

Not applicable — low complexity, autopilot mode, no design doc required.

---
*Autopilot mode — no checkpoint. Plan available for review while execution proceeds.*
