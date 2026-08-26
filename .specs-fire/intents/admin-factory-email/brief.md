---
id: admin-factory-email
title: Admin Factory List Exposes Account Email
status: completed
created: 2026-08-26T00:00:00Z
completed_at: 2026-08-26T02:21:49.700Z
---

# Intent: Admin Factory List Exposes Account Email

## Goal

Expose the factory account's registered login email (`accounts.email`) as a field on the
Admin all-factories list response, so an admin reviewing the factory register can see and
contact each factory without a second lookup.

## Users

DOED administrators using `GET /twhp/api/admins/factories`.

## Problem

The Admin factory list already surfaces `username` from the `accounts` join, but not `email`.
An admin who needs to reach a factory — most commonly while approving a pending registration
via `PATCH /admins/factories/validate/:id` — has no address in the payload and must look it up
out of band.

## Success Criteria

- `GET /twhp/api/admins/factories` returns an `email` field for every item in the page.
- The value is `accounts.email` for the factory's own account, matched on `factories.accountId = accounts.id`.
- The declared response schema includes `email`, so it appears in the OpenAPI document at `/twhp/api/document`.
- Pagination envelope, ordering, and the `validated` / `enrolled` filters are unchanged.
- The Provincial Officer and Evaluator factory lists are unchanged.

## Constraints

- **Admin list only.** Do not add email to `getAllFactoriesByProvinceId`, `getAllFactoriesByRegion`,
  or the single-factory detail endpoint. Those are out of scope by explicit decision.
- **`accounts.email`, not `factories.safetyOfficerEmail`.** The safety-officer address is a different
  field with a different meaning and stays unexposed.
- The Admin query already `innerJoin`s `accounts` for `username` — no new join, no extra query cost.
- `accounts.email` is `text().notNull()` in `src/drizzle/schema.ts`, so the field is a non-nullable string.
- The field must be added to the Admin-only projection, NOT to the shared `factoryListColumns`
  in `src/service/factory.ts` — that constant feeds all three list variants.

## Notes

Login email is account-identifying data. This endpoint is already behind `adminGuard`, which is the
appropriate authorization boundary; no additional gating is introduced. The deliberate decision not
to widen the shared projection is what keeps the Provincial and Evaluator roles from gaining access
to it as a side effect.
