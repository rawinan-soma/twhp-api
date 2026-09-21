# Testing Standards

## Overview

Derived from `docs/testing.md` during the AI-DLC → FIRE migration on 2026-08-20. That document
describes the repository as verified on 2026-07-15 and explicitly does **not** imply the full suite
is green — treat a passing claim as requiring fresh evidence, not inheritance.

Note that `package.json` still declares `"test": "echo ... && exit 1"`. There is no aggregate test
command; tests are run per-file through the Bun runner.

## Testing Framework

**Framework**: `bun:test` (Bun's built-in runner)
**Runner**: `bun test <path>`

## Test Types

| Type | Tool | Location | When to Use |
|------|------|----------|-------------|
| Isolated unit | `bun:test` | `src/**/*.test.ts` | Pure logic, helpers, schema shapes |
| HTTP component | `bun:test` + Elysia handle | `src/**/*.test.ts` | Route composition, guards, validation, status codes |
| Schema | `bun:test` + TypeBox | `src/schema/**` | DTO validation, coercion, rejection of malformed input |
| PostgreSQL integration | `bun:test` + live DB | `src/service/*.integration.test.ts` | Query correctness, joins, pagination totals, fiscal-year scoping |

## Coverage Requirements

**Target**: no numeric threshold is enforced in this repository.
**Enforcement**: none automated — coverage is argued per change, not measured.

**Critical paths that MUST have coverage:**

- Fiscal-year boundaries — Bangkok Sep 30 / Oct 1, leap years, host-timezone independence, and
  query scoping across enroll, Cover, answer, score, and factory services (`docs/testing.md:118`)
- Authorization: role guards, region and province scoping, evaluator level distinctions
- Pagination: `meta.total` versus page agreement under every filter combination
- Cover status transitions and the latest-log-wins rule (greatest `CoverLogs.id`, never a timestamp)
- Any change to `src/utils.ts` fiscal-year derivation, which is contract-level for the whole system

## Test Naming

**Pattern**: `<subject>.test.ts` for isolated tests, `<subject>.integration.test.ts` for tests
requiring a live PostgreSQL connection.

**Examples**:

- `factory-pagination.integration.test.ts` — pagination behaviour against a real database
- `answer.integration.test.ts` — answer write paths with transactional cleanup

## Test Structure

```ts
import { describe, expect, it } from "bun:test";

describe("subject", () => {
  it("states the expected behaviour, not the implementation", () => {
    expect(actual).toBe(expected);
  });
});
```

## Mock Strategy

**Approach**: Prefer real collaborators over mocks. Services are created through
`createXxxService(database)` factories precisely so a test or alternate database can be injected
without mocking the module.

**Guidelines**:

- Inject a test database through the service factory rather than mocking Drizzle
- Do not mock time implicitly — where a boundary matters, the clock must be an explicit seam
- MinIO and SMTP are the boundaries worth faking; the database generally is not

## Test Data

**Strategy**: Seed from `seed_data/` (CSV + JSON) via `bun run db:seed`, then create per-test rows
and clean them up explicitly.

**Guidelines**:

- Integration tests delete the rows they create, in dependency order (see `answer.integration.test.ts`)
- The 11 `standardTypes` enum values must stay in sync with `seed_data/questions.json`
- Fiscal-year fixtures must be constructed relative to a resolved window, never hard-coded dates

## Running Tests

```bash
# Run a single test file
bun test src/service/answer.integration.test.ts

# Run all tests under a directory
bun test src/service

# Watch mode
bun test --watch src/service/answer.integration.test.ts

# NOTE: `bun run test` is intentionally not wired up (package.json exits 1).
```

## CI/CD Integration

CI/CD integration is not configured in this repository. Test evidence is produced by running the
relevant files directly and reporting the actual output, including skips and their reasons.

---
*Migrated from AI-DLC standards by specs.md - fabriqa.ai FIRE Flow*
