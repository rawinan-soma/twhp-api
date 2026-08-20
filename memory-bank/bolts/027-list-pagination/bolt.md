---
id: 027-list-pagination
unit: 001-list-pagination
intent: 012-list-pagination
type: ddd-construction-bolt
status: complete
stories:
  - 007-score-status-sql-pushdown
  - 008-page-scoped-answer-fanout
  - 009-score-list-pagination
created: 2026-08-19T02:20:30.000Z
started: 2026-08-20T02:57:10.000Z
completed: "2026-08-20T06:11:37Z"
current_stage: null
stages_completed:
  - name: domain-model
    completed: 2026-08-20T04:02:47.000Z
    artifact: ddd-01-domain-model.md
  - name: technical-design
    completed: 2026-08-20T04:29:37.000Z
    artifact: ddd-02-technical-design.md
  - name: adr-analysis
    completed: 2026-08-20T04:31:23.000Z
    artifact: docs/adr/0011 + amendment to docs/adr/0010
  - name: implement
    completed: 2026-08-20T04:48:15.000Z
    artifact: coverStatus.ts shape B + score service/schema/routes
requires_bolts:
  - 025-list-pagination
  - 026-list-pagination
enables_bolts:
  - 028-list-pagination
requires_units: []
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 3
---

# Bolt: 027-list-pagination

## Overview

Move the Score Report status filter into SQL, restrict the Answer read to the requested page, then
paginate the three Score Report list endpoints.

## Objective

Rewrite `buildScoreReports` and its three caller queries so PostgreSQL excludes `in_progress` Covers,
then read Answers only for the Covers on the page. This removes the largest memory cost in the API:
roughly one hundred and twenty three thousand Answer rows per nationwide request today, against
roughly eight hundred after the change. Finish by applying the shared pagination contract to the
Admin, Evaluator, and Provincial Officer Score Report lists.

## Stories Included

- **007-score-status-sql-pushdown**: Exclude non-scorable Covers by SQL predicate (Must)
- **008-page-scoped-answer-fanout**: Read Answers for the page's Covers only (Must)
- **009-score-list-pagination**: Paginate the three Score Report list endpoints (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. Domain Model**: Pending → `ddd-01-domain-model.md`
- [ ] **2. Technical Design**: Pending → `ddd-02-technical-design.md`
- [ ] **3. ADR Analysis**: Pending/optional → only if the Score Report read model is restructured beyond the status and page changes
- [ ] **4. Implement**: Pending → status pushdown, page-scoped Answer read, Score route and service pagination
- [ ] **5. Test**: Pending → `ddd-03-test-report.md`

## Dependencies

### Requires

- **025-list-pagination** (Required): supplies the query schema, envelope, page helper, and the
  Score Report total order.
- **026-list-pagination** (Required, blocking): exports `src/service/coverStatus.ts`, which this
  bolt **must import**. See the review gate below.

### Enables

- 028-list-pagination

## Expected Outputs

- Score Report Cover selection that excludes `in_progress` Covers in the SQL predicate.
- An Answer read bounded by the page size rather than by the size of the data set.
- Three paginated Score Report list endpoints with unchanged item shapes.
- Output-parity tests proving Score, Category Score, and Grade are unchanged per Cover.

## Success Criteria

- [ ] All three stories satisfy every acceptance criterion.
- [ ] Cover status resolved by greatest `CoverLogs.id`, consistent with intents `007` and `011`.
- [ ] `meta.total` equals the number of `in_review` and `finished` Covers in scope.
- [ ] Answer rows read per request bounded by `limit` multiplied by Questions per Cover.
- [ ] Score, Category Score, and Grade output identical to the current implementation.
- [ ] `in_review` items carry `grade: null`; `finished` items carry the computed Grade.
- [ ] Admin `region` and `provinceId` filters unchanged and reflected in `meta.total`.
- [ ] The Factory single Score Report endpoint is untouched.
- [ ] Code and artifacts reviewed.

## Review Gate — shared latest-log-wins resolution

> **Reject if a Cover's current status is derived outside `src/service/coverStatus.ts` in the list
> read paths — `score.ts`, `enroll.ts`, `factory.ts`.**

Scoped to the list read paths, not "anywhere", because a sweep found three further sites in
`answer.ts` and `cover.ts` that this bolt deliberately does not migrate. They are semantically
identical today and sit on a code path the paginated endpoints never reach. See the Amendment section
of docs/adr/0010 and the follow-up in the unit's construction log.

Two independent implementations of "a Cover's current status" is how two subtly different definitions
enter one codebase.

The gate is phrased against the **source of the rule**, not against a SQL fragment. An earlier
wording banned a second `coverLogs` ordering in `src/service/score.ts`, which rejected pre-existing
correct code: the two call sites legitimately need different SQL.

- **Shape A** — many Covers in a list query → `latestCoverLogLateral` (correlated lateral)
- **Shape B** — one known Cover → `latestCoverLogFor` (standalone read)

Both live in `coverStatus.ts`. Both express greatest-`id`-wins. Neither may be reimplemented.

`getScoreByFactory` migrates to shape B as part of this bolt, removing the last second definition.

The helper resolves status only. This bolt still writes its own predicate for the scorable set
(`in_review` and `finished`), because that policy is its own — see ADR-0010.

## Notes

This bolt carries the largest performance benefit and the second of the two risky rewrites. The
scoring calculation itself must not change; only the selection of Covers and the volume of Answers
read. Keep `calculateBreakdown` and `computeGrade` intact.

Preserving the finished-only Grade rule from intent `011-finished-cover-reward-guard` is a hard
requirement, not an incidental behavior.
