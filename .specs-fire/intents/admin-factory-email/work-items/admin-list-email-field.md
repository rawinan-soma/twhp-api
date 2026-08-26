---
id: admin-list-email-field
title: Add account email to the Admin factory list response
intent: admin-factory-email
complexity: low
mode: autopilot
status: completed
depends_on: []
created: 2026-08-26T00:00:00Z
run_id: run-twhp-elysia-011
completed_at: 2026-08-26T02:21:49.694Z
---

# Work Item: Add account email to the Admin factory list response

## Description

Add `email` (from `accounts.email`) to the Admin all-factories list — both the Drizzle projection
in the service and the TypeBox response schema the route declares. Scope is the Admin variant only;
the Provincial Officer and Evaluator lists keep the shared projection untouched.

## Acceptance Criteria

- [ ] `getAllFactories` in `src/service/factory.ts` selects `email: accounts.email` alongside the existing `username: accounts.username`, without modifying the shared `factoryListColumns` constant.
- [ ] `AdminFactoryListItemSchema` in `src/schema/factory.ts` declares `email: t.String()` (non-nullable, matching the notNull column).
- [ ] `GET /twhp/api/admins/factories` returns `email` for every item; a request as a non-admin role is still rejected by `adminGuard`.
- [ ] `FactoryListItemSchema` and `ProvincialFactoryListItemSchema` are byte-for-byte unchanged, and the Provincial/Evaluator responses do not gain an `email` field.
- [ ] Pagination (`total`, `page`, `limit`), `orderBy(asc(factories.accountId))`, and the `validated` / `enrolled` predicates behave exactly as before.
- [ ] `bun run dev` starts clean and the endpoint's entry in `/twhp/api/document` shows the new field.

## Technical Notes

Two edits, both narrow:

1. `src/service/factory.ts` — in `getAllFactories` (~line 275):
   `.select({ username: accounts.username, email: accounts.email, ...factoryListColumns })`
   The `.innerJoin(accounts, eq(factories.accountId, accounts.id))` is already present for
   `username`, so no join or `countFactories` change is needed.

2. `src/schema/factory.ts` — `AdminFactoryListItemSchema`:
   `t.Composite([t.Object({ username: t.String(), email: t.String() }), FactoryListItemSchema])`

Elysia strips undeclared fields from responses, so the schema edit is required for the value to
reach the client — the service change alone is not sufficient.

Do NOT touch `factoryListColumns`: it is shared by `getAllFactoriesByProvinceId` and
`getAllFactoriesByRegion`, neither of which joins `accounts`. Adding the column there would both
break those queries and leak the address to two other roles.

## Dependencies

(none)
