# Code Review Report

**Run**: run-twhp-elysia-011
**Intent**: admin-factory-email
**Reviewed**: 2026-08-26T02:35:00Z
**Files Reviewed**: 3

---

## Summary

| Category | Auto-Fixed | Applied | Skipped |
|----------|------------|---------|---------|
| Code Quality | 1 | 0 | 0 |
| Security | 0 | 0 | 0 |
| Architecture | 0 | 0 | 1 |
| Testing | 0 | 1 | 0 |
| **Total** | **1** | **1** | **1** |

**Tests Status**: Passing (392/392, full suite re-run after every change below)

---

## Files Reviewed

- `src/service/factory.ts` (modified)
- `src/schema/factory.ts` (modified)
- `src/service/factory-pagination.integration.test.ts` (modified)

---

## Auto-Fixed Issues

### 1. [Code Quality] Formatter line-length violation in the new test helper

- **File**: `src/service/factory-pagination.integration.test.ts:399`
- **Description**: `bunx biome check --write` (the project linter, configured via `biome.json`) reflowed a ternary that exceeded the line limit. Mechanical, non-semantic.
- **Diff**:

```diff
-  const ok = response?.type === undefined && response?.[200] !== undefined ? response[200] : response;
+  const ok =
+    response?.type === undefined && response?.[200] !== undefined ? response[200] : response;
```

Biome reported 3 remaining warnings, all pre-existing `noNonNullAssertion` suggestions in fixture
setup code this run did not touch. They were left alone — `--write --unsafe` would have rewritten
`district!.districtId` to `district?.districtId`, which changes behaviour in a fixture that relies
on the assertion.

---

## Applied Suggestions

### 1. [Testing] `itemSchemaOf` could make the two negative assertions pass vacuously

- **File**: `src/service/factory-pagination.integration.test.ts:390`
- **Description**: The helper ended in `?? {}`. Two of the three route-schema tests assert that
  `email` and `username` are **absent** — and an empty object satisfies that for entirely the wrong
  reason. If `Paginated`'s nesting ever changed, or a route stopped declaring a 200 schema, the
  extraction would quietly yield `{}` and both tests would keep passing while testing nothing.
  Only the Admin test (which asserts presence) would have failed, so the regression this work item
  most needs guarded — `email` leaking to the Evaluator or Provincial roles — would have lost its
  guard silently.
- **Rationale**: A test that cannot fail is worse than no test, because it reads as coverage. Fail
  loudly at the extraction point instead.
- **Risk Level**: Low — affects test code only; the three tests pass unchanged afterwards.
- **Diff**:

```diff
-  return ok?.properties?.items?.items?.properties ?? {};
+  const props = ok?.properties?.items?.items?.properties;
+  if (!props || Object.keys(props).length === 0) {
+    throw new Error(`could not read list-item properties from the 200 response of ${modPath}`);
+  }
+  return props;
```

---

## Skipped Suggestions

### 1. [Architecture] Should `email` live on the shared `factoryListColumns` instead?

- **File**: `src/service/factory.ts:18`
- **Observation**: Placing `email` at the `getAllFactories` call site rather than in the shared
  projection constant means the Admin variant now composes two fields inline. A reviewer might read
  that as duplication worth hoisting.
- **Why skipped**: Hoisting it would be actively wrong on two counts. `getAllFactoriesByProvinceId`
  and `getAllFactoriesByRegion` consume the same constant and do **not** join `accounts` — Drizzle
  would raise on a column with no corresponding table in the query. And even if they did join it,
  the change would hand factory login emails to the Provincial Officer and Evaluator roles, which
  the intent explicitly rules out. The inline placement is the design, not an oversight; it now
  carries a comment on `AdminFactoryListItemSchema` saying so, and AC4/AC5 fail if anyone tries.
- **Decision**: No change. Deliberate.

---

## Security Notes

`accounts.email` is account-identifying data with a unique constraint, so exposing it also exposes a
login identifier. Three things bound that exposure, and all three were verified rather than assumed:

1. The route sits behind `adminGuard` (`src/routes/admins/factories/index.ts:12`) — unchanged by
   this run.
2. The field reaches exactly one of the three factory-list endpoints. Proven from both directions:
   at the service layer (Story 011 AC4/AC5) and at the route-schema layer.
3. No logging path was touched, so the address is not written to request logs.

No hardcoded secrets, no injection surface (the value is a projected column, not interpolated), and
no new user input is accepted by this change.

---

## Verdict

Approved. One mechanical fix, one test-hardening fix, one suggestion correctly declined. The
production diff is two lines plus comments; the risk is concentrated entirely in *who* can see the
field, which is guarded by tests that were each proven to fail without the change.
